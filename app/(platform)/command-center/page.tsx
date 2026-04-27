import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { computeFollowUpsDueToday } from "@/lib/leads/service";
import { parseCashflowAssumptions } from "@/lib/cashflow/assumptions";
import { computeCompanyCashflowForecast, type CompanyCashflowResult } from "@/lib/cashflow/service";
import { toMoney } from "@/lib/cashflow/forecast-engine";
import { getAILearningSummary } from "@/lib/ai/learning-layer";
import { getOrCreateAIAutomationSetting } from "@/lib/ai/automation-settings";
import { safeQuery } from "@/lib/server/safe-query";
import {
  AISalesInsightType,
  CashflowRiskLevel,
  DesignBriefStatus,
  LeadStatus,
  ProjectStatus,
  QuotationStatus,
} from "@prisma/client";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
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

function riskBadgeClass(risk: string): string {
  switch (risk) {
    case "CRITICAL":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "MEDIUM":
      return "border-yellow-200 bg-yellow-50 text-yellow-800";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function startOfMonth(d = new Date()): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireExecutive();
  await requirePermission({ moduleKey: "AI_ACTIONS" satisfies PermissionModuleKey, action: "view" });

  const now = new Date();
  const monthStart = startOfMonth(now);
  const nextMonthStart = startOfMonth(addMonths(now, 1));
  const today = startOfToday();

  const assumptions = parseCashflowAssumptions(await searchParams);
  const defaultCashflow: CompanyCashflowResult = {
    forecastStartDate: today,
    forecastEndDate: today,
    openingBalance: toMoney(assumptions.openingBalance),
    expectedInflows: 0,
    expectedOutflows: 0,
    netCashflow: 0,
    projectedClosingBalance: toMoney(assumptions.openingBalance),
    overdueReceivables: 0,
    overduePayables: 0,
    riskLevel: CashflowRiskLevel.LOW,
    lines: [],
    windows: [
      { days: 7, inflows: 0, outflows: 0, net: 0 },
      { days: 30, inflows: 0, outflows: 0, net: 0 },
      { days: 60, inflows: 0, outflows: 0, net: 0 },
      { days: 90, inflows: 0, outflows: 0, net: 0 },
    ],
    projectRanking: [],
  };

  const cashflow = await safeQuery(() => computeCompanyCashflowForecast(assumptions), defaultCashflow);

  const followUps = await safeQuery(() => computeFollowUpsDueToday(), { dueToday: 0 });

  const [
    leadCounts,
    quotationsPendingCount,
    acceptedQuotationsCount,
    salesPackagesReadyCount,
    activeContractValueAgg,
    invoicedThisMonthAgg,
    collectedThisMonthAgg,
    outstandingAgg,
    overdueAgg,
    projectCostAgg,
    pnlAlerts,
    delayedProjectsCount,
    projectsNearCompletionCount,
    overdueMilestonesCount,
    overdueTasksCount,
    designBriefsPendingCount,
    unpaidSupplierBillsAgg,
    purchaseOrderCommitAgg,
    openCollectionCasesCount,
    criticalCollectionCasesCount,
    collectionActionsDueTodayCount,
    hotLeadsInsights,
    upsellOpportunities,
    budgetRiskScenarios,
    topProjects,
    overdueReceivables,
  ] = await Promise.all([
    safeQuery(
      () =>
        prisma.lead.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
      [] as Array<{ status: LeadStatus; _count: { _all: number } }>,
    ),
    safeQuery(
      () =>
        prisma.quotation.count({
          where: {
            isLatest: true,
            status: { in: [QuotationStatus.DRAFT, QuotationStatus.PREPARED, QuotationStatus.SENT] },
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.quotation.count({
          where: { isLatest: true, status: QuotationStatus.APPROVED },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.designBrief.count({
          where: { status: DesignBriefStatus.SALES_PACKAGE_READY },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.project.aggregate({
          _sum: { contractValue: true },
          where: { status: { in: [ProjectStatus.CONTRACTED, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD] } },
        }),
      { _sum: { contractValue: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.invoice.aggregate({
          _sum: { totalAmount: true },
          where: { status: { not: "VOID" }, issueDate: { gte: monthStart, lt: nextMonthStart } },
        }),
      { _sum: { totalAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.paymentReceipt.aggregate({
          _sum: { amount: true },
          where: { paymentDate: { gte: monthStart, lt: nextMonthStart } },
        }),
      { _sum: { amount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.invoice.aggregate({
          _sum: { outstandingAmount: true },
          where: { status: { not: "VOID" }, outstandingAmount: { gt: 0 } },
        }),
      { _sum: { outstandingAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.invoice.aggregate({
          _sum: { outstandingAmount: true },
          where: { status: { not: "VOID" }, outstandingAmount: { gt: 0 }, dueDate: { lt: today } },
        }),
      { _sum: { outstandingAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.project.aggregate({
          _sum: { committedCost: true, actualCost: true, projectedProfit: true },
          where: { status: { notIn: [ProjectStatus.CANCELLED] } },
        }),
      { _sum: { committedCost: 0, actualCost: 0, projectedProfit: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.pnLAlert.findMany({
          where: { isResolved: false, severity: { in: ["HIGH", "CRITICAL"] } },
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          take: 20,
          include: { project: { select: { id: true, name: true, projectCode: true } } },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.project.count({
          where: {
            status: { in: [ProjectStatus.CONTRACTED, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD] },
            targetCompletionDate: { lt: today },
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.project.count({
          where: {
            status: { in: [ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD] },
            targetCompletionDate: { gte: today, lt: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000) },
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.projectMilestone.count({
          where: { dueDate: { lt: today }, status: { not: "DONE" } },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.projectTask.count({
          where: { dueDate: { lt: today }, status: { notIn: ["DONE", "CANCELLED"] } },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.designBrief.count({
          where: {
            status: {
              in: [
                DesignBriefStatus.DRAFT,
                DesignBriefStatus.DESIGN_IN_PROGRESS,
                DesignBriefStatus.QS_IN_PROGRESS,
                DesignBriefStatus.READY_FOR_QUOTATION,
                DesignBriefStatus.PRESENTATION_READY,
              ],
            },
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.supplierBill.aggregate({
          _sum: { outstandingAmount: true },
          where: { status: { notIn: ["VOID", "PAID"] }, outstandingAmount: { gt: 0 } },
        }),
      { _sum: { outstandingAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.purchaseOrder.aggregate({
          _sum: { totalAmount: true },
          where: { status: { not: "CANCELLED" } },
        }),
      { _sum: { totalAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.collectionCase.count({
          where: { status: { notIn: ["PAID", "CLOSED"] } },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.collectionCase.count({
          where: { status: { notIn: ["PAID", "CLOSED"] }, severity: "CRITICAL" },
        }),
      0,
    ),
    safeQuery(
      () =>
        prisma.collectionAction.count({
          where: {
            status: "PENDING",
            scheduledAt: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
          },
        }),
      0,
    ),
    safeQuery(
      () =>
        (prisma as any).aISalesInsight?.findMany({
          where: {
            insightType: { in: [AISalesInsightType.LEAD_QUALITY, AISalesInsightType.NEXT_ACTION] },
            status: { in: ["DRAFT", "REVIEWED"] },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 12,
          include: { lead: { select: { id: true, leadNumber: true, customerName: true, status: true } } },
        }) ?? [],
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.upsellRecommendation.findMany({
          where: { status: "SUGGESTED", priority: { in: ["HIGH", "MEDIUM"] } },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 10,
          include: { project: { select: { id: true, name: true, projectCode: true } } },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.budgetOptimizationScenario.findMany({
          where: { isSelected: true },
          orderBy: [{ createdAt: "desc" }],
          take: 10,
          include: { project: { select: { id: true, name: true, projectCode: true } } },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.project.findMany({
          orderBy: [{ contractValue: "desc" }],
          take: 10,
          select: { id: true, name: true, projectCode: true, contractValue: true, projectedProfit: true, status: true, targetCompletionDate: true },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.invoice.findMany({
          where: { status: { not: "VOID" }, outstandingAmount: { gt: 0 }, dueDate: { lt: today } },
          orderBy: [{ dueDate: "asc" }],
          take: 10,
          include: { project: { select: { id: true, name: true, projectCode: true } } },
        }),
      [] as any[],
    ),
  ]);

  const aiLearning = await (async () => {
    try {
      return await getAILearningSummary();
    } catch {
      return {
        total: 0,
        pending: 0,
        success: 0,
        failed: 0,
        neutral: 0,
        successRate: 0,
        bestAction: null,
        weakAction: null,
      };
    }
  })();

  const prismaAny = prisma as unknown as Record<string, any>;
  const aiDelegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  const [aiActionsPendingApprovalCount, aiActionsPendingApproval, aiCriticalActionsCount] = aiDelegate
    ? await Promise.all([
        safeQuery(() => aiDelegate.count({ where: { status: "APPROVAL_REQUIRED" } }) as Promise<number>, 0),
        safeQuery(
          () =>
            aiDelegate.findMany({
              where: { status: "APPROVAL_REQUIRED" },
              orderBy: [{ createdAt: "desc" }],
              take: 8,
            }) as Promise<any[]>,
          [] as any[],
        ),
        safeQuery(
          () =>
            aiDelegate.count({
              where: { priority: "CRITICAL", status: { in: ["PENDING", "APPROVAL_REQUIRED", "APPROVED"] } },
            }) as Promise<number>,
          0,
        ),
      ])
    : [0, [] as any[], 0];

  const aiSetting = await safeQuery(
    () => getOrCreateAIAutomationSetting(),
    {
      id: "GLOBAL",
      automationMode: "ASSISTED",
      isActive: true,
      allowLeadFollowUp: true,
      allowDesignGeneration: true,
      allowQuotationDrafting: false,
      allowPaymentReminder: false,
      allowCollectionsEscalation: false,
      allowSalesPackageGeneration: false,
      requireApprovalForQuotations: true,
      requireApprovalForContracts: true,
      requireApprovalForInvoices: true,
      requireApprovalForPricingChanges: true,
      requireApprovalForLegalEscalation: true,
      updatedBy: null,
      lastRunAt: null,
      lastRunSummary: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as any,
  );

  const leadCountMap = new Map<string, number>();
  for (const row of leadCounts) {
    leadCountMap.set(row.status, row._count._all);
  }

  const newLeads = leadCountMap.get(LeadStatus.NEW) ?? 0;
  const contactedLeads = leadCountMap.get(LeadStatus.CONTACTED) ?? 0;
  const siteVisitLeads = leadCountMap.get(LeadStatus.SITE_VISIT_SCHEDULED) ?? 0;
  const quotationPendingLeads = leadCountMap.get(LeadStatus.QUOTATION_PENDING) ?? 0;
  const convertedLeads = leadCountMap.get(LeadStatus.CONVERTED) ?? 0;

  const pipelineValueAgg = await safeQuery(
    () =>
      prisma.quotation.aggregate({
        _sum: { totalAmount: true },
        where: { isLatest: true, status: { in: [QuotationStatus.SENT, QuotationStatus.PREPARED] } },
      }),
    { _sum: { totalAmount: 0 } } as any,
  );

  const totalPipelineValue = toMoney(pipelineValueAgg._sum.totalAmount ?? 0);
  const activeContractValue = toMoney(activeContractValueAgg._sum.contractValue ?? 0);
  const invoicedThisMonth = toMoney(invoicedThisMonthAgg._sum.totalAmount ?? 0);
  const collectedThisMonth = toMoney(collectedThisMonthAgg._sum.amount ?? 0);
  const outstandingReceivables = toMoney(outstandingAgg._sum.outstandingAmount ?? 0);
  const overdueReceivablesAmt = toMoney(overdueAgg._sum.outstandingAmount ?? 0);
  const committedCost = toMoney(projectCostAgg._sum.committedCost ?? 0);
  const actualCost = toMoney(projectCostAgg._sum.actualCost ?? 0);
  const projectedGrossProfit = toMoney(projectCostAgg._sum.projectedProfit ?? 0);

  const unpaidSupplierBills = toMoney(unpaidSupplierBillsAgg._sum.outstandingAmount ?? 0);
  const purchaseOrderCommit = toMoney(purchaseOrderCommitAgg._sum.totalAmount ?? 0);

  const cashShortfallLines = cashflow.lines
    .filter((l) => l.status !== "CANCELLED")
    .slice()
    .sort((a, b) => a.expectedDate.getTime() - b.expectedDate.getTime())
    .slice(0, 12);

  const atRiskProjects = cashflow.projectRanking.slice(0, 10);

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Owner / Command Center
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Executive Command Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              One view of pipeline, delivery, finance, collections, and AI intelligence across the business.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
              {user.primaryRoleLabel}
            </span>
            <Link
              href="/cashflow"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Cashflow Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <KpiCard title="Total Pipeline Value" value={formatCurrency(totalPipelineValue)} />
        <KpiCard title="Active Contract Value" value={formatCurrency(activeContractValue)} />
        <KpiCard title="Invoiced This Month" value={formatCurrency(invoicedThisMonth)} />
        <KpiCard title="Collected This Month" value={formatCurrency(collectedThisMonth)} />
        <KpiCard title="Outstanding Receivables" value={formatCurrency(outstandingReceivables)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <KpiCard title="Overdue Receivables" value={formatCurrency(overdueReceivablesAmt)} tone="risk" />
        <KpiCard title="Committed Cost (Projects)" value={formatCurrency(committedCost)} />
        <KpiCard title="Actual Cost (Projects)" value={formatCurrency(actualCost)} />
        <KpiCard title="Projected Gross Profit" value={formatCurrency(projectedGrossProfit)} />
        <KpiCard
          title="Cashflow Risk"
          value={cashflow.riskLevel}
          badge
          badgeClass={riskBadgeClass(cashflow.riskLevel)}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel title="Sales Pipeline" subtitle="Lead flow and sales readiness counts.">
          <MetricRow label="New leads" value={String(newLeads)} />
          <MetricRow label="Contacted" value={String(contactedLeads)} />
          <MetricRow label="Site visits scheduled" value={String(siteVisitLeads)} />
          <MetricRow label="Follow-ups due today" value={String(followUps.dueToday)} strong />
          <div className="mt-4 border-t border-neutral-200 pt-4">
            <MetricRow label="Quotations pending" value={String(quotationsPendingCount)} />
            <MetricRow label="Sales packages ready" value={String(salesPackagesReadyCount)} />
            <MetricRow label="Accepted quotations" value={String(acceptedQuotationsCount)} strong />
            <MetricRow label="Converted leads" value={String(convertedLeads)} />
            <MetricRow label="Lead status: quotation pending" value={String(quotationPendingLeads)} />
          </div>
        </Panel>

        <Panel title="Project Delivery Risk" subtitle="Schedule and workflow bottlenecks.">
          <MetricRow label="Delayed projects (past target)" value={String(delayedProjectsCount)} strong />
          <MetricRow label="Projects near completion (14d)" value={String(projectsNearCompletionCount)} />
          <MetricRow label="Design briefs pending" value={String(designBriefsPendingCount)} />
          <MetricRow label="Overdue milestones" value={String(overdueMilestonesCount)} />
          <MetricRow label="Overdue tasks" value={String(overdueTasksCount)} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/projects" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Open Projects
            </Link>
            <Link href="/sales" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Sales Dashboard
            </Link>
          </div>
        </Panel>

        <Panel title="Financial Risk" subtitle="Margin leakage signals and payable exposure.">
          <MetricRow label="P&L alerts (high/critical)" value={String(pnlAlerts.length)} strong />
          <MetricRow label="Unpaid supplier bills" value={formatCurrency(unpaidSupplierBills)} />
          <MetricRow label="PO commitments (gross)" value={formatCurrency(purchaseOrderCommit)} />
          <MetricRow label="Overdue receivables" value={formatCurrency(overdueReceivablesAmt)} strong />
          {cashflow.projectedClosingBalance < 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Cash shortfall warning</p>
              <p className="mt-1">
                Projected closing balance is negative within the forecast horizon.
              </p>
            </div>
          ) : null}
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel title="Collections" subtitle="Overdue receivables chasing control.">
          <MetricRow label="Open cases" value={String(openCollectionCasesCount)} strong />
          <MetricRow label="Critical cases" value={String(criticalCollectionCasesCount)} />
          <MetricRow label="Actions due today" value={String(collectionActionsDueTodayCount)} />
          <MetricRow label="AI actions pending approval" value={String(aiActionsPendingApprovalCount)} />
          <MetricRow label="Critical AI recommendations" value={String(aiCriticalActionsCount)} strong />
          <MetricRow label="AI success rate" value={formatPct(aiLearning.successRate)} />
          <MetricRow label="AI orchestrator last run" value={formatDate(aiSetting?.lastRunAt ?? null)} />
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <Link href="/collections" className="inline-flex h-10 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Open Collections
              </Link>
              <Link href="/ai-learning" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                AI Learning
              </Link>
              <Link href="/ai-actions" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                AI Actions
              </Link>
              <Link href="/ai-actions/orchestrator" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Orchestrator
              </Link>
            </div>
          </div>
          {aiActionsPendingApproval.length ? (
            <div className="mt-4 space-y-2">
              {aiActionsPendingApproval.slice(0, 4).map((a) => (
                <div key={a.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">AI ACTION</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-950">{a.action}</p>
                  <p className="mt-1 text-sm text-neutral-700 line-clamp-2">{a.reason}</p>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel title="AI Intelligence" subtitle="Draft insights (review-only).">
          {hotLeadsInsights.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">No AI insights yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {hotLeadsInsights.slice(0, 6).map((i) => (
                <div key={i.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{i.insightType}</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-950">{i.title}</p>
                  <p className="mt-1 text-sm text-neutral-700 line-clamp-3">{i.summary}</p>
                  {i.lead ? (
                    <Link href={`/leads/${i.lead.id}`} className="mt-2 inline-flex text-sm font-semibold text-neutral-900 hover:underline">
                      Lead {i.lead.leadNumber} · {i.lead.customerName}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/sales/assistant" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Sales Assistant
            </Link>
            <Link href="/sales" className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Sales
            </Link>
          </div>
        </Panel>

        <Panel title="Upsell & Budget Signals" subtitle="Commercial opportunities and budget scenarios.">
          <div className="mt-2 grid gap-3">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <MetricRow label="Upsell opportunities" value={String(upsellOpportunities.length)} strong />
              <MetricRow label="Saved budget scenarios" value={String(budgetRiskScenarios.length)} />
            </div>
            <div className="space-y-2">
              {upsellOpportunities.slice(0, 4).map((u) => (
                <div key={u.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <p className="text-sm font-semibold text-neutral-950">{u.title}</p>
                  <p className="mt-1 text-sm text-neutral-700 line-clamp-2">{u.description}</p>
                  <p className="mt-2 text-xs text-neutral-600">
                    Revenue +{formatCurrency(toMoney(u.estimatedRevenueIncrease))} · Profit +{formatCurrency(toMoney(u.estimatedProfitIncrease))}
                  </p>
                  <Link href={`/projects/${u.project.id}`} className="mt-2 inline-flex text-sm font-semibold text-neutral-900 hover:underline">
                    {u.project.projectCode ? `${u.project.projectCode} · ` : ""}
                    {u.project.name}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <TablePanel title="Top 10 Projects by Revenue" subtitle="Highest contract value projects (not cancelled).">
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Project</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Contract Value</th>
                  <th className="px-4 py-3 text-right font-semibold">Projected Profit</th>
                  <th className="px-4 py-3 text-left font-semibold">Target</th>
                </tr>
              </thead>
              <tbody>
                {topProjects.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 text-neutral-900">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.projectCode ? `${p.projectCode} · ` : ""}
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.status}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatCurrency(toMoney(p.contractValue))}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(toMoney(p.projectedProfit))}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(p.targetCompletionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TablePanel>

        <TablePanel title="Top 10 At-Risk Projects" subtitle="Next 30 days net cashflow (negative first).">
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Project</th>
                  <th className="px-4 py-3 text-right font-semibold">Inflows</th>
                  <th className="px-4 py-3 text-right font-semibold">Outflows</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                </tr>
              </thead>
              <tbody>
                {atRiskProjects.map((p) => (
                  <tr key={p.projectId} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 text-neutral-900">
                      <Link href={`/projects/${p.projectId}/cashflow`} className="font-medium hover:underline">
                        {p.label}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(p.inflows30)}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(p.outflows30)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(p.net30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TablePanel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <TablePanel title="Upcoming Cash Inflows/Outflows" subtitle="Next expected cash movements.">
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Direction</th>
                  <th className="px-4 py-3 text-left font-semibold">Label</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {cashShortfallLines.map((l, idx) => (
                  <tr key={`${l.sourceType}:${l.sourceId ?? idx}`} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 text-neutral-700">{formatDate(l.expectedDate)}</td>
                    <td className="px-4 py-3 text-neutral-700">{l.direction}</td>
                    <td className="px-4 py-3 text-neutral-900">{l.label}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatCurrency(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TablePanel>

        <TablePanel title="Overdue Receivables" subtitle="Top overdue invoices by due date.">
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Project</th>
                  <th className="px-4 py-3 text-left font-semibold">Due</th>
                  <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {overdueReceivables.map((inv) => (
                  <tr key={inv.id} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 text-neutral-900">
                      <Link href={`/projects/${inv.projectId}/invoices/${inv.id}`} className="font-medium hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      <Link href={`/projects/${inv.project.id}`} className="hover:underline">
                        {inv.project.projectCode ? `${inv.project.projectCode} · ` : ""}
                        {inv.project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(toMoney(inv.outstandingAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TablePanel>
      </section>

      {pnlAlerts.length > 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Margin Leakage Alerts</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Unresolved high/critical P&amp;L alerts.
          </p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Project</th>
                  <th className="px-4 py-3 text-left font-semibold">Severity</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Message</th>
                  <th className="px-4 py-3 text-left font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {pnlAlerts.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 text-neutral-900">
                      <Link href={`/projects/${a.project.id}/pnl`} className="font-medium hover:underline">
                        {a.project.projectCode ? `${a.project.projectCode} · ` : ""}
                        {a.project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${riskBadgeClass(a.severity)}`}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{a.type}</td>
                    <td className="px-4 py-3 text-neutral-700">{a.message}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function KpiCard(props: { title: string; value: string; tone?: "default" | "risk"; badge?: boolean; badgeClass?: string }) {
  const tone = props.tone ?? "default";
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      {props.badge ? (
        <div className="mt-3">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${props.badgeClass ?? "border-neutral-200 bg-neutral-50 text-neutral-700"}`}>
            {props.value}
          </span>
        </div>
      ) : (
        <p className={`mt-3 text-2xl font-semibold tracking-tight ${tone === "risk" ? "text-red-700" : "text-neutral-950"}`}>
          {props.value}
        </p>
      )}
    </div>
  );
}

function Panel(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
      <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function TablePanel(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
      <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function MetricRow(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-neutral-600">{props.label}</span>
      <span className={props.strong ? "font-semibold text-neutral-950" : "font-medium text-neutral-900"}>
        {props.value}
      </span>
    </div>
  );
}
