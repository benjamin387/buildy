import "server-only";

import { prisma } from "@/lib/prisma";
import { AIActionStatus } from "@prisma/client";
import { DEFAULT_CASHFLOW_ASSUMPTIONS } from "@/lib/cashflow/assumptions";
import { computeCompanyCashflowForecast } from "@/lib/cashflow/service";
import { evaluateLeadRules, evaluateDesignWorkflowRules, evaluateProjectExecutionRules, evaluateQuotationRules, evaluateFinancialCollectionRules, evaluateCashflowRules, type DecisionAction } from "@/lib/ai/decision-rules";
import { runAIAction } from "@/lib/ai/action-runner";
import type { AIActionName, AIEntityType, RunAIActionInput } from "@/lib/ai/action-types";
import { buildActionPolicy } from "@/lib/ai/automation-policy";
import type { AIAutomationModeKey } from "@/lib/ai/action-permissions";
import { getOrCreateAIAutomationSetting, updateAIAutomationLastRun } from "@/lib/ai/automation-settings";

const GLOBAL_ID = "GLOBAL";

const prismaAny = prisma as unknown as Record<string, any>;

function coerceActionName(action: string): AIActionName | null {
  // We keep this conservative: only allow actions we explicitly support.
  const allowed = new Set<string>([
    "SEND_FIRST_CONTACT_MESSAGE",
    "SEND_FOLLOW_UP_MESSAGE",
    "ESCALATE_TO_SENIOR_DESIGNER",
    "SCHEDULE_SITE_VISIT",
    "MARK_COLD_LEAD",
    "GENERATE_LAYOUT_PLAN",
    "GENERATE_3D_VISUAL",
    "GENERATE_DESIGN_VARIATIONS",
    "GENERATE_SALES_PACKAGE",
    "SEND_QUOTATION",
    "FOLLOW_UP_QUOTATION",
    "PROPOSE_UPSELL",
    "GENERATE_UPSELL_RECOMMENDATION",
    "GENERATE_CONTRACT",
    "FLAG_PROJECT_DELAY",
    "REQUEST_PROGRESS_UPDATE",
    "SEND_PAYMENT_REMINDER",
    "ESCALATE_COLLECTION",
    "CLOSE_COLLECTION_CASE",
    "FLAG_CASHFLOW_RISK",
    "SEND_CONTRACT",
    "CREATE_INVOICE",
    "CHANGE_PRICING",
    "APPROVE_VARIATION",
  ]);
  return allowed.has(action) ? (action as AIActionName) : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function priorityFromDecision(p: DecisionAction["priority"]): RunAIActionInput["priority"] {
  return p;
}

async function getSetting() {
  return await getOrCreateAIAutomationSetting();
}

async function updateSettingLastRun(params: { summary: unknown }) {
  return await updateAIAutomationLastRun({ summary: params.summary });
}

type DedupeKey = string;

function keyOf(action: AIActionName, entityType: AIEntityType, entityId: string): DedupeKey {
  return `${action}::${entityType}::${entityId}`;
}

async function loadExistingKeys(params: { entityType: AIEntityType; entityIds: string[] }): Promise<Set<DedupeKey>> {
  const delegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  if (!delegate) throw new Error("Prisma delegate for AIActionLog not found. Run prisma generate.");
  if (params.entityIds.length === 0) return new Set<DedupeKey>();

  const rows = (await delegate.findMany({
    where: {
      entityType: params.entityType,
      entityId: { in: params.entityIds },
      status: { in: [AIActionStatus.PENDING, AIActionStatus.APPROVAL_REQUIRED, AIActionStatus.APPROVED] },
    },
    select: { action: true, entityType: true, entityId: true },
    take: 5000,
  })) as Array<{ action: string; entityType: string; entityId: string }>;

  return new Set(rows.map((r: any) => keyOf(r.action as AIActionName, r.entityType as AIEntityType, r.entityId as string)));
}

export async function scanLeads() {
  const leads = await prisma.lead.findMany({
    where: { status: { in: ["NEW", "CONTACTED", "QUALIFYING", "SITE_VISIT_SCHEDULED", "QUOTATION_PENDING"] } },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
  });

  const leadIds = leads.map((l) => l.id);
  const lastActivities = leadIds.length
    ? await prisma.leadActivity.groupBy({
        by: ["leadId"],
        where: { leadId: { in: leadIds } },
        _max: { createdAt: true },
      })
    : [];
  const lastActMap = new Map<string, Date>();
  for (const row of lastActivities) {
    if (row.leadId && row._max.createdAt) lastActMap.set(row.leadId, row._max.createdAt);
  }

  const actions: Array<RunAIActionInput> = [];
  for (const l of leads) {
    const decisions = evaluateLeadRules(
      {
        status: l.status,
        createdAt: l.createdAt,
        projectAddress: l.projectAddress,
        projectType: l.projectType,
        propertyCategory: l.propertyCategory,
        residentialPropertyType: l.residentialPropertyType ?? null,
        requirementSummary: l.requirementSummary ?? null,
        notes: l.notes ?? null,
        lastActivityAt: lastActMap.get(l.id) ?? null,
        clientResponded: null,
      },
      new Date(),
    );

    for (const d of decisions) {
      const actionName = coerceActionName(d.action);
      if (!actionName) continue;
      actions.push({
        action: actionName,
        entityType: "LEAD",
        entityId: l.id,
        priority: priorityFromDecision(d.priority),
        confidence: clamp01(d.confidence),
        reason: d.reason,
        metadata: { leadNumber: l.leadNumber },
      });
    }
  }

  return { scanned: leads.length, actions };
}

export async function scanDesignBriefs() {
  const briefs = await prisma.designBrief.findMany({
    where: { status: { in: ["DESIGN_IN_PROGRESS", "QS_IN_PROGRESS", "READY_FOR_QUOTATION"] } },
    orderBy: [{ updatedAt: "asc" }],
    take: 200,
    include: {
      areas: {
        select: { id: true, name: true, roomType: true },
        orderBy: [{ createdAt: "asc" }],
      },
    },
  });

  const areaIds = briefs.flatMap((b) => b.areas.map((a) => a.id));
  const [layoutCounts, renderCounts, qsCounts] = await Promise.all([
    areaIds.length
      ? prisma.generatedLayoutPlan.groupBy({
          by: ["designAreaId"],
          where: { designAreaId: { in: areaIds } },
          _count: { _all: true },
        })
      : [],
    areaIds.length
      ? prisma.visualRender.groupBy({
          by: ["designAreaId"],
          where: { designAreaId: { in: areaIds } },
          _count: { _all: true },
        })
      : [],
    areaIds.length
      ? prisma.qSBoqDraftItem.groupBy({
          by: ["designAreaId"],
          where: { designAreaId: { in: areaIds } },
          _count: { _all: true },
        })
      : [],
  ]);

  const layoutMap = new Map<string, number>();
  for (const r of layoutCounts) layoutMap.set(r.designAreaId, r._count._all);
  const renderMap = new Map<string, number>();
  for (const r of renderCounts) renderMap.set(r.designAreaId, r._count._all);
  const qsMap = new Map<string, number>();
  for (const r of qsCounts) qsMap.set(r.designAreaId, r._count._all);

  const actions: RunAIActionInput[] = [];

  for (const b of briefs) {
    const areas = b.areas.map((a) => {
      const layouts = layoutMap.get(a.id) ?? 0;
      const renders = renderMap.get(a.id) ?? 0;
      const qs = qsMap.get(a.id) ?? 0;
      return {
        areaId: a.id,
        name: a.name,
        roomType: a.roomType,
        hasLayoutPlan: layouts > 0,
        visualRenderCount: renders,
        hasAnyVisualRender: renders > 0,
        hasQsBoqDraftItems: qs > 0,
      };
    });

    // Generate per-area actions for missing layout/visuals/variations.
    for (const a of areas) {
      if (!a.hasLayoutPlan) {
        actions.push({
          action: "GENERATE_LAYOUT_PLAN",
          entityType: "DESIGN_AREA",
          entityId: a.areaId,
          priority: "HIGH",
          confidence: 0.78,
          reason: `Missing layout plan for area: ${a.name}.`,
          metadata: { areaId: a.areaId, title: `AI Layout Plan (${a.name})` },
        });
      }
      if (a.hasLayoutPlan && !a.hasAnyVisualRender) {
        actions.push({
          action: "GENERATE_3D_VISUAL",
          entityType: "DESIGN_AREA",
          entityId: a.areaId,
          priority: "HIGH",
          confidence: 0.76,
          reason: `Missing 3D visual render for area: ${a.name}.`,
          metadata: { areaId: a.areaId },
        });
      }
      if (a.hasAnyVisualRender && a.visualRenderCount < 3) {
        actions.push({
          action: "GENERATE_DESIGN_VARIATIONS",
          entityType: "DESIGN_AREA",
          entityId: a.areaId,
          priority: "MEDIUM",
          confidence: 0.7,
          reason: `Less than 3 visual options for area: ${a.name}.`,
          metadata: { areaId: a.areaId },
        });
      }
    }

    // Brief-level readiness rule
    const decisions = evaluateDesignWorkflowRules({
      designBriefId: b.id,
      status: b.status,
      areas: areas.map((a) => ({
        areaId: a.areaId,
        name: a.name,
        hasLayoutPlan: a.hasLayoutPlan,
        visualRenderCount: a.visualRenderCount,
        hasAnyVisualRender: a.hasAnyVisualRender,
        hasQsBoqDraftItems: a.hasQsBoqDraftItems,
      })),
    });
    for (const d of decisions) {
      const actionName = coerceActionName(d.action);
      if (!actionName) continue;
      actions.push({
        action: actionName,
        entityType: "DESIGN_BRIEF",
        entityId: b.id,
        priority: priorityFromDecision(d.priority),
        confidence: clamp01(d.confidence),
        reason: d.reason,
        metadata: { designBriefId: b.id, projectId: b.projectId ?? null },
      });
    }
  }

  return { scanned: briefs.length, actions };
}

export async function scanProjects() {
  const projects = await prisma.project.findMany({
    where: { status: { in: ["CONTRACTED", "IN_PROGRESS", "ON_HOLD"] } },
    select: { id: true, status: true, targetCompletionDate: true, actualCompletionDate: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 400,
  });

  const projectIds = projects.map((p) => p.id);
  const lastLogs = projectIds.length
    ? await prisma.projectProgressLog.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _max: { logDate: true },
      })
    : [];
  const lastLogMap = new Map<string, Date>();
  for (const row of lastLogs) {
    if (row.projectId && row._max.logDate) lastLogMap.set(row.projectId, row._max.logDate);
  }

  const actions: RunAIActionInput[] = [];
  for (const p of projects) {
    const decisions = evaluateProjectExecutionRules(
      {
        status: p.status,
        targetCompletionDate: p.targetCompletionDate,
        actualCompletionDate: p.actualCompletionDate,
        lastProgressLogAt: lastLogMap.get(p.id) ?? null,
      },
      new Date(),
    );
    for (const d of decisions) {
      const actionName = coerceActionName(d.action);
      if (!actionName) continue;
      actions.push({
        action: actionName,
        entityType: "PROJECT",
        entityId: p.id,
        priority: priorityFromDecision(d.priority),
        confidence: clamp01(d.confidence),
        reason: d.reason,
        metadata: { projectId: p.id },
      });
    }
  }

  return { scanned: projects.length, actions };
}

export async function scanInvoices() {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: "VOID" },
      OR: [
        { dueDate: { lt: now }, outstandingAmount: { gt: 0 } },
        { outstandingAmount: { lte: 0 } },
      ],
    },
    select: { id: true, status: true, dueDate: true, outstandingAmount: true },
    orderBy: [{ dueDate: "asc" }],
    take: 600,
  });

  const actions: RunAIActionInput[] = [];
  for (const inv of invoices) {
    const overdueDays =
      inv.dueDate && inv.dueDate < now ? Math.floor((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;

    const decisions = evaluateFinancialCollectionRules(
      {
        status: inv.status,
        dueDate: inv.dueDate,
        outstandingAmount: Number(inv.outstandingAmount),
        overdueDays,
      },
      now,
    );

    for (const d of decisions) {
      const actionName = coerceActionName(d.action);
      if (!actionName) continue;
      actions.push({
        action: actionName,
        entityType: "INVOICE",
        entityId: inv.id,
        priority: priorityFromDecision(d.priority),
        confidence: clamp01(d.confidence),
        reason: d.reason,
        metadata: { invoiceId: inv.id, overdueDays },
      });
    }
  }

  return { scanned: invoices.length, actions };
}

export async function scanCollections() {
  // Keep lightweight: only create escalation recommendations for CRITICAL cases not escalated.
  const cases = await prisma.collectionCase.findMany({
    where: { status: { notIn: ["PAID", "CLOSED"] }, severity: "CRITICAL" },
    select: { id: true, invoiceId: true, daysPastDue: true, status: true },
    orderBy: [{ daysPastDue: "desc" }],
    take: 200,
  });

  const actions: RunAIActionInput[] = [];
  for (const c of cases) {
    if (c.daysPastDue <= 30) continue;
    actions.push({
      action: "ESCALATE_COLLECTION",
      entityType: "COLLECTION_CASE",
      entityId: c.id,
      priority: "CRITICAL",
      confidence: 0.8,
      reason: `Collection case is CRITICAL and >30 DPD (DPD=${c.daysPastDue}).`,
      metadata: { caseId: c.id, invoiceId: c.invoiceId, daysPastDue: c.daysPastDue },
    });
  }

  return { scanned: cases.length, actions };
}

export async function scanCashflow() {
  const forecast = await computeCompanyCashflowForecast(DEFAULT_CASHFLOW_ASSUMPTIONS);
  const actions = evaluateCashflowRules({
    expectedInflow: forecast.windows.find((w) => w.days === 30)?.inflows ?? forecast.expectedInflows,
    expectedOutflow: forecast.windows.find((w) => w.days === 30)?.outflows ?? forecast.expectedOutflows,
  });

  const mapped: RunAIActionInput[] = [];
  for (const d of actions) {
    const actionName = coerceActionName(d.action);
    if (!actionName) continue;
    mapped.push({
      action: actionName,
      entityType: "PLATFORM",
      entityId: "COMPANY",
      priority: priorityFromDecision(d.priority),
      confidence: clamp01(d.confidence),
      reason: d.reason,
      metadata: {
        riskLevel: forecast.riskLevel,
        expectedInflows: forecast.expectedInflows,
        expectedOutflows: forecast.expectedOutflows,
        projectedClosingBalance: forecast.projectedClosingBalance,
      },
    });
  }

  return { scanned: 1, actions: mapped, forecast };
}

export type OrchestrationSummary = {
  ok: boolean;
  mode: AIAutomationModeKey;
  isActive: boolean;
  scanned: {
    leads: number;
    designBriefs: number;
    projects: number;
    invoices: number;
    collections: number;
    cashflow: number;
  };
  actions: {
    evaluated: number;
    created: number;
    executed: number;
    skippedDuplicates: number;
    errors: number;
  };
  errors: Array<{ where: string; message: string }>;
};

export async function runAIOrchestration(params?: { dryRun?: boolean; actorUserId?: string | null }) {
  const setting = await getSetting();
  const summary: OrchestrationSummary = {
    ok: true,
    mode: setting.automationMode,
    isActive: setting.isActive,
    scanned: { leads: 0, designBriefs: 0, projects: 0, invoices: 0, collections: 0, cashflow: 0 },
    actions: { evaluated: 0, created: 0, executed: 0, skippedDuplicates: 0, errors: 0 },
    errors: [],
  };

  if (!setting.isActive) {
    await updateSettingLastRun({ summary });
    return summary;
  }

  const buckets: Array<{ name: string; fn: () => Promise<{ scanned: number; actions: RunAIActionInput[] }> }> = [
    { name: "leads", fn: scanLeads },
    { name: "designBriefs", fn: scanDesignBriefs },
    { name: "projects", fn: scanProjects },
    { name: "invoices", fn: scanInvoices },
    { name: "collections", fn: scanCollections },
    {
      name: "cashflow",
      fn: async () => {
        const r = await scanCashflow();
        return { scanned: r.scanned, actions: r.actions };
      },
    },
  ];

  const allActions: RunAIActionInput[] = [];

  for (const b of buckets) {
    try {
      const r = await b.fn();
      (summary.scanned as any)[b.name] = r.scanned;
      allActions.push(...r.actions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      summary.actions.errors += 1;
      summary.errors.push({ where: b.name, message: msg });
    }
  }

  // Apply AI Control Center allow policy before dedupe to avoid log spam.
  const filtered: RunAIActionInput[] = [];
  for (const a of allActions) {
    const policy = buildActionPolicy({ setting: setting as any, action: a.action });
    if (!policy.allowed) continue;
    filtered.push(a);
  }
  allActions.length = 0;
  allActions.push(...filtered);

  summary.actions.evaluated = allActions.length;

  // Dedupe against pending/approval-required/approved logs.
  const existing = new Set<DedupeKey>();
  const entityBuckets = new Map<AIEntityType, Set<string>>();
  for (const a of allActions) {
    const set = entityBuckets.get(a.entityType) ?? new Set<string>();
    set.add(a.entityId);
    entityBuckets.set(a.entityType, set);
  }

  for (const [entityType, idsSet] of entityBuckets) {
    const ids = Array.from(idsSet);
    try {
      const keys = await loadExistingKeys({ entityType, entityIds: ids });
      for (const k of keys) existing.add(k);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      summary.actions.errors += 1;
      summary.errors.push({ where: `dedupe:${entityType}`, message: msg });
    }
  }

  for (const a of allActions) {
    const k = keyOf(a.action, a.entityType, a.entityId);
    if (existing.has(k)) {
      summary.actions.skippedDuplicates += 1;
      continue;
    }
    existing.add(k);

    try {
      const r = await runAIAction({ ...a, actorUserId: params?.actorUserId ?? null, dryRun: Boolean(params?.dryRun) });
      summary.actions.created += 1;
      if (r.executed) summary.actions.executed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      summary.actions.errors += 1;
      summary.errors.push({ where: `runAIAction:${a.action}`, message: msg });
    }
  }

  await updateSettingLastRun({ summary });
  return summary;
}
