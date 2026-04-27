import "server-only";

import { prisma } from "@/lib/prisma";
import { PnLAlertSeverity, type PnLAlertType } from "@prisma/client";
import { getActiveLockedBudget } from "@/lib/execution/budget-service";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function severityForPct(pct: number): PnLAlertSeverity {
  if (pct >= 25) return "CRITICAL";
  if (pct >= 15) return "HIGH";
  if (pct >= 5) return "MEDIUM";
  return "LOW";
}

async function resolveType(projectId: string, type: PnLAlertType) {
  const now = new Date();
  await prisma.pnLAlert.updateMany({
    where: { projectId, type, isResolved: false },
    data: { isResolved: true, resolvedAt: now },
  });
}

async function upsertActive(params: {
  projectId: string;
  type: PnLAlertType;
  severity: PnLAlertSeverity;
  message: string;
}) {
  const existing = await prisma.pnLAlert.findFirst({
    where: { projectId: params.projectId, type: params.type, isResolved: false },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) {
    await prisma.pnLAlert.create({
      data: {
        projectId: params.projectId,
        type: params.type,
        severity: params.severity,
        message: params.message,
        isResolved: false,
        resolvedAt: null,
      },
    });
    return;
  }

  if (existing.message !== params.message || existing.severity !== params.severity) {
    await prisma.pnLAlert.update({
      where: { id: existing.id },
      data: { message: params.message, severity: params.severity, resolvedAt: null },
    });
  }
}

export async function refreshProjectExecutionAlerts(projectId: string) {
  const budget = await getActiveLockedBudget(projectId);

  // 1) Missing approvals / baseline.
  if (!budget) {
    await upsertActive({
      projectId,
      type: "MISSING_APPROVAL",
      severity: "HIGH",
      message: "Missing approvals: no active locked budget baseline. Procurement conversion is blocked until a budget baseline is locked.",
    });
  } else {
    await resolveType(projectId, "MISSING_APPROVAL");
  }

  if (!budget) {
    await resolveType(projectId, "OVER_COMMITMENT");
    await resolveType(projectId, "BUDGET_OVERRUN");
  }

  // 2) Commitment tracking: committed vs budget.
  if (budget) {
    const committedAgg = await prisma.projectProcurementPlanItem.aggregate({
      where: { plan: { projectId }, status: { not: "CANCELLED" } },
      _sum: { committedAmount: true },
    });
    const committed = roundCurrency(Number(committedAgg._sum.committedAmount ?? 0));
    const budgetCost = roundCurrency(Number(budget.totalCost ?? 0));

    if (budgetCost > 0 && committed > budgetCost + 0.01) {
      const over = roundCurrency(committed - budgetCost);
      const pct = (over / budgetCost) * 100;
      await upsertActive({
        projectId,
        type: "OVER_COMMITMENT",
        severity: severityForPct(pct),
        message: `Over-commitment: budget cost ${budgetCost.toFixed(2)} vs committed ${committed.toFixed(2)} (+${roundPct1(pct)}%).`,
      });
    } else {
      await resolveType(projectId, "OVER_COMMITMENT");
    }

    // 3) Budget overrun: actual cost above budget.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { actualCost: true },
    });
    const actual = roundCurrency(Number(project?.actualCost ?? 0));
    if (budgetCost > 0 && actual > budgetCost + 0.01) {
      const over = roundCurrency(actual - budgetCost);
      const pct = (over / budgetCost) * 100;
      await upsertActive({
        projectId,
        type: "BUDGET_OVERRUN",
        severity: severityForPct(pct),
        message: `Budget overrun: budget cost ${budgetCost.toFixed(2)} vs actual ${actual.toFixed(2)} (+${roundPct1(pct)}%).`,
      });
    } else {
      await resolveType(projectId, "BUDGET_OVERRUN");
    }
  }

  // 4) Cashflow negative: latest forecast snapshot indicates negative closing.
  const latestSnapshot = await prisma.cashflowForecastSnapshot.findFirst({
    where: { projectId },
    orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }],
    select: { projectedClosingBalance: true, riskLevel: true, forecastEndDate: true },
  });

  if (latestSnapshot && Number(latestSnapshot.projectedClosingBalance) < 0) {
    const closing = roundCurrency(Number(latestSnapshot.projectedClosingBalance));
    const sev: PnLAlertSeverity =
      latestSnapshot.riskLevel === "CRITICAL" ? "CRITICAL" : latestSnapshot.riskLevel === "HIGH" ? "HIGH" : "MEDIUM";
    await upsertActive({
      projectId,
      type: "CASHFLOW_NEGATIVE",
      severity: sev,
      message: `Cashflow risk: projected closing balance ${closing.toFixed(2)} by ${latestSnapshot.forecastEndDate.toISOString().slice(0, 10)}.`,
    });
  } else {
    await resolveType(projectId, "CASHFLOW_NEGATIVE");
  }
}

