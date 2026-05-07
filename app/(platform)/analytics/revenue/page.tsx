import Link from "next/link";
import { ProposalActivityType, ProposalStatus, QuotationStatus, type PropertyType } from "@prisma/client";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/server/safe-query";
import { getProposalFollowUpState } from "@/lib/proposals/follow-up";

export const dynamic = "force-dynamic";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type DecimalLike = { toString(): string } | number | null | undefined;

type ProposalActivityRow = {
  type: ProposalActivityType;
  createdAt: Date;
};

type ProposalApprovalRow = {
  status: ProposalStatus;
  clientName: string;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
};

type ProposalSignatureRow = {
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  createdAt: Date;
};

type ProposalRow = {
  id: string;
  status: ProposalStatus;
  viewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activities: ProposalActivityRow[];
  approvals: ProposalApprovalRow[];
  signatures: ProposalSignatureRow[];
} | null;

type FollowUpRow = {
  id: string;
  stage: string;
  priority: string;
  status: string;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  clientConcern: string | null;
  clientName: string;
  updatedAt: Date;
};

type BriefRow = {
  id: string;
  clientName: string | null;
  budgetMin: DecimalLike;
  budgetMax: DecimalLike;
  propertyType: PropertyType;
  aiBudgetRisk: string | null;
  aiNextAction: string | null;
  updatedAt: Date;
  boqs: Array<{
    id: string;
    title: string;
    totalCost: DecimalLike;
    totalSellingPrice: DecimalLike;
    grossProfit: DecimalLike;
    grossMargin: DecimalLike;
    aiRiskNotes: string | null;
    updatedAt: Date;
  }>;
} | null;

type ProjectRow = {
  id: string;
  name: string;
  projectType: string;
  propertyType: PropertyType;
  status: string;
  clientName: string;
  siteAddress: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string | null;
  projectedProfit: DecimalLike;
  actualProfit: DecimalLike;
  updatedAt: Date;
} | null;

type RevenueQuotationRow = {
  id: string;
  projectId: string;
  quotationNumber: string;
  issueDate: Date;
  createdAt: Date;
  updatedAt: Date;
  status: QuotationStatus;
  propertyType: PropertyType;
  totalAmount: DecimalLike;
  profitAmount: DecimalLike;
  estimatedCost: DecimalLike;
  marginPercent: DecimalLike;
  clientNameSnapshot: string;
  projectNameSnapshot: string;
  projectAddress1: string;
  projectAddress2: string | null;
  projectPostalCode: string | null;
  designBrief: BriefRow;
  project: ProjectRow;
  followUps: FollowUpRow[];
  proposal: ProposalRow;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_MONTHS = 6;

const PROPERTY_LABELS: Record<PropertyType, string> = {
  HDB: "HDB",
  CONDO: "Condo",
  LANDED: "Landed",
  COMMERCIAL: "Commercial",
  OTHER: "Other",
};

const PIPELINE_STAGES = [
  { key: "QUOTATION", label: "Quotation", tone: "neutral" },
  { key: "SENT", label: "Proposal Sent", tone: "warning" },
  { key: "VIEWED", label: "Viewed", tone: "info" },
  { key: "APPROVED", label: "Approved", tone: "success" },
  { key: "SIGNED", label: "Signed", tone: "success" },
  { key: "LOST", label: "Lost", tone: "danger" },
] as const;

type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

type KpiCardRow = {
  title: string;
  value: string;
  hint: string;
  tone?: Tone;
};

type TrendPoint = {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
};

type PipelineBucket = {
  key: PipelineStageKey;
  label: string;
  tone: Tone;
  count: number;
  value: number;
};

type ValueBucket = {
  label: string;
  detail: string;
  value: number;
};

type MarginBucket = {
  label: string;
  detail: string;
  margin: number;
  totalValue: number;
};

type InsightCardRow = {
  title: string;
  subject: string;
  detail: string;
  badge: string;
  tone: Tone;
  href: string;
  actionLabel: string;
};

type SummaryNote = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

type RevenueAnalyticsData = {
  quotationCount: number;
  summaryText: string;
  summaryNotes: SummaryNote[];
  kpis: KpiCardRow[];
  monthlyQuotation: TrendPoint[];
  monthlyApproved: TrendPoint[];
  pipeline: PipelineBucket[];
  propertyRevenue: ValueBucket[];
  propertyRevenueDescription: string;
  projectMargins: MarginBucket[];
  insights: InsightCardRow[];
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toNumber(value: DecimalLike): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const next = Number(value.toString());
  return Number.isFinite(next) ? next : 0;
}

function formatCurrency(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits,
  }).format(value);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRatioPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatRelativeDays(value: Date | null | undefined, now: Date): string {
  if (!value) return "No date";
  const diffDays = Math.floor((value.getTime() - now.getTime()) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "In 1 day";
  if (diffDays > 1) return `In ${diffDays} days`;
  if (diffDays === -1) return "1 day ago";
  return `${Math.abs(diffDays)} days ago`;
}

function humanizeLabel(value: string): string {
  return value
    .replaceAll(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function hasActivity(activities: ProposalActivityRow[], type: ProposalActivityType): boolean {
  return activities.some((activity) => activity.type === type);
}

function getLatestActivity(activities: ProposalActivityRow[], type: ProposalActivityType): ProposalActivityRow | null {
  let latest: ProposalActivityRow | null = null;
  for (const activity of activities) {
    if (activity.type !== type) continue;
    if (!latest || activity.createdAt.getTime() > latest.createdAt.getTime()) {
      latest = activity;
    }
  }
  return latest;
}

function getPrimaryApproval(row: RevenueQuotationRow): ProposalApprovalRow | null {
  return row.proposal?.approvals[0] ?? null;
}

function getPrimarySignature(row: RevenueQuotationRow): ProposalSignatureRow | null {
  return row.proposal?.signatures[0] ?? null;
}

function isProposalSent(row: RevenueQuotationRow): boolean {
  if (!row.proposal) return false;
  return (
    row.proposal.status !== ProposalStatus.DRAFT ||
    hasActivity(row.proposal.activities, ProposalActivityType.SENT) ||
    Boolean(row.proposal.viewedAt) ||
    Boolean(getPrimaryApproval(row)) ||
    Boolean(getPrimarySignature(row))
  );
}

function isProposalViewed(row: RevenueQuotationRow): boolean {
  if (!row.proposal) return false;
  return Boolean(row.proposal.viewedAt) || hasActivity(row.proposal.activities, ProposalActivityType.VIEWED);
}

function isSigned(row: RevenueQuotationRow): boolean {
  return Boolean(getPrimarySignature(row));
}

function isLost(row: RevenueQuotationRow): boolean {
  if (isSigned(row)) return false;
  const approval = getPrimaryApproval(row);
  return (
    row.status === QuotationStatus.REJECTED ||
    row.status === QuotationStatus.CANCELLED ||
    row.status === QuotationStatus.EXPIRED ||
    row.proposal?.status === ProposalStatus.REJECTED ||
    approval?.status === ProposalStatus.REJECTED
  );
}

function isApproved(row: RevenueQuotationRow): boolean {
  if (isLost(row)) return false;
  if (isSigned(row)) return true;
  const approval = getPrimaryApproval(row);
  return (
    row.status === QuotationStatus.APPROVED ||
    row.proposal?.status === ProposalStatus.APPROVED ||
    approval?.status === ProposalStatus.APPROVED ||
    hasActivity(row.proposal?.activities ?? [], ProposalActivityType.APPROVED)
  );
}

function isPendingProposal(row: RevenueQuotationRow): boolean {
  return Boolean(row.proposal) && isProposalSent(row) && !isApproved(row) && !isSigned(row) && !isLost(row);
}

function getApprovalDate(row: RevenueQuotationRow): Date | null {
  if (!isApproved(row)) return null;
  const approval = getPrimaryApproval(row);
  if (approval?.status === ProposalStatus.APPROVED) {
    return approval.approvedAt ?? approval.createdAt;
  }
  const activity = getLatestActivity(row.proposal?.activities ?? [], ProposalActivityType.APPROVED);
  if (activity) return activity.createdAt;
  if (row.proposal?.status === ProposalStatus.APPROVED) return row.proposal.updatedAt;
  if (row.status === QuotationStatus.APPROVED) return row.updatedAt;
  return getPrimarySignature(row)?.signedAt ?? null;
}

function derivePipelineStage(row: RevenueQuotationRow): PipelineStageKey {
  if (isLost(row)) return "LOST";
  if (isSigned(row)) return "SIGNED";
  if (isApproved(row)) return "APPROVED";
  if (isProposalViewed(row)) return "VIEWED";
  if (isProposalSent(row)) return "SENT";
  return "QUOTATION";
}

function buildClientName(row: RevenueQuotationRow): string {
  return row.clientNameSnapshot.trim() || row.designBrief?.clientName?.trim() || row.project?.clientName?.trim() || "Client pending";
}

function buildProjectName(row: RevenueQuotationRow): string {
  return row.project?.name?.trim() || row.projectNameSnapshot.trim() || row.quotationNumber;
}

function buildProjectType(row: RevenueQuotationRow): string {
  return humanizeLabel(row.project?.projectType?.trim() || "OTHER");
}

function buildQuotationHref(row: RevenueQuotationRow): string {
  return `/projects/${row.projectId}/quotations/${row.id}`;
}

function buildDealHref(row: RevenueQuotationRow): string {
  if (row.proposal) return `/proposals/${row.proposal.id}`;
  return buildQuotationHref(row);
}

function buildLastActivity(row: RevenueQuotationRow): { label: string; at: Date | null } {
  const events: Array<{ label: string; at: Date }> = [
    { label: "Quotation issued", at: row.issueDate },
    { label: "Quotation updated", at: row.updatedAt },
  ];

  if (row.designBrief) {
    events.push({ label: "Design brief updated", at: row.designBrief.updatedAt });
  }

  const latestBoq = row.designBrief?.boqs[0] ?? null;
  if (latestBoq) {
    events.push({ label: "Design BOQ updated", at: latestBoq.updatedAt });
  }

  if (row.proposal) {
    events.push({ label: "Proposal prepared", at: row.proposal.updatedAt });
    for (const activity of row.proposal.activities) {
      events.push({
        label:
          activity.type === ProposalActivityType.SENT
            ? "Proposal sent"
            : activity.type === ProposalActivityType.VIEWED
              ? "Proposal viewed"
              : activity.type === ProposalActivityType.REMINDER_1 ||
                  activity.type === ProposalActivityType.REMINDER_2
                ? "Follow-up sent"
                : "Proposal approved",
        at: activity.createdAt,
      });
    }
  }

  const approval = getPrimaryApproval(row);
  if (approval) {
    events.push({
      label: approval.status === ProposalStatus.REJECTED ? "Client requested changes" : "Proposal approved",
      at: approval.approvedAt ?? approval.rejectedAt ?? approval.createdAt,
    });
  }

  const signature = getPrimarySignature(row);
  if (signature) {
    events.push({ label: "Proposal signed", at: signature.signedAt });
  }

  const latestFollowUp = [...row.followUps].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
  if (latestFollowUp) {
    events.push({ label: "Sales follow-up updated", at: latestFollowUp.updatedAt });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events[0] ?? { label: "No activity", at: null };
}

function createRecentMonths(now: Date, count: number): Array<{ key: string; label: string; fullLabel: string }> {
  const formatter = new Intl.DateTimeFormat("en-SG", { month: "short" });
  const fullFormatter = new Intl.DateTimeFormat("en-SG", { month: "short", year: "numeric" });
  const months: Array<{ key: string; label: string; fullLabel: string }> = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatter.format(date),
      fullLabel: fullFormatter.format(date),
    });
  }

  return months;
}

function buildMonthlySeries(
  rows: RevenueQuotationRow[],
  now: Date,
  getDate: (row: RevenueQuotationRow) => Date | null,
): TrendPoint[] {
  const base = createRecentMonths(now, ROLLING_MONTHS).map((month) => ({ ...month, value: 0 }));
  const index = new Map(base.map((item, idx) => [item.key, idx]));

  for (const row of rows) {
    const date = getDate(row);
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucketIndex = index.get(key);
    if (bucketIndex == null) continue;
    base[bucketIndex].value += toNumber(row.totalAmount);
  }

  return base;
}

function buildPipelineBuckets(rows: RevenueQuotationRow[]): PipelineBucket[] {
  const buckets = PIPELINE_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    tone: stage.tone,
    count: 0,
    value: 0,
  }));

  const index = new Map(buckets.map((bucket, idx) => [bucket.key, idx]));
  for (const row of rows) {
    const key = derivePipelineStage(row);
    const bucketIndex = index.get(key);
    if (bucketIndex == null) continue;
    buckets[bucketIndex].count += 1;
    buckets[bucketIndex].value += toNumber(row.totalAmount);
  }

  return buckets;
}

function buildPropertyRevenueBuckets(rows: RevenueQuotationRow[]): {
  rows: ValueBucket[];
  description: string;
} {
  const signedRows = rows.filter((row) => isSigned(row) && !isLost(row));
  const approvedRows = rows.filter((row) => isApproved(row) && !isLost(row));
  const sourceRows = signedRows.length > 0 ? signedRows : approvedRows;
  const description =
    signedRows.length > 0
      ? "Signed commercial value by property type."
      : "Approved commercial value by property type while signatures are still ramping up.";

  const totals = new Map<PropertyType, { value: number; count: number }>();
  for (const propertyType of Object.keys(PROPERTY_LABELS) as PropertyType[]) {
    totals.set(propertyType, { value: 0, count: 0 });
  }

  for (const row of sourceRows) {
    const propertyType = row.propertyType ?? row.project?.propertyType ?? row.designBrief?.propertyType ?? "OTHER";
    const bucket = totals.get(propertyType) ?? { value: 0, count: 0 };
    bucket.value += toNumber(row.totalAmount);
    bucket.count += 1;
    totals.set(propertyType, bucket);
  }

  return {
    rows: (Object.keys(PROPERTY_LABELS) as PropertyType[])
      .map((propertyType) => {
        const bucket = totals.get(propertyType) ?? { value: 0, count: 0 };
        return {
          label: PROPERTY_LABELS[propertyType],
          detail: bucket.count > 0 ? `${bucket.count} closed/approved deal${bucket.count === 1 ? "" : "s"}` : "No closed value yet",
          value: bucket.value,
        };
      })
      .sort((a, b) => b.value - a.value),
    description,
  };
}

function buildProjectMarginBuckets(rows: RevenueQuotationRow[]): MarginBucket[] {
  const grouped = new Map<string, { value: number; profit: number; count: number }>();

  for (const row of rows) {
    if (isLost(row)) continue;
    const total = toNumber(row.totalAmount);
    if (total <= 0) continue;
    const key = buildProjectType(row);
    const bucket = grouped.get(key) ?? { value: 0, profit: 0, count: 0 };
    bucket.value += total;
    bucket.profit += toNumber(row.profitAmount);
    bucket.count += 1;
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .map(([label, bucket]) => ({
      label,
      detail: `${bucket.count} quotation${bucket.count === 1 ? "" : "s"} · ${formatCurrency(bucket.value)}`,
      margin: bucket.value > 0 ? bucket.profit / bucket.value : 0,
      totalValue: bucket.value,
    }))
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 6);
}

function buildUrgentFollowUpInsight(rows: RevenueQuotationRow[], now: Date): InsightCardRow {
  let best: {
    score: number;
    row: RevenueQuotationRow;
    followUp: FollowUpRow | null;
    detail: string;
    badge: string;
    href: string;
  } | null = null;

  for (const row of rows) {
    if (isLost(row) || isSigned(row)) continue;

    for (const followUp of row.followUps) {
      if (!followUp.nextFollowUpAt) continue;
      const deltaDays = Math.floor((now.getTime() - followUp.nextFollowUpAt.getTime()) / DAY_MS);
      const priorityScore =
        followUp.priority === "HIGH" ? 18 : followUp.priority === "MEDIUM" ? 10 : 4;
      const timingScore = deltaDays >= 0 ? 16 + Math.min(deltaDays, 10) : Math.max(0, 6 + deltaDays);
      const score = priorityScore + timingScore;
      if (!best || score > best.score) {
        best = {
          score,
          row,
          followUp,
          detail:
            deltaDays >= 0
              ? `${followUp.stage} follow-up for ${buildClientName(row)} is overdue by ${deltaDays === 0 ? "today" : `${deltaDays} day${deltaDays === 1 ? "" : "s"}`}.`
              : `${followUp.stage} follow-up for ${buildClientName(row)} is due ${formatRelativeDays(followUp.nextFollowUpAt, now).toLowerCase()}.`,
          badge: deltaDays >= 0 ? `Overdue ${deltaDays === 0 ? "today" : `${deltaDays}d`}` : formatRelativeDays(followUp.nextFollowUpAt, now),
          href: `/design-ai/sales/${followUp.id}`,
        };
      }
    }

    const proposalFollowUp = row.proposal
      ? getProposalFollowUpState({
          status: row.proposal.status,
          activities: row.proposal.activities,
          now,
        })
      : { due: false, kind: null, dueSince: null };

    if (!proposalFollowUp.due || !proposalFollowUp.dueSince) continue;
    const dueDays = Math.max(1, Math.floor((now.getTime() - proposalFollowUp.dueSince.getTime()) / DAY_MS));
    const score = 20 + Math.min(dueDays, 10);
    if (!best || score > best.score) {
      best = {
        score,
        row,
        followUp: null,
        detail:
          proposalFollowUp.kind === "REMINDER_1"
            ? `${buildClientName(row)} has not viewed ${row.quotationNumber} and needs an immediate first reminder.`
            : `${buildClientName(row)} viewed ${row.quotationNumber} but has been idle for ${dueDays} day${dueDays === 1 ? "" : "s"}.`,
        badge: proposalFollowUp.kind === "REMINDER_1" ? "Unviewed" : `Idle ${dueDays}d`,
        href: buildDealHref(row),
      };
    }
  }

  if (!best) {
    return {
      title: "Urgent Follow-up",
      subject: "No urgent follow-up queue",
      detail: "No overdue proposal reminders or overdue sales follow-ups were detected in the live book.",
      badge: "Clear",
      tone: "success",
      href: "/design-ai/sales",
      actionLabel: "Open Sales Assistant",
    };
  }

  return {
    title: "Urgent Follow-up",
    subject: `${buildClientName(best.row)} · ${best.row.quotationNumber}`,
    detail: best.detail,
    badge: best.badge,
    tone: "warning",
    href: best.href,
    actionLabel: "Open Record",
  };
}

function buildLowMarginInsight(rows: RevenueQuotationRow[]): InsightCardRow {
  const candidate = rows
    .filter((row) => !isLost(row) && toNumber(row.totalAmount) > 0)
    .sort((a, b) => toNumber(a.marginPercent) - toNumber(b.marginPercent))[0];

  if (!candidate) {
    return {
      title: "Low Margin Quote",
      subject: "No quotation margin issue detected",
      detail: "Margin signals will appear here once live quotations are available.",
      badge: "Standby",
      tone: "neutral",
      href: "/quotation",
      actionLabel: "Open Quotations",
    };
  }

  const margin = toNumber(candidate.marginPercent);
  const total = toNumber(candidate.totalAmount);
  const estimatedCost = toNumber(candidate.estimatedCost);

  return {
    title: "Low Margin Quote",
    subject: `${candidate.quotationNumber} · ${buildProjectName(candidate)}`,
    detail: `${formatRatioPercent(margin)} gross margin on ${formatCurrency(total)} with ${formatCurrency(estimatedCost)} estimated cost. Review pricing or scope before further discounting.`,
    badge: formatRatioPercent(margin),
    tone: margin < 0.1 ? "danger" : margin < 0.15 ? "warning" : "info",
    href: buildQuotationHref(candidate),
    actionLabel: "Open Quotation",
  };
}

function buildLikelyToCloseInsight(rows: RevenueQuotationRow[], now: Date): InsightCardRow {
  let best: { row: RevenueQuotationRow; score: number; detail: string } | null = null;

  for (const row of rows) {
    if (isLost(row) || isSigned(row) || !row.proposal || !isProposalSent(row)) continue;

    const margin = toNumber(row.marginPercent);
    const viewedAt = row.proposal.viewedAt ?? getLatestActivity(row.proposal.activities, ProposalActivityType.VIEWED)?.createdAt ?? null;
    const approvedAt = getApprovalDate(row);
    const budgetMax = toNumber(row.designBrief?.budgetMax);
    const quoteValue = toNumber(row.totalAmount);
    const proposalFollowUp = getProposalFollowUpState({
      status: row.proposal.status,
      activities: row.proposal.activities,
      now,
    });

    let score = 25;
    if (approvedAt) score += 40;
    if (viewedAt) score += 18;
    if (viewedAt) {
      const viewAgeDays = Math.max(0, Math.floor((now.getTime() - viewedAt.getTime()) / DAY_MS));
      score += Math.max(0, 10 - viewAgeDays);
    }
    if (!proposalFollowUp.due) score += 8;
    if (margin >= 0.18) score += 10;
    if (margin < 0.12) score -= 12;
    if (budgetMax > 0 && quoteValue <= budgetMax * 1.05) score += 8;

    const detail = approvedAt
      ? `Client approval is already logged (${formatDate(approvedAt)}). Signature collection is the main remaining close step.`
      : viewedAt
        ? `Client viewed the proposal ${formatRelativeDays(viewedAt, now).toLowerCase()} and the deal still sits inside margin guardrails.`
        : `Proposal is active with no rejection signal. Keep momentum tight with a scheduled follow-up.`;

    if (!best || score > best.score) {
      best = { row, score, detail };
    }
  }

  if (!best) {
    return {
      title: "Likely To Close",
      subject: "No live close candidate yet",
      detail: "Create or send proposals to populate the close-probability signal.",
      badge: "Pending",
      tone: "neutral",
      href: "/deals",
      actionLabel: "Open Deals",
    };
  }

  return {
    title: "Likely To Close",
    subject: `${buildClientName(best.row)} · ${best.row.quotationNumber}`,
    detail: best.detail,
    badge: `Score ${Math.min(99, best.score)}`,
    tone: best.score >= 70 ? "success" : "info",
    href: buildDealHref(best.row),
    actionLabel: "Open Deal",
  };
}

function buildStalledClientInsight(rows: RevenueQuotationRow[], now: Date): InsightCardRow {
  let best: { row: RevenueQuotationRow; staleDays: number; lastActivity: { label: string; at: Date | null } } | null = null;

  for (const row of rows) {
    if (isLost(row) || isSigned(row)) continue;
    const lastActivity = buildLastActivity(row);
    if (!lastActivity.at) continue;
    const staleDays = Math.floor((now.getTime() - lastActivity.at.getTime()) / DAY_MS);
    if (staleDays < 7) continue;
    if (!best || staleDays > best.staleDays) {
      best = { row, staleDays, lastActivity };
    }
  }

  if (!best) {
    return {
      title: "Client Stalled",
      subject: "No stalled client signal",
      detail: "Recent activity across live quotations is still moving inside the 7-day operating window.",
      badge: "Healthy",
      tone: "success",
      href: "/deals",
      actionLabel: "Open Deals",
    };
  }

  return {
    title: "Client Stalled",
    subject: `${buildClientName(best.row)} · ${best.row.quotationNumber}`,
    detail: `No material movement for ${best.staleDays} day${best.staleDays === 1 ? "" : "s"} since ${best.lastActivity.label.toLowerCase()}. Re-engage before pricing cools.`,
    badge: `${best.staleDays}d idle`,
    tone: best.staleDays >= 14 ? "danger" : "warning",
    href: buildDealHref(best.row),
    actionLabel: "Open Deal",
  };
}

function buildMarginRiskInsight(rows: RevenueQuotationRow[]): InsightCardRow {
  let best: { row: RevenueQuotationRow; score: number; reasons: string[] } | null = null;

  for (const row of rows) {
    if (isLost(row)) continue;

    const reasons: string[] = [];
    let score = 0;

    const margin = toNumber(row.marginPercent);
    if (margin < 0.1) {
      score += 40;
      reasons.push(`quotation margin at ${formatRatioPercent(margin)}`);
    } else if (margin < 0.15) {
      score += 24;
      reasons.push(`quotation margin at ${formatRatioPercent(margin)}`);
    }

    const latestBoq = row.designBrief?.boqs[0] ?? null;
    const boqMargin = toNumber(latestBoq?.grossMargin);
    if (latestBoq?.aiRiskNotes) {
      score += 14;
      reasons.push("BOQ risk notes present");
    }
    if (latestBoq && boqMargin > 0 && boqMargin < 0.15) {
      score += 12;
      reasons.push(`BOQ margin at ${formatRatioPercent(boqMargin)}`);
    }

    const budgetMax = toNumber(row.designBrief?.budgetMax);
    const total = toNumber(row.totalAmount);
    if (budgetMax > 0 && total > budgetMax) {
      const overrunPct = ((total - budgetMax) / budgetMax) * 100;
      score += 18;
      reasons.push(`${overrunPct.toFixed(0)}% above brief budget ceiling`);
    }

    const projectedProfit = toNumber(row.project?.projectedProfit);
    if (row.project && projectedProfit < 0) {
      score += 10;
      reasons.push("projected profit is already negative");
    }

    if (score === 0) continue;

    if (!best || score > best.score) {
      best = { row, score, reasons };
    }
  }

  if (!best) {
    return {
      title: "Project Margin Risk",
      subject: "No major margin leakage detected",
      detail: "Current quotation and BOQ signals stay within the configured commercial guardrails.",
      badge: "Stable",
      tone: "success",
      href: "/projects",
      actionLabel: "Open Projects",
    };
  }

  return {
    title: "Project Margin Risk",
    subject: `${buildProjectName(best.row)} · ${best.row.quotationNumber}`,
    detail: `${best.reasons.join(" · ")}. Tighten value engineering and approval discipline before the deal advances.`,
    badge: "Risk",
    tone: best.score >= 40 ? "danger" : "warning",
    href: buildQuotationHref(best.row),
    actionLabel: "Review Margin",
  };
}

function buildSummaryNotes(params: {
  quotationCount: number;
  averageDealSize: number;
  pendingProposalValue: number;
  pendingProposalCount: number;
  lowMarginCount: number;
  urgentFollowUpCount: number;
  conversionRate: number;
  lostProposalValue: number;
}): SummaryNote[] {
  return [
    {
      label: "Commercial Book",
      value: `${params.quotationCount} live quotation${params.quotationCount === 1 ? "" : "s"}`,
      detail: `Average deal size ${formatCurrency(params.averageDealSize)}.`,
      tone: "info",
    },
    {
      label: "Pending Exposure",
      value: formatCurrency(params.pendingProposalValue),
      detail: `${params.pendingProposalCount} proposal${params.pendingProposalCount === 1 ? "" : "s"} still waiting to close.`,
      tone: params.pendingProposalCount > 0 ? "warning" : "success",
    },
    {
      label: "Risk Watch",
      value: `${params.lowMarginCount} low-margin · ${params.urgentFollowUpCount} urgent`,
      detail: `${formatRatioPercent(params.conversionRate)} conversion with ${formatCurrency(params.lostProposalValue)} already lost.`,
      tone: params.lowMarginCount > 0 || params.urgentFollowUpCount > 0 ? "danger" : "success",
    },
  ];
}

async function getRevenueAnalyticsData(): Promise<RevenueAnalyticsData> {
  const now = new Date();
  const quotations = await safeQuery(
    () =>
      prisma.quotation.findMany({
        where: { isLatest: true },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          projectId: true,
          quotationNumber: true,
          issueDate: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          propertyType: true,
          totalAmount: true,
          profitAmount: true,
          estimatedCost: true,
          marginPercent: true,
          clientNameSnapshot: true,
          projectNameSnapshot: true,
          projectAddress1: true,
          projectAddress2: true,
          projectPostalCode: true,
          designBrief: {
            select: {
              id: true,
              clientName: true,
              budgetMin: true,
              budgetMax: true,
              propertyType: true,
              aiBudgetRisk: true,
              aiNextAction: true,
              updatedAt: true,
              boqs: {
                orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
                take: 1,
                select: {
                  id: true,
                  title: true,
                  totalCost: true,
                  totalSellingPrice: true,
                  grossProfit: true,
                  grossMargin: true,
                  aiRiskNotes: true,
                  updatedAt: true,
                },
              },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              projectType: true,
              propertyType: true,
              status: true,
              clientName: true,
              siteAddress: true,
              addressLine1: true,
              addressLine2: true,
              postalCode: true,
              projectedProfit: true,
              actualProfit: true,
              updatedAt: true,
            },
          },
          followUps: {
            where: { status: "OPEN" },
            orderBy: [{ nextFollowUpAt: "asc" }, { updatedAt: "desc" }],
            take: 5,
            select: {
              id: true,
              stage: true,
              priority: true,
              status: true,
              lastContactedAt: true,
              nextFollowUpAt: true,
              clientConcern: true,
              clientName: true,
              updatedAt: true,
            },
          },
          proposal: {
            select: {
              id: true,
              status: true,
              viewedAt: true,
              createdAt: true,
              updatedAt: true,
              activities: {
                orderBy: [{ createdAt: "desc" }],
                take: 20,
                select: {
                  type: true,
                  createdAt: true,
                },
              },
              approvals: {
                orderBy: [{ createdAt: "desc" }],
                take: 1,
                select: {
                  status: true,
                  clientName: true,
                  approvedAt: true,
                  rejectedAt: true,
                  createdAt: true,
                },
              },
              signatures: {
                orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
                take: 1,
                select: {
                  signerName: true,
                  signerEmail: true,
                  signedAt: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
    [] as RevenueQuotationRow[],
  );

  if (quotations.length === 0) {
    const emptyTrend = buildMonthlySeries([], now, () => null);
    return {
      quotationCount: 0,
      summaryText: "No latest quotation data is available yet.",
      summaryNotes: buildSummaryNotes({
        quotationCount: 0,
        averageDealSize: 0,
        pendingProposalValue: 0,
        pendingProposalCount: 0,
        lowMarginCount: 0,
        urgentFollowUpCount: 0,
        conversionRate: 0,
        lostProposalValue: 0,
      }),
      kpis: [],
      monthlyQuotation: emptyTrend,
      monthlyApproved: emptyTrend,
      pipeline: buildPipelineBuckets([]),
      propertyRevenue: [],
      propertyRevenueDescription: "Signed commercial value by property type.",
      projectMargins: [],
      insights: [],
    };
  }

  const totals = quotations.reduce(
    (acc, row) => {
      const total = toNumber(row.totalAmount);
      const profit = toNumber(row.profitAmount);

      acc.totalQuotationValue += total;
      acc.totalProfit += profit;

      if (isApproved(row)) {
        acc.totalApprovedValue += total;
        acc.approvedCount += 1;
      }

      if (isSigned(row)) {
        acc.totalSignedValue += total;
        acc.signedCount += 1;
      }

      if (isPendingProposal(row)) {
        acc.pendingProposalValue += total;
        acc.pendingProposalCount += 1;
      }

      if (isLost(row)) {
        acc.lostProposalValue += total;
        acc.lostCount += 1;
      }

      if (!isLost(row) && toNumber(row.marginPercent) < 0.15) {
        acc.lowMarginCount += 1;
      }

      const proposalFollowUp = row.proposal
        ? getProposalFollowUpState({
            status: row.proposal.status,
            activities: row.proposal.activities,
            now,
          })
        : { due: false, kind: null, dueSince: null };
      const hasOverdueFollowUp = row.followUps.some((followUp) => followUp.nextFollowUpAt && followUp.nextFollowUpAt.getTime() <= now.getTime());

      if (proposalFollowUp.due || hasOverdueFollowUp) {
        acc.urgentFollowUpCount += 1;
      }

      return acc;
    },
    {
      totalQuotationValue: 0,
      totalApprovedValue: 0,
      totalSignedValue: 0,
      totalProfit: 0,
      pendingProposalValue: 0,
      lostProposalValue: 0,
      pendingProposalCount: 0,
      approvedCount: 0,
      signedCount: 0,
      lostCount: 0,
      lowMarginCount: 0,
      urgentFollowUpCount: 0,
    },
  );

  const averageDealSize = quotations.length > 0 ? totals.totalQuotationValue / quotations.length : 0;
  const grossMargin = totals.totalQuotationValue > 0 ? totals.totalProfit / totals.totalQuotationValue : 0;
  const closedDeals = totals.signedCount + totals.lostCount;
  const conversionRate = closedDeals > 0 ? totals.signedCount / closedDeals : 0;

  const kpis: KpiCardRow[] = [
    {
      title: "Total Quotation Value",
      value: formatCurrency(totals.totalQuotationValue),
      hint: `${quotations.length} latest quotation${quotations.length === 1 ? "" : "s"} in the live book`,
      tone: "info",
    },
    {
      title: "Total Approved Proposal Value",
      value: formatCurrency(totals.totalApprovedValue),
      hint: `${totals.approvedCount} approved deal${totals.approvedCount === 1 ? "" : "s"} awaiting signature or delivery`,
      tone: totals.approvedCount > 0 ? "success" : "neutral",
    },
    {
      title: "Total Signed Value",
      value: formatCurrency(totals.totalSignedValue),
      hint: `${totals.signedCount} signed deal${totals.signedCount === 1 ? "" : "s"} converted`,
      tone: totals.signedCount > 0 ? "success" : "neutral",
    },
    {
      title: "Average Deal Size",
      value: formatCurrency(averageDealSize),
      hint: "Blended across latest quotations",
      tone: averageDealSize > 0 ? "info" : "neutral",
    },
    {
      title: "Gross Margin",
      value: formatRatioPercent(grossMargin),
      hint: `${formatCurrency(totals.totalProfit)} gross profit across live quotations`,
      tone: grossMargin < 0.12 ? "danger" : grossMargin < 0.18 ? "warning" : "success",
    },
    {
      title: "Conversion Rate",
      value: formatRatioPercent(conversionRate),
      hint: `${totals.signedCount} won vs ${totals.lostCount} lost closed deals`,
      tone: conversionRate >= 0.5 ? "success" : conversionRate >= 0.3 ? "warning" : "danger",
    },
    {
      title: "Pending Proposal Value",
      value: formatCurrency(totals.pendingProposalValue),
      hint: `${totals.pendingProposalCount} proposal${totals.pendingProposalCount === 1 ? "" : "s"} in flight and not yet closed`,
      tone: totals.pendingProposalCount > 0 ? "warning" : "neutral",
    },
    {
      title: "Lost Proposal Value",
      value: formatCurrency(totals.lostProposalValue),
      hint: "Rejected, cancelled, or expired commercial value",
      tone: totals.lostProposalValue > 0 ? "danger" : "success",
    },
  ];

  const propertyRevenue = buildPropertyRevenueBuckets(quotations);

  return {
    quotationCount: quotations.length,
    summaryText: `${formatCurrency(totals.totalQuotationValue)} is currently quoted across ${quotations.length} latest deals. ${formatCurrency(totals.totalApprovedValue)} has reached approval and ${formatCurrency(totals.totalSignedValue)} is already signed, while ${formatCurrency(totals.pendingProposalValue)} still needs active follow-through. Gross margin is tracking at ${formatRatioPercent(grossMargin)} with closed-win conversion at ${formatRatioPercent(conversionRate)}.`,
    summaryNotes: buildSummaryNotes({
      quotationCount: quotations.length,
      averageDealSize,
      pendingProposalValue: totals.pendingProposalValue,
      pendingProposalCount: totals.pendingProposalCount,
      lowMarginCount: totals.lowMarginCount,
      urgentFollowUpCount: totals.urgentFollowUpCount,
      conversionRate,
      lostProposalValue: totals.lostProposalValue,
    }),
    kpis,
    monthlyQuotation: buildMonthlySeries(quotations, now, (row) => row.issueDate),
    monthlyApproved: buildMonthlySeries(quotations, now, (row) => getApprovalDate(row)),
    pipeline: buildPipelineBuckets(quotations),
    propertyRevenue: propertyRevenue.rows,
    propertyRevenueDescription: propertyRevenue.description,
    projectMargins: buildProjectMarginBuckets(quotations),
    insights: [
      buildUrgentFollowUpInsight(quotations, now),
      buildLowMarginInsight(quotations),
      buildLikelyToCloseInsight(quotations, now),
      buildStalledClientInsight(quotations, now),
      buildMarginRiskInsight(quotations),
    ],
  };
}

export default async function RevenueAnalyticsPage() {
  await requirePermission({ moduleKey: "PNL" satisfies PermissionModuleKey, action: "view" });

  const data = await getRevenueAnalyticsData();

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Analytics / Revenue"
        title="Revenue Analytics"
        subtitle="Management view of quotation throughput, proposal conversion, signed value, and AI sales signals built from follow-up, approval, signature, BOQ, and budget heuristics."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/deals">
              <ActionButton variant="secondary">Open Deals</ActionButton>
            </Link>
            <Link href="/quotation">
              <ActionButton>Open Quotations</ActionButton>
            </Link>
          </div>
        }
      />

      {data.quotationCount === 0 ? (
        <EmptyState
          title="No quotation data available yet"
          description="Create quotations and proposals to unlock management revenue analytics, monthly trend charts, and AI sales insights."
          ctaLabel="Open Quotations"
          ctaHref="/quotation"
          secondaryLabel="Open Deals"
          secondaryHref="/deals"
        />
      ) : (
        <>
          <SectionCard title="Executive Summary" description="Management snapshot across the live commercial book.">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.98),rgba(241,245,249,0.88))] p-6 shadow-sm">
                <StatusPill tone="info">Live Commercial Book</StatusPill>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                  Buildy’s revenue pipeline is concentrated in active quotation and proposal value, with approvals already converting into signed revenue.
                </p>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-600">{data.summaryText}</p>
              </div>

              <div className="grid gap-3">
                {data.summaryNotes.map((note) => (
                  <SummaryNoteCard key={note.label} note={note} />
                ))}
              </div>
            </div>
          </SectionCard>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.kpis.map((metric) => (
              <KpiCard key={metric.title} metric={metric} />
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Monthly Quotation Value" description="Rolling 6-month view based on quotation issue date.">
              <TrendBars data={data.monthlyQuotation} tone="info" />
            </SectionCard>

            <SectionCard title="Monthly Approved Value" description="Rolling 6-month view based on approval date.">
              <TrendBars data={data.monthlyApproved} tone="success" />
            </SectionCard>
          </section>

          <SectionCard title="Pipeline By Stage" description="Latest quotations grouped by commercial funnel stage.">
            <PipelineBars rows={data.pipeline} />
          </SectionCard>

          <section className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Revenue By Property Type" description={data.propertyRevenueDescription}>
              <ValueBars rows={data.propertyRevenue} tone="info" emptyLabel="No signed or approved property revenue yet." />
            </SectionCard>

            <SectionCard title="Margin By Project Type" description="Weighted gross margin by project type from the latest quotations.">
              <MarginBars rows={data.projectMargins} />
            </SectionCard>
          </section>

          <SectionCard title="AI Sales Insights" description="Recommendation feed generated from live follow-up timing, proposal activity, BOQ risk notes, budget ceilings, and margin signals.">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {data.insights.map((insight) => (
                <InsightCard key={insight.title} insight={insight} />
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </main>
  );
}

function SummaryNoteCard(props: { note: SummaryNote }) {
  const toneClass =
    props.note.tone === "danger"
      ? "border-red-200 bg-red-50/70"
      : props.note.tone === "warning"
        ? "border-amber-200 bg-amber-50/70"
        : props.note.tone === "success"
          ? "border-emerald-200 bg-emerald-50/70"
          : props.note.tone === "info"
            ? "border-sky-200 bg-sky-50/70"
            : "border-slate-200 bg-slate-50/70";

  return (
    <div className={cx("rounded-2xl border p-4 shadow-sm", toneClass)}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.note.label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-neutral-950">{props.note.value}</p>
      <p className="mt-1 text-sm leading-6 text-neutral-600">{props.note.detail}</p>
    </div>
  );
}

function KpiCard(props: { metric: KpiCardRow }) {
  const tone = props.metric.tone ?? "neutral";
  const toneClass =
    tone === "danger"
      ? "from-red-500/15 via-red-100/70 to-white"
      : tone === "warning"
        ? "from-amber-500/15 via-amber-100/70 to-white"
        : tone === "success"
          ? "from-emerald-500/15 via-emerald-100/70 to-white"
          : tone === "info"
            ? "from-sky-500/15 via-sky-100/70 to-white"
            : "from-slate-500/12 via-slate-100/70 to-white";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={cx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", toneClass)} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.metric.title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 tabular-nums">{props.metric.value}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{props.metric.hint}</p>
    </div>
  );
}

function TrendBars(props: { data: TrendPoint[]; tone: Tone }) {
  const max = Math.max(...props.data.map((point) => point.value), 0);
  const total = props.data.reduce((sum, point) => sum + point.value, 0);
  const toneClass =
    props.tone === "success"
      ? "border-emerald-200/70 bg-gradient-to-t from-emerald-500 via-emerald-400 to-emerald-300"
      : "border-sky-200/70 bg-gradient-to-t from-sky-500 via-sky-400 to-sky-300";

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-neutral-950 tabular-nums">{formatCurrency(total)}</p>
          <p className="mt-1 text-sm text-neutral-600">Total over the last {ROLLING_MONTHS} months</p>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {props.data.map((point) => {
          const height = max > 0 ? Math.max(10, (point.value / max) * 100) : 10;
          return (
            <div key={point.key} className="flex flex-col items-center gap-2">
              <div className="flex h-44 w-full items-end">
                <div className="h-full w-full rounded-2xl border border-slate-200/70 bg-slate-50 p-1">
                  <div className="flex h-full items-end">
                    <div
                      className={cx("w-full rounded-[14px] border", toneClass)}
                      style={{ height: `${height}%` }}
                      title={`${point.fullLabel}: ${formatCurrency(point.value)}`}
                    />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{point.label}</p>
                <p className="mt-1 text-xs font-semibold tabular-nums text-neutral-900">{formatCompactCurrency(point.value)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineBars(props: { rows: PipelineBucket[] }) {
  const max = Math.max(...props.rows.map((row) => row.value), 0);

  return (
    <div className="space-y-3">
      {props.rows.map((row) => (
        <div key={row.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-neutral-950">{row.label}</p>
                <StatusPill tone={row.tone}>{row.count}</StatusPill>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{row.count} latest quotation{row.count === 1 ? "" : "s"} in this stage</p>
            </div>
            <p className="text-sm font-semibold tabular-nums text-neutral-950">{formatCurrency(row.value)}</p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
            <div
              className={cx(
                "h-full rounded-full",
                row.tone === "danger"
                  ? "bg-red-500"
                  : row.tone === "warning"
                    ? "bg-amber-500"
                    : row.tone === "success"
                      ? "bg-emerald-500"
                      : row.tone === "info"
                        ? "bg-sky-500"
                        : "bg-slate-400",
              )}
              style={{ width: `${max > 0 ? Math.max(8, (row.value / max) * 100) : 8}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ValueBars(props: { rows: ValueBucket[]; tone: Tone; emptyLabel: string }) {
  if (props.rows.length === 0) {
    return <p className="text-sm text-neutral-600">{props.emptyLabel}</p>;
  }

  const max = Math.max(...props.rows.map((row) => row.value), 0);
  const barClass = props.tone === "info" ? "bg-sky-500" : "bg-slate-400";

  return (
    <div className="space-y-3">
      {props.rows.map((row) => (
        <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-950">{row.label}</p>
              <p className="mt-1 text-xs text-neutral-500">{row.detail}</p>
            </div>
            <p className="text-sm font-semibold tabular-nums text-neutral-950">{formatCurrency(row.value)}</p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
            <div
              className={cx("h-full rounded-full", barClass)}
              style={{ width: `${max > 0 ? Math.max(8, (row.value / max) * 100) : 8}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MarginBars(props: { rows: MarginBucket[] }) {
  if (props.rows.length === 0) {
    return <p className="text-sm text-neutral-600">No project-type margin data is available yet.</p>;
  }

  return (
    <div className="space-y-3">
      {props.rows.map((row) => {
        const width = Math.min(100, Math.max(8, row.margin * 250));
        const toneClass =
          row.margin < 0.1 ? "bg-red-500" : row.margin < 0.15 ? "bg-amber-500" : "bg-emerald-500";

        return (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-950">{row.label}</p>
                <p className="mt-1 text-xs text-neutral-500">{row.detail}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-neutral-950">{formatRatioPercent(row.margin)}</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
              <div className={cx("h-full rounded-full", toneClass)} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InsightCard(props: { insight: InsightCardRow }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.insight.title}</p>
          <p className="mt-3 text-base font-semibold tracking-tight text-neutral-950">{props.insight.subject}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{props.insight.detail}</p>
        </div>
        <StatusPill tone={props.insight.tone}>{props.insight.badge}</StatusPill>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <Link
          href={props.insight.href}
          className="inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold text-neutral-900 transition hover:bg-stone-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          {props.insight.actionLabel}
        </Link>
      </div>
    </div>
  );
}
