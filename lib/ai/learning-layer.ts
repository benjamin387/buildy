import "server-only";

import { Prisma, type AIOutcomeStatus, type AIOutcomeType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractBudgetSgd } from "@/lib/ai/decision-rules";
import type { AIActionName, AIEntityType } from "@/lib/ai/action-types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type PrismaAny = Record<string, any>;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toDecimalOrNull(v: number | null | undefined): Prisma.Decimal | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function daysSince(from: Date, to = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function getDelegate(prismaAny: PrismaAny, names: string[]) {
  for (const n of names) {
    const d = prismaAny[n];
    if (d && typeof d === "object") return d;
  }
  return null;
}

function getAIOutcomeDelegate() {
  const prismaAny = prisma as unknown as PrismaAny;
  const d = getDelegate(prismaAny, ["aIOutcome", "aiOutcome"]);
  if (!d) throw new Error("Prisma delegate for AIOutcome not found. Run prisma generate.");
  return d;
}

function getAILearningMetricDelegate() {
  const prismaAny = prisma as unknown as PrismaAny;
  const d = getDelegate(prismaAny, ["aILearningMetric", "aiLearningMetric"]);
  if (!d) throw new Error("Prisma delegate for AILearningMetric not found. Run prisma generate.");
  return d;
}

function getAIRecommendationScoreDelegate() {
  const prismaAny = prisma as unknown as PrismaAny;
  const d = getDelegate(prismaAny, ["aIRecommendationScore", "aiRecommendationScore"]);
  if (!d) throw new Error("Prisma delegate for AIRecommendationScore not found. Run prisma generate.");
  return d;
}

function getAIActionLogDelegate() {
  const prismaAny = prisma as unknown as PrismaAny;
  const d = getDelegate(prismaAny, ["aIActionLog", "aiActionLog"]);
  if (!d) throw new Error("Prisma delegate for AIActionLog not found. Run prisma generate.");
  return d;
}

export type RecordAIOutcomeInput = {
  actionLogId?: string | null;
  entityType: string;
  entityId: string;
  outcomeType: AIOutcomeType;
  outcomeStatus: AIOutcomeStatus;
  measuredAt: Date;
  valueBefore?: number | null;
  valueAfter?: number | null;
  impactAmount?: number | null;
  impactPercent?: number | null;
  notes?: string | null;
};

export async function recordAIOutcome(input: RecordAIOutcomeInput) {
  const delegate = getAIOutcomeDelegate();
  const data = {
    actionLogId: input.actionLogId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    outcomeType: input.outcomeType,
    outcomeStatus: input.outcomeStatus,
    measuredAt: input.measuredAt,
    valueBefore: toDecimalOrNull(input.valueBefore),
    valueAfter: toDecimalOrNull(input.valueAfter),
    impactAmount: toDecimalOrNull(input.impactAmount),
    impactPercent: toDecimalOrNull(input.impactPercent),
    notes: input.notes ?? null,
  };

  // Enforce "one outcome per action log" at app level too (in addition to unique index).
  if (data.actionLogId) {
    const existing = await delegate.findUnique({
      where: { actionLogId: data.actionLogId },
    });
    if (existing) return existing;
  }

  return await delegate.create({ data });
}

export function outcomeTypeForAction(action: AIActionName): AIOutcomeType | null {
  switch (action) {
    case "SEND_FIRST_CONTACT_MESSAGE":
    case "SEND_FOLLOW_UP_MESSAGE":
      return "LEAD_CONVERSION";
    case "GENERATE_SALES_PACKAGE":
      return "QUOTATION_ACCEPTANCE";
    case "GENERATE_UPSELL_RECOMMENDATION":
    case "PROPOSE_UPSELL":
      return "UPSELL_ACCEPTANCE";
    case "SEND_PAYMENT_REMINDER":
      return "PAYMENT_COLLECTION";
    case "GENERATE_LAYOUT_PLAN":
    case "GENERATE_3D_VISUAL":
    case "GENERATE_DESIGN_VARIATIONS":
      return "DESIGN_ACCEPTANCE";
    case "REQUEST_PROGRESS_UPDATE":
      return "PROJECT_DELAY_REDUCTION";
    default:
      return null;
  }
}

export async function ensurePendingOutcomeForCompletedAction(params: {
  actionLogId: string;
  action: AIActionName;
  entityType: AIEntityType;
  entityId: string;
  executedAt: Date | null | undefined;
}): Promise<void> {
  const outcomeType = outcomeTypeForAction(params.action);
  if (!outcomeType) return;

  await recordAIOutcome({
    actionLogId: params.actionLogId,
    entityType: params.entityType,
    entityId: params.entityId,
    outcomeType,
    outcomeStatus: "PENDING",
    measuredAt: params.executedAt ?? new Date(),
    notes: `Auto-created from AIActionLog ${params.actionLogId} (${params.action}).`,
  });
}

type SegmentContext =
  | { kind: "LEAD"; leadId: string }
  | { kind: "INVOICE"; invoiceId: string }
  | { kind: "PROJECT"; projectId: string }
  | { kind: "DESIGN_AREA"; designAreaId: string }
  | { kind: "NONE" };

function budgetBandSgd(budget: number | null): string | null {
  if (!budget || budget <= 0) return null;
  if (budget < 30000) return "LT_30K";
  if (budget < 60000) return "30K_60K";
  if (budget < 100000) return "60K_100K";
  return "GT_100K";
}

async function computeSegmentKey(ctx: SegmentContext): Promise<string | null> {
  if (ctx.kind === "LEAD") {
    const lead = await prisma.lead.findUnique({
      where: { id: ctx.leadId },
      select: {
        propertyCategory: true,
        residentialPropertyType: true,
        preferredDesignStyle: true,
        source: true,
        requirementSummary: true,
        notes: true,
      },
    });
    if (!lead) return null;

    const property = lead.residentialPropertyType ?? lead.propertyCategory ?? "UNKNOWN";
    const style = lead.preferredDesignStyle ?? "UNKNOWN";
    const source = (lead.source ?? "UNKNOWN").toString().trim() || "UNKNOWN";
    const budget = extractBudgetSgd([lead.requirementSummary ?? "", lead.notes ?? ""].join("\n"));
    const band = budgetBandSgd(budget) ?? "UNKNOWN";
    return `${property}_${style}_${band}_${source}`.toUpperCase();
  }

  if (ctx.kind === "INVOICE") {
    const inv = await prisma.invoice.findUnique({
      where: { id: ctx.invoiceId },
      select: {
        project: { select: { propertyType: true, status: true } },
      },
    });
    if (!inv?.project) return null;
    return `${inv.project.propertyType}_${inv.project.status}`.toUpperCase();
  }

  if (ctx.kind === "PROJECT") {
    const project = await prisma.project.findUnique({
      where: { id: ctx.projectId },
      select: { propertyType: true, status: true },
    });
    if (!project) return null;
    return `${project.propertyType}_${project.status}`.toUpperCase();
  }

  if (ctx.kind === "DESIGN_AREA") {
    const area = await prisma.designArea.findUnique({
      where: { id: ctx.designAreaId },
      select: {
        roomType: true,
        designBrief: { select: { propertyType: true, designStyle: true } },
      },
    });
    if (!area) return null;
    const property = area.designBrief?.propertyType ?? "UNKNOWN";
    const style = area.designBrief?.designStyle ?? "UNKNOWN";
    return `${property}_${style}_${area.roomType}`.toUpperCase();
  }

  return null;
}

type InferOutcomeParams = {
  take?: number;
  now?: Date;
};

export async function inferOutcomeFromEntityChange(params: InferOutcomeParams = {}) {
  const now = params.now ?? new Date();
  const delegate = getAIOutcomeDelegate();

  const rows = (await delegate.findMany({
    where: { outcomeStatus: "PENDING" },
    orderBy: [{ measuredAt: "asc" }],
    take: Math.max(1, Math.min(500, params.take ?? 200)),
  })) as Array<{
    id: string;
    actionLogId: string | null;
    entityType: string;
    entityId: string;
    outcomeType: AIOutcomeType;
    measuredAt: Date;
  }>;

  let updated = 0;

  for (const o of rows) {
    const ageDays = daysSince(o.measuredAt, now);

    if (o.outcomeType === "LEAD_CONVERSION" && o.entityType === "LEAD") {
      const lead = await prisma.lead.findUnique({
        where: { id: o.entityId },
        select: { status: true, convertedAt: true, updatedAt: true },
      });
      if (!lead) continue;

      if (lead.status === "CONVERTED" || lead.status === "SITE_VISIT_SCHEDULED") {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "SUCCESS" } });
        updated += 1;
        continue;
      }

      if (ageDays >= 14) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "FAILED" } });
        updated += 1;
        continue;
      }
      continue;
    }

    if (o.outcomeType === "PAYMENT_COLLECTION" && o.entityType === "INVOICE") {
      const inv = await prisma.invoice.findUnique({
        where: { id: o.entityId },
        select: { outstandingAmount: true, totalAmount: true, dueDate: true, status: true },
      });
      if (!inv) continue;
      const outstanding = Number(inv.outstandingAmount ?? 0);

      if (outstanding <= 0.01 && inv.status !== "VOID") {
        await delegate.update({
          where: { id: o.id },
          data: {
            outcomeStatus: "SUCCESS",
            valueAfter: toDecimalOrNull(0),
            impactAmount: toDecimalOrNull(Number(inv.totalAmount ?? 0)),
          },
        });
        updated += 1;
        continue;
      }

      if (ageDays >= 21) {
        await delegate.update({
          where: { id: o.id },
          data: { outcomeStatus: "FAILED", valueAfter: toDecimalOrNull(outstanding) },
        });
        updated += 1;
        continue;
      }

      if (ageDays >= 7) {
        // Past the initial window, but not yet clearly failed. If partial payment happened, treat as NEUTRAL.
        const neutral = outstanding < Number(inv.totalAmount ?? 0) - 0.01;
        if (neutral) {
          await delegate.update({
            where: { id: o.id },
            data: { outcomeStatus: "NEUTRAL", valueAfter: toDecimalOrNull(outstanding) },
          });
          updated += 1;
        }
        continue;
      }
      continue;
    }

    if (o.outcomeType === "DESIGN_ACCEPTANCE" && o.entityType === "DESIGN_AREA") {
      const [selectedLayout, selectedRender, anyRender] = await Promise.all([
        prisma.generatedLayoutPlan.findFirst({
          where: { designAreaId: o.entityId, isSelected: true },
          select: { id: true },
        }),
        prisma.visualRender.findFirst({
          where: { designAreaId: o.entityId, isSelected: true },
          select: { id: true },
        }),
        prisma.visualRender.findFirst({
          where: { designAreaId: o.entityId, generationStatus: "COMPLETED" },
          select: { id: true },
        }),
      ]);

      if (selectedLayout || selectedRender) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "SUCCESS" } });
        updated += 1;
        continue;
      }

      // If we at least generated something but it wasn't selected, treat as NEUTRAL after 14 days.
      if ((anyRender ? true : false) && ageDays >= 14) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "NEUTRAL" } });
        updated += 1;
        continue;
      }

      if (ageDays >= 30) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "FAILED" } });
        updated += 1;
      }
      continue;
    }

    if (o.outcomeType === "PROJECT_DELAY_REDUCTION" && o.entityType === "PROJECT") {
      const createdLog = await prisma.projectProgressLog.findFirst({
        where: { projectId: o.entityId, createdAt: { gte: o.measuredAt } },
        select: { id: true, createdAt: true },
      });

      if (createdLog) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "SUCCESS" } });
        updated += 1;
        continue;
      }

      if (ageDays >= 7) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "FAILED" } });
        updated += 1;
      }
      continue;
    }

    if (o.outcomeType === "UPSELL_ACCEPTANCE" && (o.entityType === "PROJECT" || o.entityType === "DESIGN_BRIEF")) {
      const projectId =
        o.entityType === "PROJECT"
          ? o.entityId
          : (
              await prisma.designBrief.findUnique({
                where: { id: o.entityId },
                select: { projectId: true },
              })
            )?.projectId ?? null;

      if (!projectId) continue;

      const [accepted, rejected] = await Promise.all([
        prisma.upsellRecommendation.findFirst({
          where: { projectId, status: "ACCEPTED", updatedAt: { gte: o.measuredAt } },
          select: { id: true },
        }),
        prisma.upsellRecommendation.findFirst({
          where: { projectId, status: "REJECTED", updatedAt: { gte: o.measuredAt } },
          select: { id: true },
        }),
      ]);

      if (accepted) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "SUCCESS" } });
        updated += 1;
        continue;
      }

      if (rejected && ageDays >= 14) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "FAILED" } });
        updated += 1;
        continue;
      }

      if (ageDays >= 30) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "NEUTRAL" } });
        updated += 1;
      }
      continue;
    }

    if (o.outcomeType === "QUOTATION_ACCEPTANCE") {
      // This outcome can be attached to DESIGN_BRIEF (sales package) or PROJECT; treat acceptance as success if any latest quotation is accepted.
      const projectId =
        o.entityType === "PROJECT"
          ? o.entityId
          : o.entityType === "DESIGN_BRIEF"
            ? (
                await prisma.designBrief.findUnique({
                  where: { id: o.entityId },
                  select: { projectId: true },
                })
              )?.projectId ?? null
            : null;

      if (!projectId) continue;
      const q = await prisma.quotation.findFirst({
        where: { projectId, isLatest: true },
        orderBy: [{ createdAt: "desc" }],
        select: { status: true, updatedAt: true },
      });
      if (!q) continue;
      if (q.status === "APPROVED") {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "SUCCESS" } });
        updated += 1;
        continue;
      }
      if (q.status === "REJECTED") {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "FAILED" } });
        updated += 1;
        continue;
      }
      if (ageDays >= 14) {
        await delegate.update({ where: { id: o.id }, data: { outcomeStatus: "NEUTRAL" } });
        updated += 1;
      }
      continue;
    }
  }

  return { scanned: rows.length, updated };
}

export type LearningSummary = {
  total: number;
  pending: number;
  success: number;
  failed: number;
  neutral: number;
  successRate: number;
  bestAction: { action: string; entityType: string; successRate: number; sampleSize: number } | null;
  weakAction: { action: string; entityType: string; successRate: number; sampleSize: number } | null;
};

export async function recalculateLearningMetrics(params: { horizonDays?: number } = {}) {
  const horizonDays = Math.max(7, Math.min(365, params.horizonDays ?? 180));
  const since = new Date(Date.now() - horizonDays * MS_PER_DAY);
  const now = new Date();

  const outcomeDelegate = getAIOutcomeDelegate();
  const metricDelegate = getAILearningMetricDelegate();

  // Resolve pending outcomes first (bounded).
  await inferOutcomeFromEntityChange({ take: 250, now });

  const outcomes = (await outcomeDelegate.findMany({
    where: { measuredAt: { gte: since } },
    select: {
      id: true,
      outcomeType: true,
      outcomeStatus: true,
      impactAmount: true,
      impactPercent: true,
      entityType: true,
      entityId: true,
    },
    take: 5000,
    orderBy: [{ measuredAt: "desc" }],
  })) as Array<{
    outcomeType: AIOutcomeType;
    outcomeStatus: AIOutcomeStatus;
    impactAmount: Prisma.Decimal | null;
    impactPercent: Prisma.Decimal | null;
    entityType: string;
    entityId: string;
  }>;

  const byType = new Map<string, { sample: number; success: number; failed: number; amt: number[]; pct: number[] }>();
  for (const o of outcomes) {
    const key = o.outcomeType;
    const cur = byType.get(key) ?? { sample: 0, success: 0, failed: 0, amt: [], pct: [] };
    cur.sample += 1;
    if (o.outcomeStatus === "SUCCESS") cur.success += 1;
    if (o.outcomeStatus === "FAILED") cur.failed += 1;
    if (o.impactAmount !== null) cur.amt.push(Number(o.impactAmount));
    if (o.impactPercent !== null) cur.pct.push(Number(o.impactPercent));
    byType.set(key, cur);
  }

  for (const [outcomeType, agg] of byType.entries()) {
    const conversionRate = agg.sample > 0 ? agg.success / agg.sample : null;
    const avgAmt = agg.amt.length ? agg.amt.reduce((a, b) => a + b, 0) / agg.amt.length : null;
    const avgPct = agg.pct.length ? agg.pct.reduce((a, b) => a + b, 0) / agg.pct.length : null;

    await metricDelegate.upsert({
      where: {
        metricKey_entityType_segmentKey: {
          metricKey: outcomeType,
          entityType: null,
          segmentKey: null,
        },
      },
      update: {
        sampleSize: agg.sample,
        successCount: agg.success,
        failureCount: agg.failed,
        conversionRate: conversionRate === null ? null : new Prisma.Decimal(conversionRate),
        averageImpactAmount: avgAmt === null ? null : new Prisma.Decimal(avgAmt),
        averageImpactPercent: avgPct === null ? null : new Prisma.Decimal(avgPct),
        lastCalculatedAt: now,
      },
      create: {
        metricKey: outcomeType,
        entityType: null,
        segmentKey: null,
        sampleSize: agg.sample,
        successCount: agg.success,
        failureCount: agg.failed,
        conversionRate: conversionRate === null ? null : new Prisma.Decimal(conversionRate),
        averageImpactAmount: avgAmt === null ? null : new Prisma.Decimal(avgAmt),
        averageImpactPercent: avgPct === null ? null : new Prisma.Decimal(avgPct),
        lastCalculatedAt: now,
      },
    });
  }

  // Keep segment metrics lightweight: only compute for lead + design area + invoice outcomes.
  const segmentRows = outcomes.filter((o) => o.entityType === "LEAD" || o.entityType === "DESIGN_AREA" || o.entityType === "INVOICE");
  const segmentAgg = new Map<
    string,
    { metricKey: string; entityType: string; segmentKey: string; sample: number; success: number; failed: number }
  >();

  for (const o of segmentRows) {
    const segmentKey =
      o.entityType === "LEAD"
        ? await computeSegmentKey({ kind: "LEAD", leadId: o.entityId })
        : o.entityType === "DESIGN_AREA"
          ? await computeSegmentKey({ kind: "DESIGN_AREA", designAreaId: o.entityId })
          : o.entityType === "INVOICE"
            ? await computeSegmentKey({ kind: "INVOICE", invoiceId: o.entityId })
            : null;

    if (!segmentKey) continue;
    const key = `${o.outcomeType}::${o.entityType}::${segmentKey}`;
    const cur =
      segmentAgg.get(key) ??
      {
        metricKey: o.outcomeType,
        entityType: o.entityType,
        segmentKey,
        sample: 0,
        success: 0,
        failed: 0,
      };
    cur.sample += 1;
    if (o.outcomeStatus === "SUCCESS") cur.success += 1;
    if (o.outcomeStatus === "FAILED") cur.failed += 1;
    segmentAgg.set(key, cur);
  }

  // Only persist top 100 segment keys by sample size to avoid runaway cardinality.
  const topSegments = [...segmentAgg.values()].sort((a, b) => b.sample - a.sample).slice(0, 100);
  for (const s of topSegments) {
    const conversionRate = s.sample > 0 ? s.success / s.sample : null;
    await metricDelegate.upsert({
      where: {
        metricKey_entityType_segmentKey: {
          metricKey: s.metricKey,
          entityType: s.entityType,
          segmentKey: s.segmentKey,
        },
      },
      update: {
        sampleSize: s.sample,
        successCount: s.success,
        failureCount: s.failed,
        conversionRate: conversionRate === null ? null : new Prisma.Decimal(conversionRate),
        lastCalculatedAt: now,
      },
      create: {
        metricKey: s.metricKey,
        entityType: s.entityType,
        segmentKey: s.segmentKey,
        sampleSize: s.sample,
        successCount: s.success,
        failureCount: s.failed,
        conversionRate: conversionRate === null ? null : new Prisma.Decimal(conversionRate),
        lastCalculatedAt: now,
      },
    });
  }

  return { horizonDays, outcomes: outcomes.length, metricsWritten: byType.size + topSegments.length };
}

export async function updateRecommendationScores(params: { horizonDays?: number } = {}) {
  const horizonDays = Math.max(7, Math.min(365, params.horizonDays ?? 180));
  const since = new Date(Date.now() - horizonDays * MS_PER_DAY);
  const now = new Date();

  const outcomeDelegate = getAIOutcomeDelegate();
  const scoreDelegate = getAIRecommendationScoreDelegate();
  const logDelegate = getAIActionLogDelegate();

  const outcomes = (await outcomeDelegate.findMany({
    where: { measuredAt: { gte: since }, actionLogId: { not: null }, outcomeStatus: { not: "PENDING" } },
    select: { actionLogId: true, outcomeStatus: true, impactAmount: true, entityType: true, entityId: true },
    take: 5000,
    orderBy: [{ measuredAt: "desc" }],
  })) as Array<{
    actionLogId: string;
    outcomeStatus: AIOutcomeStatus;
    impactAmount: Prisma.Decimal | null;
    entityType: string;
    entityId: string;
  }>;

  if (outcomes.length === 0) {
    return { scoresWritten: 0, horizonDays, sample: 0 };
  }

  const logIds = outcomes.map((o) => o.actionLogId);
  const logs = (await logDelegate.findMany({
    where: { id: { in: logIds } },
    select: { id: true, action: true, entityType: true },
    take: 5000,
  })) as Array<{ id: string; action: string; entityType: string }>;
  const logMap = new Map<string, { action: string; entityType: string }>(logs.map((l) => [l.id, { action: l.action, entityType: l.entityType }]));

  const agg = new Map<string, { action: string; entityType: string; segmentKey: string | null; sample: number; success: number; amt: number[] }>();

  for (const o of outcomes) {
    const log = logMap.get(o.actionLogId);
    if (!log) continue;

    const segmentKey =
      o.entityType === "LEAD"
        ? await computeSegmentKey({ kind: "LEAD", leadId: o.entityId })
        : o.entityType === "DESIGN_AREA"
          ? await computeSegmentKey({ kind: "DESIGN_AREA", designAreaId: o.entityId })
          : o.entityType === "INVOICE"
            ? await computeSegmentKey({ kind: "INVOICE", invoiceId: o.entityId })
            : null;

    const seg = segmentKey ?? null;
    const key = `${log.action}::${log.entityType}::${seg ?? ""}`;
    const cur = agg.get(key) ?? { action: log.action, entityType: log.entityType, segmentKey: seg, sample: 0, success: 0, amt: [] };
    cur.sample += 1;
    if (o.outcomeStatus === "SUCCESS") cur.success += 1;
    if (o.impactAmount !== null) cur.amt.push(Number(o.impactAmount));
    agg.set(key, cur);
  }

  const rows = [...agg.values()]
    .sort((a, b) => b.sample - a.sample)
    .slice(0, 300); // cap writes

  for (const r of rows) {
    const successRate = r.sample > 0 ? r.success / r.sample : 0;
    const avgAmt = r.amt.length ? r.amt.reduce((a, b) => a + b, 0) / r.amt.length : null;

    await scoreDelegate.upsert({
      where: {
        action_entityType_segmentKey: {
          action: r.action,
          entityType: r.entityType,
          segmentKey: r.segmentKey,
        },
      },
      update: {
        confidenceScore: new Prisma.Decimal(clamp01(0.5 + (successRate - 0.5) * 0.8)),
        successRate: new Prisma.Decimal(successRate),
        averageImpactAmount: avgAmt === null ? null : new Prisma.Decimal(avgAmt),
        sampleSize: r.sample,
        lastUpdatedAt: now,
      },
      create: {
        action: r.action,
        entityType: r.entityType,
        segmentKey: r.segmentKey,
        confidenceScore: new Prisma.Decimal(clamp01(0.5 + (successRate - 0.5) * 0.8)),
        successRate: new Prisma.Decimal(successRate),
        averageImpactAmount: avgAmt === null ? null : new Prisma.Decimal(avgAmt),
        sampleSize: r.sample,
        lastUpdatedAt: now,
      },
    });
  }

  return { scoresWritten: rows.length, horizonDays, sample: outcomes.length };
}

export async function getBestPerformingActions(params: { minSampleSize?: number; take?: number } = {}) {
  const delegate = getAIRecommendationScoreDelegate();
  const minSample = Math.max(1, Math.min(1000, params.minSampleSize ?? 5));
  const take = Math.max(1, Math.min(50, params.take ?? 10));
  const rows = (await delegate.findMany({
    where: { sampleSize: { gte: minSample }, segmentKey: null },
    orderBy: [{ successRate: "desc" }, { sampleSize: "desc" }],
    take,
    select: { action: true, entityType: true, successRate: true, sampleSize: true },
  })) as Array<{ action: string; entityType: string; successRate: Prisma.Decimal; sampleSize: number }>;
  return rows.map((r) => ({ ...r, successRate: Number(r.successRate) }));
}

export async function getWeakRecommendations(params: { minSampleSize?: number; take?: number } = {}) {
  const delegate = getAIRecommendationScoreDelegate();
  const minSample = Math.max(1, Math.min(1000, params.minSampleSize ?? 5));
  const take = Math.max(1, Math.min(50, params.take ?? 10));
  const rows = (await delegate.findMany({
    where: { sampleSize: { gte: minSample }, segmentKey: null },
    orderBy: [{ successRate: "asc" }, { sampleSize: "desc" }],
    take,
    select: { action: true, entityType: true, successRate: true, sampleSize: true },
  })) as Array<{ action: string; entityType: string; successRate: Prisma.Decimal; sampleSize: number }>;
  return rows.map((r) => ({ ...r, successRate: Number(r.successRate) }));
}

export async function getAILearningSummary(): Promise<LearningSummary> {
  const outcomeDelegate = getAIOutcomeDelegate();

  const counts = (await outcomeDelegate.groupBy({
    by: ["outcomeStatus"],
    _count: { _all: true },
  })) as Array<{ outcomeStatus: AIOutcomeStatus; _count: { _all: number } }>;

  let total = 0;
  const map = new Map<AIOutcomeStatus, number>();
  for (const c of counts) {
    map.set(c.outcomeStatus, c._count._all);
    total += c._count._all;
  }
  const pending = map.get("PENDING") ?? 0;
  const success = map.get("SUCCESS") ?? 0;
  const failed = map.get("FAILED") ?? 0;
  const neutral = map.get("NEUTRAL") ?? 0;
  const resolved = Math.max(0, total - pending);
  const successRate = resolved > 0 ? success / resolved : 0;

  const [best, weak] = await Promise.all([getBestPerformingActions({ take: 1 }), getWeakRecommendations({ take: 1 })]);

  return {
    total,
    pending,
    success,
    failed,
    neutral,
    successRate,
    bestAction: best[0] ? { action: best[0].action, entityType: best[0].entityType, successRate: best[0].successRate, sampleSize: best[0].sampleSize } : null,
    weakAction: weak[0] ? { action: weak[0].action, entityType: weak[0].entityType, successRate: weak[0].successRate, sampleSize: weak[0].sampleSize } : null,
  };
}
