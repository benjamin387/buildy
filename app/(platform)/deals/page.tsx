import Link from "next/link";
import { ProposalActivityType, ProposalStatus, QuotationStatus } from "@prisma/client";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/server/safe-query";
import { getProposalFollowUpState } from "@/lib/proposals/follow-up";

export const dynamic = "force-dynamic";

const fieldClass =
  "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none ring-neutral-400 transition focus:ring-2";

const STAGES = [
  { key: "BRIEF_CREATED", label: "Brief Created", tone: "neutral" },
  { key: "AI_CONCEPT_GENERATED", label: "AI Concept Generated", tone: "info" },
  { key: "BOQ_GENERATED", label: "BOQ Generated", tone: "info" },
  { key: "QUOTATION_CREATED", label: "Quotation Created", tone: "warning" },
  { key: "PROPOSAL_SENT", label: "Proposal Sent", tone: "warning" },
  { key: "VIEWED", label: "Viewed", tone: "info" },
  { key: "APPROVED", label: "Approved", tone: "success" },
  { key: "SIGNED", label: "Signed", tone: "success" },
  { key: "WON", label: "Won", tone: "success" },
  { key: "LOST", label: "Lost", tone: "danger" },
] as const;

const PROPOSAL_STATUS_FILTERS = [
  { key: "ALL", label: "All statuses" },
  { key: "NOT_SENT", label: "No proposal" },
  { key: "READY_TO_SEND", label: "Ready to send" },
  { key: "SENT", label: "Sent" },
  { key: "VIEWED", label: "Viewed" },
  { key: "APPROVED", label: "Approved" },
  { key: "SIGNED", label: "Signed" },
  { key: "REJECTED", label: "Rejected" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];
type ProposalStatusFilterKey = (typeof PROPOSAL_STATUS_FILTERS)[number]["key"];
type Tone = "neutral" | "info" | "warning" | "success" | "danger";

type DealSourceRow = {
  id: string;
  title: string;
  clientName: string | null;
  propertyAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  lead: {
    id: string;
    customerName: string;
    status: string;
    assignedSalesName: string | null;
    assignedSalesEmail: string | null;
    nextFollowUpAt: Date | null;
    assignedToUser: {
      name: string | null;
      email: string;
    } | null;
  } | null;
  project: {
    id: string;
    name: string;
    projectCode: string | null;
    status: string;
    siteAddress: string;
    addressLine1: string;
    addressLine2: string | null;
    postalCode: string | null;
  } | null;
  concepts: Array<{
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  boqs: Array<{
    id: string;
    title: string;
    status: string;
    totalSellingPrice: { toString(): string } | number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  quotations: Array<{
    id: string;
    projectId: string;
    quotationNumber: string;
    status: QuotationStatus;
    totalAmount: { toString(): string } | number;
    createdAt: Date;
    updatedAt: Date;
    projectNameSnapshot: string;
    projectAddress1: string;
    projectAddress2: string | null;
    projectPostalCode: string | null;
    proposal: {
      id: string;
      status: ProposalStatus;
      publicToken: string;
      viewedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      activities: Array<{
        type: ProposalActivityType;
        createdAt: Date;
      }>;
      approvals: Array<{
        id: string;
        status: ProposalStatus;
        clientName: string;
        approvedAt: Date | null;
        rejectedAt: Date | null;
        createdAt: Date;
      }>;
      signatures: Array<{
        id: string;
        signerName: string;
        signerEmail: string;
        signedAt: Date;
        createdAt: Date;
      }>;
    } | null;
  }>;
};

type DealRow = {
  id: string;
  briefId: string;
  client: string;
  property: string;
  stage: StageKey;
  stageLabel: string;
  stageTone: Tone;
  quotationValue: number | null;
  proposalStatusKey: ProposalStatusFilterKey;
  proposalStatusLabel: string;
  proposalStatusTone: Tone;
  lastActivityLabel: string;
  lastActivityAt: Date | null;
  nextAction: string;
  openHref: string;
  openLabel: string;
  salesperson: string;
  salespersonSearch: string;
  followUpDue: boolean;
  proposalSent: boolean;
  approved: boolean;
  signed: boolean;
};

type DateRange = {
  from: Date | null;
  to: Date | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toNumber(value: { toString(): string } | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const next = Number(value.toString());
  return Number.isFinite(next) ? next : 0;
}

function parseDateRange(params: Record<string, string | string[] | undefined>): DateRange {
  const fromRaw = typeof params.from === "string" ? params.from : "";
  const toRaw = typeof params.to === "string" ? params.to : "";

  const from = fromRaw ? new Date(`${fromRaw}T00:00:00`) : null;
  const to = toRaw ? new Date(`${toRaw}T23:59:59.999`) : null;

  return {
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null,
  };
}

function buildProperty(row: DealSourceRow): string {
  const quotation = row.quotations[0] ?? null;

  const address = row.propertyAddress?.trim();
  if (address) return address;

  const projectAddress = [
    row.project?.siteAddress,
    row.project?.addressLine1,
    row.project?.addressLine2,
    row.project?.postalCode,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();
  if (projectAddress) return projectAddress;

  const quotationAddress = [
    quotation?.projectAddress1,
    quotation?.projectAddress2,
    quotation?.projectPostalCode,
  ]
    .filter(Boolean)
    .join(", ")
    .trim();
  if (quotationAddress) return quotationAddress;

  return "Property pending";
}

function buildSalesperson(row: DealSourceRow): { label: string; search: string } {
  const assignedUser = row.lead?.assignedToUser;
  const name = assignedUser?.name ?? row.lead?.assignedSalesName ?? "";
  const email = assignedUser?.email ?? row.lead?.assignedSalesEmail ?? "";
  const label = [name, email].filter(Boolean).join(" · ").trim() || "Unassigned";
  return {
    label,
    search: `${name} ${email}`.trim().toLowerCase(),
  };
}

function getStageMeta(stage: StageKey): { label: string; tone: Tone } {
  const match = STAGES.find((item) => item.key === stage);
  return {
    label: match?.label ?? stage,
    tone: (match?.tone ?? "neutral") as Tone,
  };
}

function hasActivity(
  activities: Array<{ type: ProposalActivityType; createdAt: Date }>,
  type: ProposalActivityType,
): boolean {
  return activities.some((activity) => activity.type === type);
}

function buildProposalStatus(row: DealSourceRow): {
  key: ProposalStatusFilterKey;
  label: string;
  tone: Tone;
} {
  const quotation = row.quotations[0] ?? null;
  const proposal = quotation?.proposal ?? null;
  const approval = proposal?.approvals[0] ?? null;
  const signature = proposal?.signatures[0] ?? null;
  const sent = proposal ? hasActivity(proposal.activities, ProposalActivityType.SENT) : false;
  const viewed = Boolean(proposal?.viewedAt) || (proposal ? hasActivity(proposal.activities, ProposalActivityType.VIEWED) : false);

  if (!proposal) {
    return { key: "NOT_SENT", label: "No proposal", tone: "neutral" };
  }

  if (
    proposal.status === ProposalStatus.REJECTED ||
    approval?.status === ProposalStatus.REJECTED ||
    quotation?.status === QuotationStatus.REJECTED
  ) {
    return { key: "REJECTED", label: "Rejected", tone: "danger" };
  }

  if (signature) {
    return { key: "SIGNED", label: "Signed", tone: "success" };
  }

  if (proposal.status === ProposalStatus.APPROVED || approval?.status === ProposalStatus.APPROVED) {
    return { key: "APPROVED", label: "Approved", tone: "success" };
  }

  if (viewed) {
    return { key: "VIEWED", label: "Viewed", tone: "info" };
  }

  if (sent) {
    return { key: "SENT", label: "Sent", tone: "warning" };
  }

  return { key: "READY_TO_SEND", label: "Ready to send", tone: "neutral" };
}

function deriveStage(row: DealSourceRow): StageKey {
  const quotation = row.quotations[0] ?? null;
  const proposal = quotation?.proposal ?? null;
  const approval = proposal?.approvals[0] ?? null;
  const signature = proposal?.signatures[0] ?? null;
  const sent = proposal ? hasActivity(proposal.activities, ProposalActivityType.SENT) : false;
  const viewed = Boolean(proposal?.viewedAt) || (proposal ? hasActivity(proposal.activities, ProposalActivityType.VIEWED) : false);
  const lost =
    row.lead?.status === "LOST" ||
    quotation?.status === QuotationStatus.REJECTED ||
    quotation?.status === QuotationStatus.CANCELLED ||
    quotation?.status === QuotationStatus.EXPIRED ||
    proposal?.status === ProposalStatus.REJECTED ||
    approval?.status === ProposalStatus.REJECTED;

  if (lost) return "LOST";
  if (signature && quotation?.status === QuotationStatus.APPROVED) return "WON";
  if (signature) return "SIGNED";
  if (proposal?.status === ProposalStatus.APPROVED || approval?.status === ProposalStatus.APPROVED) return "APPROVED";
  if (viewed) return "VIEWED";
  if (sent) return "PROPOSAL_SENT";
  if (quotation) return "QUOTATION_CREATED";
  if (row.boqs[0]) return "BOQ_GENERATED";
  if (row.concepts[0]) return "AI_CONCEPT_GENERATED";
  return "BRIEF_CREATED";
}

function buildLastActivity(row: DealSourceRow): { label: string; at: Date | null } {
  const quotation = row.quotations[0] ?? null;
  const proposal = quotation?.proposal ?? null;
  const approval = proposal?.approvals[0] ?? null;
  const signature = proposal?.signatures[0] ?? null;

  const events: Array<{ label: string; at: Date }> = [
    { label: "Brief created", at: row.createdAt },
    { label: "Brief updated", at: row.updatedAt },
  ];

  const concept = row.concepts[0] ?? null;
  if (concept) {
    events.push({ label: "Concept updated", at: concept.updatedAt });
  }

  const boq = row.boqs[0] ?? null;
  if (boq) {
    events.push({ label: "BOQ updated", at: boq.updatedAt });
  }

  if (quotation) {
    events.push({ label: "Quotation updated", at: quotation.updatedAt });
  }

  if (proposal) {
    events.push({ label: "Proposal prepared", at: proposal.updatedAt });
    for (const activity of proposal.activities) {
      events.push({
        label:
          activity.type === ProposalActivityType.SENT
            ? "Proposal sent"
            : activity.type === ProposalActivityType.VIEWED
              ? "Proposal viewed"
              : activity.type === ProposalActivityType.REMINDER
                ? "WhatsApp follow-up sent"
                : "Proposal approved",
        at: activity.createdAt,
      });
    }
  }

  if (approval) {
    events.push({
      label: approval.status === ProposalStatus.REJECTED ? "Client requested changes" : "Client approval recorded",
      at: approval.approvedAt ?? approval.rejectedAt ?? approval.createdAt,
    });
  }

  if (signature) {
    events.push({
      label: "Proposal signed",
      at: signature.signedAt,
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());

  return events[0] ?? { label: "No activity", at: null };
}

function buildNextAction(params: {
  row: DealSourceRow;
  stage: StageKey;
  followUpDue: boolean;
}): string {
  const quotation = params.row.quotations[0] ?? null;
  const proposal = quotation?.proposal ?? null;

  if (params.stage === "LOST") return "Review loss reason";
  if (params.stage === "WON") return "Handover to delivery";
  if (params.stage === "SIGNED") return "Mark quotation approved";
  if (params.stage === "APPROVED") return "Collect signature";
  if (params.stage === "VIEWED") {
    return params.followUpDue ? "Send viewed follow-up" : "Review client feedback";
  }
  if (params.stage === "PROPOSAL_SENT") {
    return params.followUpDue ? "Send first follow-up" : "Track client view";
  }
  if (params.stage === "QUOTATION_CREATED") {
    return proposal ? "Send proposal link" : "Generate proposal";
  }
  if (params.stage === "BOQ_GENERATED") return "Create quotation";
  if (params.stage === "AI_CONCEPT_GENERATED") return "Generate BOQ";
  return "Generate AI concept";
}

function buildOpenLink(row: DealSourceRow): { href: string; label: string } {
  const quotation = row.quotations[0] ?? null;
  const proposal = quotation?.proposal ?? null;
  const boq = row.boqs[0] ?? null;
  const concept = row.concepts[0] ?? null;

  if (proposal) {
    return { href: `/proposals/${proposal.id}`, label: "Open Proposal" };
  }

  if (quotation) {
    return {
      href: quotation.projectId ? `/projects/${quotation.projectId}/quotations/${quotation.id}` : `/quotation/${quotation.id}`,
      label: "Open Quotation",
    };
  }

  if (boq) {
    return { href: `/design-ai/boq/${boq.id}`, label: "Open BOQ" };
  }

  if (concept) {
    return { href: `/design-ai/concepts/${concept.id}`, label: "Open Concept" };
  }

  return { href: `/design-ai/briefs/${row.id}`, label: "Open Brief" };
}

function buildStageFilterHref(params: {
  stage: string;
  status: string;
  from: string;
  to: string;
  sales: string;
  nextStage: StageKey;
}): string {
  const query = new URLSearchParams();

  if (params.nextStage) query.set("stage", params.nextStage);
  if (params.status && params.status !== "ALL") query.set("status", params.status);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.sales) query.set("sales", params.sales);

  const value = query.toString();
  return value ? `/deals?${value}` : "/deals";
}

function buildDealRow(row: DealSourceRow, now: Date): DealRow {
  const quotation = row.quotations[0] ?? null;
  const proposal = quotation?.proposal ?? null;
  const proposalStatus = buildProposalStatus(row);
  const stage = deriveStage(row);
  const stageMeta = getStageMeta(stage);
  const followUp = proposal
    ? getProposalFollowUpState({
        status: proposal.status,
        activities: proposal.activities,
        now,
      })
    : { due: false, kind: null, dueSince: null };
  const lastActivity = buildLastActivity(row);
  const salesperson = buildSalesperson(row);
  const openLink = buildOpenLink(row);

  return {
    id: row.id,
    briefId: row.id,
    client: row.clientName?.trim() || row.lead?.customerName || "Client pending",
    property: buildProperty(row),
    stage,
    stageLabel: stageMeta.label,
    stageTone: stageMeta.tone,
    quotationValue: quotation ? toNumber(quotation.totalAmount) : null,
    proposalStatusKey: proposalStatus.key,
    proposalStatusLabel: proposalStatus.label,
    proposalStatusTone: proposalStatus.tone,
    lastActivityLabel: lastActivity.label,
    lastActivityAt: lastActivity.at,
    nextAction: buildNextAction({ row, stage, followUpDue: followUp.due }),
    openHref: openLink.href,
    openLabel: openLink.label,
    salesperson: salesperson.label,
    salespersonSearch: salesperson.search,
    followUpDue: followUp.due,
    proposalSent: proposalStatus.key === "SENT" || proposalStatus.key === "VIEWED" || proposalStatus.key === "APPROVED" || proposalStatus.key === "SIGNED",
    approved: proposalStatus.key === "APPROVED" || proposalStatus.key === "SIGNED",
    signed: proposalStatus.key === "SIGNED",
  };
}

export default async function DealsPipelinePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission({ moduleKey: "LEADS", action: "view" });

  const params = await props.searchParams;
  const stageParam = typeof params.stage === "string" ? params.stage : "ALL";
  const statusParam = typeof params.status === "string" ? params.status : "ALL";
  const fromParam = typeof params.from === "string" ? params.from : "";
  const toParam = typeof params.to === "string" ? params.to : "";
  const salesParam = typeof params.sales === "string" ? params.sales.trim() : "";
  const stage = STAGES.some((item) => item.key === stageParam) ? (stageParam as StageKey) : "ALL";
  const status = PROPOSAL_STATUS_FILTERS.some((item) => item.key === statusParam)
    ? (statusParam as ProposalStatusFilterKey)
    : "ALL";
  const dateRange = parseDateRange(params);
  const now = new Date();

  const where =
    dateRange.from || dateRange.to
      ? {
          createdAt: {
            ...(dateRange.from ? { gte: dateRange.from } : {}),
            ...(dateRange.to ? { lte: dateRange.to } : {}),
          },
        }
      : {};

  const sourceRows = await safeQuery(
    () =>
      prisma.designBrief.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          clientName: true,
          propertyAddress: true,
          createdAt: true,
          updatedAt: true,
          lead: {
            select: {
              id: true,
              customerName: true,
              status: true,
              assignedSalesName: true,
              assignedSalesEmail: true,
              nextFollowUpAt: true,
              assignedToUser: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              projectCode: true,
              status: true,
              siteAddress: true,
              addressLine1: true,
              addressLine2: true,
              postalCode: true,
            },
          },
          concepts: {
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              title: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          boqs: {
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              title: true,
              status: true,
              totalSellingPrice: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          quotations: {
            where: { isLatest: true },
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              projectId: true,
              quotationNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true,
              updatedAt: true,
              projectNameSnapshot: true,
              projectAddress1: true,
              projectAddress2: true,
              projectPostalCode: true,
              proposal: {
                select: {
                  id: true,
                  status: true,
                  publicToken: true,
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
                      id: true,
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
                      id: true,
                      signerName: true,
                      signerEmail: true,
                      signedAt: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    [] as DealSourceRow[],
  );

  const deals = sourceRows.map((row) => buildDealRow(row, now));
  const salesNeedle = salesParam.toLowerCase();

  const scopedDeals = deals.filter((deal) => {
    if (status !== "ALL" && deal.proposalStatusKey !== status) return false;
    if (salesNeedle && !`${deal.salesperson} ${deal.salespersonSearch}`.toLowerCase().includes(salesNeedle)) return false;
    return true;
  });

  const stageCounts = STAGES.reduce<Record<StageKey, number>>((acc, item) => {
    acc[item.key] = 0;
    return acc;
  }, {} as Record<StageKey, number>);

  for (const deal of scopedDeals) {
    stageCounts[deal.stage] += 1;
  }

  const visibleDeals = stage === "ALL" ? scopedDeals : scopedDeals.filter((deal) => deal.stage === stage);

  const totalActiveDeals = visibleDeals.filter((deal) => deal.stage !== "WON" && deal.stage !== "LOST").length;
  const proposalSentValue = visibleDeals
    .filter((deal) => deal.stage !== "LOST" && deal.proposalSent)
    .reduce((sum, deal) => sum + (deal.quotationValue ?? 0), 0);
  const approvedValue = visibleDeals
    .filter((deal) => deal.stage !== "LOST" && deal.approved)
    .reduce((sum, deal) => sum + (deal.quotationValue ?? 0), 0);
  const lostValue = visibleDeals
    .filter((deal) => deal.stage === "LOST")
    .reduce((sum, deal) => sum + (deal.quotationValue ?? 0), 0);
  const followUpsDue = visibleDeals.filter((deal) => deal.followUpDue).length;
  const closedDeals = visibleDeals.filter((deal) => deal.stage === "WON" || deal.stage === "LOST").length;
  const wonDeals = visibleDeals.filter((deal) => deal.stage === "WON").length;
  const conversionRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Sales Command Center"
        title="Deals Pipeline"
        subtitle="Track each deal from AI brief through concept, BOQ, quotation, proposal delivery, approval, signature, and commercial close."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/leads">
              <ActionButton variant="secondary">Open Leads</ActionButton>
            </Link>
            <Link href="/design-ai/briefs">
              <ActionButton>Open AI Briefs</ActionButton>
            </Link>
          </div>
        }
      />

      <SectionCard
        title="Filters"
        description="Filter by lifecycle stage, proposal status, brief date window, or salesperson."
      >
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Stage</span>
            <select name="stage" defaultValue={stageParam} className={fieldClass}>
              <option value="ALL">All stages</option>
              {STAGES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Status</span>
            <select name="status" defaultValue={statusParam} className={fieldClass}>
              {PROPOSAL_STATUS_FILTERS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Created From</span>
            <input type="date" name="from" defaultValue={fromParam} className={fieldClass} />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Created To</span>
            <input type="date" name="to" defaultValue={toParam} className={fieldClass} />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Salesperson</span>
            <input
              name="sales"
              defaultValue={salesParam}
              placeholder="Name or email"
              className={fieldClass}
            />
          </label>

          <div className="flex flex-wrap items-end gap-2 xl:col-span-5">
            <ActionButton type="submit">Apply Filters</ActionButton>
            <Link href="/deals">
              <ActionButton type="button" variant="secondary">
                Reset
              </ActionButton>
            </Link>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Pipeline Stages"
        description={`Showing ${visibleDeals.length} deal(s) after filters. Stage counters reflect the current filter scope before the selected stage.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {STAGES.map((item) => {
            const active = stage === item.key;
            return (
              <Link
                key={item.key}
                href={buildStageFilterHref({
                  stage: stageParam,
                  status: statusParam,
                  from: fromParam,
                  to: toParam,
                  sales: salesParam,
                  nextStage: item.key,
                })}
                className={[
                  "rounded-2xl border bg-white px-4 py-4 shadow-sm transition",
                  active ? "border-neutral-950 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]" : "border-slate-200 hover:border-slate-300 hover:bg-stone-50",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-neutral-950">{item.label}</p>
                  <StatusPill tone={item.tone}>{item.label}</StatusPill>
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950">
                  {stageCounts[item.key]}
                </p>
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Total Active Deals" value={String(totalActiveDeals)} hint="Excludes won and lost deals." />
        <MetricCard title="Proposal Sent Value" value={formatCurrency(proposalSentValue)} hint="Deals with a sent proposal or later." />
        <MetricCard title="Approved Value" value={formatCurrency(approvedValue)} hint="Approved, signed, or won deals." />
        <MetricCard title="Lost Value" value={formatCurrency(lostValue)} hint="Rejected, expired, cancelled, or lost deals." />
        <MetricCard title="Conversion Rate" value={formatPercent(conversionRate)} hint="Closed-won divided by closed deals." />
        <MetricCard title="Follow-ups Due" value={String(followUpsDue)} hint="Matches the proposal WhatsApp reminder logic." />
      </section>

      <SectionCard
        title="Deal Register"
        description="Client, property, stage, proposal readiness, last activity, and the next action to keep the pipeline moving."
      >
        {visibleDeals.length === 0 ? (
          <EmptyState
            title="No deals found"
            description="No design-brief-backed deals match the current filter set."
            ctaLabel="New Design Brief"
            ctaHref="/design-ai/briefs/new"
            secondaryLabel="Reset Filters"
            secondaryHref="/deals"
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 lg:hidden">
              {visibleDeals.map((deal) => (
                <MobileDealCard key={deal.id} deal={deal} />
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <div className="min-w-[1180px] overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-neutral-700">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Client</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Property</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Stage</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Quotation Value</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Proposal Status</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Last Activity</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Next Action</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Salesperson</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Open Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDeals.map((deal) => (
                      <tr key={deal.id} className="border-t border-slate-200 align-top">
                        <td className="px-4 py-4 text-neutral-900">
                          <div className="flex flex-col">
                            <span className="font-semibold">{deal.client}</span>
                            <span className="text-xs text-neutral-500">{deal.briefId.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          <p className="max-w-[250px] text-sm leading-6 text-neutral-700">{deal.property}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusPill tone={deal.stageTone}>{deal.stageLabel}</StatusPill>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                          {deal.quotationValue !== null ? formatCurrency(deal.quotationValue) : "-"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <StatusPill tone={deal.proposalStatusTone}>{deal.proposalStatusLabel}</StatusPill>
                            {deal.followUpDue ? <span className="text-xs font-semibold text-amber-700">Follow-up due</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          <div className="flex flex-col">
                            <span className="font-medium text-neutral-900">{deal.lastActivityLabel}</span>
                            <span className="text-xs text-neutral-500">{formatDateTime(deal.lastActivityAt)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          <span className="font-medium text-neutral-900">{deal.nextAction}</span>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          <span className="text-sm">{deal.salesperson}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={deal.openHref}
                            className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function MetricCard(props: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{props.hint}</p>
    </div>
  );
}

function MobileDealCard(props: { deal: DealRow }) {
  const { deal } = props;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-neutral-950">{deal.client}</p>
          <p className="mt-1 text-sm leading-6 text-neutral-600">{deal.property}</p>
        </div>
        <StatusPill tone={deal.stageTone}>{deal.stageLabel}</StatusPill>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InfoCell label="Quotation Value" value={deal.quotationValue !== null ? formatCurrency(deal.quotationValue) : "-"} />
        <InfoCell label="Proposal Status" value={deal.proposalStatusLabel} tone={deal.proposalStatusTone} />
        <InfoCell label="Last Activity" value={`${deal.lastActivityLabel} · ${formatDate(deal.lastActivityAt)}`} />
        <InfoCell label="Next Action" value={deal.nextAction} />
        <InfoCell label="Salesperson" value={deal.salesperson} />
        <InfoCell label="Follow-up" value={deal.followUpDue ? "Due now" : "On track"} tone={deal.followUpDue ? "warning" : "neutral"} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href={deal.openHref}
          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
        >
          Open
        </Link>
        <span className="text-xs text-neutral-500">{formatDateTime(deal.lastActivityAt)}</span>
      </div>
    </div>
  );
}

function InfoCell(props: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-stone-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</p>
      <div className="mt-2">
        {props.tone ? <StatusPill tone={props.tone}>{props.value}</StatusPill> : <p className="text-sm font-medium text-neutral-900">{props.value}</p>}
      </div>
    </div>
  );
}
