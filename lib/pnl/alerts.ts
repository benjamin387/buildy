import { prisma } from "@/lib/prisma";
import { PnLAlertSeverity, PnLAlertType } from "@prisma/client";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function severityForMarginDrop(dropPercentPoints: number): PnLAlertSeverity {
  if (dropPercentPoints >= 15) return "CRITICAL";
  if (dropPercentPoints >= 10) return "HIGH";
  if (dropPercentPoints >= 5) return "MEDIUM";
  return "LOW";
}

function severityForOverrunPct(overrunPct: number): PnLAlertSeverity {
  if (overrunPct >= 25) return "CRITICAL";
  if (overrunPct >= 15) return "HIGH";
  if (overrunPct >= 5) return "MEDIUM";
  return "LOW";
}

function severityForOutstanding(amount: number): PnLAlertSeverity {
  if (amount >= 20000) return "CRITICAL";
  if (amount >= 10000) return "HIGH";
  if (amount >= 2000) return "MEDIUM";
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

export async function refreshProjectPnlAlerts(projectId: string) {
  const now = new Date();

  const quotation = await prisma.quotation.findFirst({
    where: { projectId, isLatest: true },
    select: {
      subtotal: true,
      discountAmount: true,
      estimatedCost: true,
      marginPercent: true,
    },
  });

  const [
    voApproved,
    poCommitted,
    subcontractCommitted,
    actual,
    overdueAgg,
    unpaidBillsAgg,
  ] = await Promise.all([
    prisma.variationOrder.aggregate({
      where: { projectId, status: { in: ["APPROVED", "INVOICED"] } },
      _sum: { subtotal: true, costSubtotal: true },
    }),
    prisma.purchaseOrder.aggregate({
      where: { projectId, status: { in: ["ISSUED", "ACKNOWLEDGED", "COMPLETED"] } },
      _sum: { subtotal: true },
    }),
    prisma.subcontract.aggregate({
      where: { projectId, status: { not: "TERMINATED" } },
      _sum: { contractSubtotal: true },
    }),
    prisma.actualCostEntry.aggregate({
      where: { projectId },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        projectId,
        dueDate: { lt: now },
        outstandingAmount: { gt: 0 },
        status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _count: { _all: true },
      _sum: { outstandingAmount: true },
    }),
    prisma.supplierBill.aggregate({
      where: {
        projectId,
        dueDate: { lt: now },
        outstandingAmount: { gt: 0 },
        status: { in: ["RECEIVED", "APPROVED"] },
      },
      _count: { _all: true },
      _sum: { outstandingAmount: true },
    }),
  ]);

  const quotedRevenueNet = quotation
    ? Math.max(roundCurrency(Number(quotation.subtotal) - Number(quotation.discountAmount)), 0)
    : 0;
  const baselineMarginPercent = quotation ? Number(quotation.marginPercent) : null;

  const approvedVariationRevenue = roundCurrency(Number(voApproved._sum.subtotal ?? 0));
  const approvedVariationCost = roundCurrency(Number(voApproved._sum.costSubtotal ?? 0));

  const estimatedCost = quotation ? roundCurrency(Number(quotation.estimatedCost) + approvedVariationCost) : 0;
  const committedCost = roundCurrency(
    Number(poCommitted._sum.subtotal ?? 0) + Number(subcontractCommitted._sum.contractSubtotal ?? 0),
  );
  const actualCost = roundCurrency(Number(actual._sum.amount ?? 0));

  // 1) Margin drop > 5pp (vs quotation baseline).
  if (baselineMarginPercent !== null && quotedRevenueNet > 0) {
    const projectedRevenue = roundCurrency(quotedRevenueNet + approvedVariationRevenue);
    const forecastCost = roundCurrency(Math.max(estimatedCost, committedCost));
    const projectedProfit = roundCurrency(projectedRevenue - forecastCost);
    const projectedMarginPercent =
      projectedRevenue > 0 ? roundPct1((projectedProfit / projectedRevenue) * 100) : 0;
    const drop = roundPct1(baselineMarginPercent - projectedMarginPercent);

    if (drop >= 5) {
      await upsertActive({
        projectId,
        type: "MARGIN_DROP",
        severity: severityForMarginDrop(drop),
        message: `Margin drop detected: baseline ${roundPct1(baselineMarginPercent)}% → forecast ${projectedMarginPercent}% (drop ${drop}pp).`,
      });
    } else {
      await resolveType(projectId, "MARGIN_DROP");
    }
  } else {
    await resolveType(projectId, "MARGIN_DROP");
  }

  // 2) Cost overrun (committed or actual above budget).
  if (estimatedCost > 0) {
    const worst = Math.max(committedCost, actualCost);
    if (worst > estimatedCost + 0.01) {
      const overrun = roundCurrency(worst - estimatedCost);
      const overrunPct = (overrun / estimatedCost) * 100;
      await upsertActive({
        projectId,
        type: "COST_OVERRUN",
        severity: severityForOverrunPct(overrunPct),
        message: `Cost overrun: budget ${estimatedCost.toFixed(2)} vs current ${worst.toFixed(2)} (+${roundPct1(overrunPct)}%).`,
      });
    } else {
      await resolveType(projectId, "COST_OVERRUN");
    }
  } else {
    await resolveType(projectId, "COST_OVERRUN");
  }

  // 3) Overdue invoices.
  const overdueCount = overdueAgg._count._all;
  const overdueOutstanding = roundCurrency(Number(overdueAgg._sum.outstandingAmount ?? 0));
  if (overdueCount > 0 && overdueOutstanding > 0.01) {
    await upsertActive({
      projectId,
      type: "OVERDUE_INVOICE",
      severity: severityForOutstanding(overdueOutstanding),
      message: `Overdue invoices: ${overdueCount} invoice(s), outstanding ${overdueOutstanding.toFixed(2)}.`,
    });
  } else {
    await resolveType(projectId, "OVERDUE_INVOICE");
  }

  // 4) Unpaid supplier bills (overdue).
  const unpaidCount = unpaidBillsAgg._count._all;
  const unpaidOutstanding = roundCurrency(Number(unpaidBillsAgg._sum.outstandingAmount ?? 0));
  if (unpaidCount > 0 && unpaidOutstanding > 0.01) {
    await upsertActive({
      projectId,
      type: "UNPAID_SUPPLIER_BILL",
      severity: severityForOutstanding(unpaidOutstanding),
      message: `Unpaid supplier bills: ${unpaidCount} bill(s) overdue, outstanding ${unpaidOutstanding.toFixed(2)}.`,
    });
  } else {
    await resolveType(projectId, "UNPAID_SUPPLIER_BILL");
  }
}
