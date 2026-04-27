import "server-only";

import { prisma } from "@/lib/prisma";
import { computeExpectedDate, computeForecast, clampConfidence, toMoney, type CashflowLine, startOfToday } from "@/lib/cashflow/forecast-engine";
import type { CashflowAssumptions } from "@/lib/cashflow/assumptions";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function projectLabel(p: { name: string; projectCode: string | null | undefined } | null | undefined): string | null {
  if (!p) return null;
  return p.projectCode ? `${p.projectCode} · ${p.name}` : p.name;
}

export type CompanyCashflowResult = ReturnType<typeof computeForecast> & {
  projectRanking: Array<{
    projectId: string;
    label: string;
    inflows30: number;
    outflows30: number;
    net30: number;
  }>;
};

async function buildCashflowLines(params: { projectId?: string; assumptions: CashflowAssumptions }) {
  const whereProject = params.projectId ? { projectId: params.projectId } : {};
  const [invoices, schedules, supplierBills, purchaseOrders, subcontractClaims] = await Promise.all([
    prisma.invoice.findMany({
      where: { ...whereProject, status: { not: "VOID" }, outstandingAmount: { gt: 0 } },
      select: {
        id: true,
        projectId: true,
        invoiceNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        outstandingAmount: true,
        project: { select: { name: true, projectCode: true } },
      },
      orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
      take: 500,
    }),
    prisma.paymentSchedule.findMany({
      where: { ...whereProject, status: { not: "CANCELLED" } },
      select: {
        id: true,
        projectId: true,
        label: true,
        dueDate: true,
        status: true,
        scheduleType: true,
        contractId: true,
        quotationId: true,
        scheduledAmount: true,
        billedAmount: true,
        paidAmount: true,
        project: { select: { name: true, projectCode: true } },
      },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
      take: 800,
    }),
    prisma.supplierBill.findMany({
      where: { ...whereProject, status: { notIn: ["VOID", "PAID"] }, outstandingAmount: { gt: 0 } },
      select: {
        id: true,
        projectId: true,
        billNumber: true,
        status: true,
        billDate: true,
        dueDate: true,
        outstandingAmount: true,
        supplier: { select: { name: true } },
        project: { select: { name: true, projectCode: true } },
      },
      orderBy: [{ dueDate: "asc" }, { billDate: "asc" }],
      take: 500,
    }),
    prisma.purchaseOrder.findMany({
      where: { ...whereProject, status: { not: "CANCELLED" } },
      select: {
        id: true,
        projectId: true,
        poNumber: true,
        status: true,
        issueDate: true,
        expectedDeliveryDate: true,
        totalAmount: true,
        supplier: { select: { name: true } },
        project: { select: { name: true, projectCode: true } },
      },
      orderBy: [{ issueDate: "desc" }],
      take: 500,
    }),
    prisma.subcontractClaim.findMany({
      where: { status: { notIn: ["PAID", "CANCELLED", "REJECTED"] } },
      select: {
        id: true,
        subcontractId: true,
        claimNumber: true,
        status: true,
        claimDate: true,
        claimedAmount: true,
        certifiedAmount: true,
        subcontract: {
          select: {
            projectId: true,
            title: true,
            supplier: { select: { name: true } },
            project: { select: { name: true, projectCode: true } },
          },
        },
      },
      orderBy: [{ claimDate: "desc" }],
      take: 500,
    }),
  ]);

  const filteredClaims = params.projectId
    ? subcontractClaims.filter((c) => c.subcontract.projectId === params.projectId)
    : subcontractClaims;

  const poIds = purchaseOrders.map((p) => p.id);
  const billedByPoId = poIds.length
    ? await prisma.supplierBill.groupBy({
        by: ["purchaseOrderId"],
        where: { purchaseOrderId: { in: poIds }, status: { not: "VOID" } },
        _sum: { totalAmount: true },
      })
    : [];
  const poBilledMap = new Map<string, number>();
  for (const row of billedByPoId) {
    if (!row.purchaseOrderId) continue;
    poBilledMap.set(row.purchaseOrderId, toMoney(row._sum.totalAmount ?? 0));
  }

  const today = startOfToday();
  const lines: CashflowLine[] = [];

  for (const inv of invoices) {
    const amount = toMoney(inv.outstandingAmount);
    if (amount <= 0) continue;
    const expectedDate = computeExpectedDate({
      baseDate: inv.dueDate ?? inv.issueDate,
      fallbackDate: inv.issueDate,
      delayDays: params.assumptions.collectionDelayDays,
      treatOverdueAsToday: true,
    });
    const status = inv.dueDate && inv.dueDate.getTime() < today.getTime() ? "OVERDUE" : inv.status === "DRAFT" ? "EXPECTED" : "CONFIRMED";
    const confidence = inv.status === "DRAFT" ? 0.6 : status === "OVERDUE" ? 0.75 : 0.9;

    lines.push({
      projectId: inv.projectId,
      projectLabel: projectLabel(inv.project),
      sourceType: "INVOICE",
      sourceId: inv.id,
      direction: "INFLOW",
      label: `Invoice ${inv.invoiceNumber}`,
      expectedDate,
      amount,
      confidenceLevel: clampConfidence(confidence),
      status,
    });
  }

  for (const s of schedules) {
    const scheduled = toMoney(s.scheduledAmount);
    const billed = toMoney(s.billedAmount);
    // Only include future (not-yet-invoiced) portion here to avoid double-counting
    // against outstanding invoices already captured as INFLOW lines.
    const remaining = Math.max(toMoney(scheduled - billed), 0);
    if (remaining <= 0) continue;

    const expectedDate = computeExpectedDate({
      baseDate: s.dueDate,
      fallbackDate: today,
      delayDays: params.assumptions.collectionDelayDays,
      treatOverdueAsToday: true,
    });

    const status = s.dueDate && s.dueDate.getTime() < today.getTime() && remaining > 0 ? "OVERDUE" : "EXPECTED";
    const confidence =
      s.contractId ? 0.85 : s.quotationId ? 0.75 : s.scheduleType === "MANUAL" ? 0.6 : 0.7;

    lines.push({
      projectId: s.projectId,
      projectLabel: projectLabel(s.project),
      sourceType: "PAYMENT_SCHEDULE",
      sourceId: s.id,
      direction: "INFLOW",
      label: `Billing stage: ${s.label}`,
      expectedDate,
      amount: remaining,
      confidenceLevel: clampConfidence(confidence),
      status,
    });
  }

  for (const bill of supplierBills) {
    const amount = toMoney(bill.outstandingAmount);
    if (amount <= 0) continue;

    const expectedDate = computeExpectedDate({
      baseDate: bill.dueDate ?? bill.billDate,
      fallbackDate: bill.billDate,
      delayDays: params.assumptions.supplierPaymentDelayDays,
      treatOverdueAsToday: true,
    });
    const status = bill.dueDate && bill.dueDate.getTime() < today.getTime() ? "OVERDUE" : "CONFIRMED";

    lines.push({
      projectId: bill.projectId,
      projectLabel: projectLabel(bill.project),
      sourceType: "SUPPLIER_BILL",
      sourceId: bill.id,
      direction: "OUTFLOW",
      label: `Supplier bill ${bill.billNumber} (${bill.supplier.name})`,
      expectedDate,
      amount,
      confidenceLevel: clampConfidence(0.95),
      status,
    });
  }

  for (const po of purchaseOrders) {
    const total = toMoney(po.totalAmount);
    const billed = poBilledMap.get(po.id) ?? 0;
    const remaining = Math.max(toMoney(total - billed), 0);
    if (remaining <= 0) continue;

    const expectedDate = computeExpectedDate({
      baseDate: po.expectedDeliveryDate ?? po.issueDate,
      fallbackDate: po.issueDate,
      delayDays: params.assumptions.supplierPaymentDelayDays,
      treatOverdueAsToday: false,
    });

    lines.push({
      projectId: po.projectId,
      projectLabel: projectLabel(po.project),
      sourceType: "PURCHASE_ORDER_COMMITMENT",
      sourceId: po.id,
      direction: "OUTFLOW",
      label: `PO commitment ${po.poNumber} (${po.supplier.name})`,
      expectedDate,
      amount: remaining,
      confidenceLevel: clampConfidence(0.7),
      status: "EXPECTED",
    });
  }

  for (const claim of filteredClaims) {
    const p = claim.subcontract.project;
    const certified = toMoney(claim.certifiedAmount);
    const claimed = toMoney(claim.claimedAmount);
    const amount = certified > 0 ? certified : claimed;
    if (amount <= 0) continue;

    const expectedDate = computeExpectedDate({
      baseDate: claim.claimDate,
      fallbackDate: claim.claimDate,
      delayDays: params.assumptions.supplierPaymentDelayDays,
      treatOverdueAsToday: false,
    });
    const status = claim.status === "CERTIFIED" ? "CONFIRMED" : "EXPECTED";
    const confidence = claim.status === "CERTIFIED" ? 0.9 : 0.7;

    lines.push({
      projectId: claim.subcontract.projectId,
      projectLabel: projectLabel(p),
      sourceType: "SUBCONTRACT_CLAIM",
      sourceId: claim.id,
      direction: "OUTFLOW",
      label: `Subcontract claim ${claim.claimNumber} (${claim.subcontract.supplier.name})`,
      expectedDate,
      amount,
      confidenceLevel: clampConfidence(confidence),
      status,
    });
  }

  return lines;
}

export async function computeCompanyCashflowForecast(assumptions: CashflowAssumptions): Promise<CompanyCashflowResult> {
  const start = startOfToday();
  const end = addDays(start, assumptions.horizonDays);

  const lines = await buildCashflowLines({ assumptions });
  const forecast = computeForecast({
    forecastStartDate: start,
    forecastEndDate: end,
    openingBalance: assumptions.openingBalance,
    lines,
  });

  const projectAgg = new Map<string, { label: string; inflows30: number; outflows30: number }>();
  const windowEnd = addDays(startOfToday(), 30).getTime();
  const now = startOfToday().getTime();

  // Rank projects by net cashflow over next 30 days.
  for (const l of forecast.lines) {
    if (!l.projectId) continue;
    const t = l.expectedDate.getTime();
    if (t < now || t >= windowEnd || l.status === "CANCELLED") continue;
    const existing = projectAgg.get(l.projectId) ?? { label: l.projectLabel ?? l.projectId, inflows30: 0, outflows30: 0 };
    if (l.direction === "INFLOW") existing.inflows30 += l.amount;
    else existing.outflows30 += l.amount;
    projectAgg.set(l.projectId, existing);
  }

  const projectRanking = Array.from(projectAgg.entries())
    .map(([projectId, v]) => ({
      projectId,
      label: v.label,
      inflows30: toMoney(v.inflows30),
      outflows30: toMoney(v.outflows30),
      net30: toMoney(v.inflows30 - v.outflows30),
    }))
    .sort((a, b) => a.net30 - b.net30);

  return {
    ...forecast,
    // keep these for caller UI (company page)
    windows: forecast.windows,
    projectRanking,
  } satisfies CompanyCashflowResult;
}

export async function computeProjectCashflowForecast(projectId: string, assumptions: CashflowAssumptions) {
  const start = startOfToday();
  const end = addDays(start, assumptions.horizonDays);

  const lines = await buildCashflowLines({ projectId, assumptions });
  return computeForecast({
    forecastStartDate: start,
    forecastEndDate: end,
    openingBalance: assumptions.openingBalance,
    lines,
  });
}
