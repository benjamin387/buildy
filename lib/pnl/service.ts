import { prisma } from "@/lib/prisma";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export type ProjectPnlLeakageSignal =
  | {
      type: "ACTUAL_COST_GT_ESTIMATED";
      message: string;
      deltaAmount: number;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    }
  | {
      type: "COMMITTED_COST_GT_ESTIMATED";
      message: string;
      deltaAmount: number;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    }
  | {
      type: "BILLS_GT_PO";
      message: string;
      count: number;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    }
  | {
      type: "CLAIMS_GT_SUBCONTRACT";
      message: string;
      count: number;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    }
  | {
      type: "MARGIN_DROP_VS_BASELINE";
      message: string;
      dropPercentPoints: number;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    };

export type ProjectPnlMetrics = {
  quotedRevenueNet: number;
  quotationSubtotal: number;
  quotationTotalAmount: number;
  approvedVariationRevenue: number;
  contractTotalAmount: number;
  invoicedRevenueNet: number;
  collectedRevenue: number;
  outstandingReceivables: number;

  estimatedCost: number;
  committedCost: number;
  poCommittedCost: number;
  subcontractCommittedCost: number;
  actualCost: number;
  supplierBillActualCost: number;

  projectedProfit: number;
  actualProfit: number;
  projectedMarginPercent: number;
  actualMarginPercent: number;

  baselineMarginPercent: number | null;

  overdueInvoiceCount: number;
  overdueInvoiceOutstanding: number;
  unpaidSupplierBillCount: number;
  unpaidSupplierBillOutstanding: number;

  leakageSignals: ProjectPnlLeakageSignal[];
  billsExceedingPo: Array<{
    purchaseOrderId: string;
    poNumber: string;
    poSubtotal: number;
    billedSubtotal: number;
    delta: number;
  }>;
  claimsExceedingSubcontract: Array<{
    subcontractId: string;
    title: string;
    subcontractSubtotal: number;
    claimedAmount: number;
    certifiedAmount: number;
    exposure: number;
    delta: number;
  }>;
};

export async function computeProjectPnlMetrics(projectId: string): Promise<ProjectPnlMetrics> {
  const now = new Date();

  const quotationLatest = await prisma.quotation.findFirst({
    where: { projectId, isLatest: true },
    select: {
      id: true,
      status: true,
      subtotal: true,
      discountAmount: true,
      estimatedCost: true,
      marginPercent: true,
      totalAmount: true,
    },
  });

  const quotationFallback = quotationLatest
    ? null
    : await prisma.quotation.findFirst({
        where: { projectId },
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          status: true,
          subtotal: true,
          discountAmount: true,
          estimatedCost: true,
          marginPercent: true,
          totalAmount: true,
        },
      });

  const quotation = quotationLatest ?? quotationFallback;
  const quotationSubtotal = quotation ? roundCurrency(Number(quotation.subtotal)) : 0;
  const quotationTotalAmount = quotation ? roundCurrency(Number(quotation.totalAmount)) : 0;
  const quotedRevenueNet = quotation
    ? Math.max(roundCurrency(Number(quotation.subtotal) - Number(quotation.discountAmount)), 0)
    : 0;
  const baselineEstimatedCost = quotation ? roundCurrency(Number(quotation.estimatedCost)) : 0;
  const baselineMarginPercent = quotation ? roundCurrency(Number(quotation.marginPercent)) : null;

  const [
    voApproved,
    poCommitted,
    subcontractCommitted,
    actual,
    invoiceAgg,
    invoiceOutstandingAgg,
    receipts,
    overdueAgg,
    unpaidBillsAgg,
    supplierBillActualAgg,
    contractSigned,
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
      where: { projectId, status: { not: "VOID" } },
      _sum: { subtotal: true, discountAmount: true },
    }),
    prisma.invoice.aggregate({
      where: { projectId, status: { not: "VOID" } },
      _sum: { outstandingAmount: true },
    }),
    prisma.paymentReceipt.aggregate({
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
    prisma.supplierBill.aggregate({
      where: { projectId, status: { in: ["APPROVED", "PAID"] } },
      _sum: { subtotal: true },
    }),
    prisma.contract.findFirst({
      where: { projectId, status: "SIGNED" },
      orderBy: { contractDate: "desc" },
      select: { id: true, totalAmount: true, contractValue: true },
    }),
  ]);

  const approvedVariationRevenue = roundCurrency(Number(voApproved._sum.subtotal ?? 0));
  const approvedVariationCost = roundCurrency(Number(voApproved._sum.costSubtotal ?? 0));

  const estimatedCost = roundCurrency(baselineEstimatedCost + approvedVariationCost);

  const poCommittedCost = roundCurrency(Number(poCommitted._sum.subtotal ?? 0));
  const subcontractCommittedCost = roundCurrency(Number(subcontractCommitted._sum.contractSubtotal ?? 0));
  const committedCost = roundCurrency(poCommittedCost + subcontractCommittedCost);
  const actualCost = roundCurrency(Number(actual._sum.amount ?? 0));
  const supplierBillActualCost = roundCurrency(Number(supplierBillActualAgg._sum.subtotal ?? 0));

  const invoicedRevenueNet = Math.max(
    roundCurrency(
      Number(invoiceAgg._sum.subtotal ?? 0) - Number(invoiceAgg._sum.discountAmount ?? 0),
    ),
    0,
  );
  const collectedRevenue = roundCurrency(Number(receipts._sum.amount ?? 0));
  const outstandingReceivables = roundCurrency(Number(invoiceOutstandingAgg._sum.outstandingAmount ?? 0));

  const projectedRevenue = roundCurrency(quotedRevenueNet + approvedVariationRevenue);
  const forecastCost = roundCurrency(Math.max(estimatedCost, committedCost));

  const projectedProfit = roundCurrency(projectedRevenue - forecastCost);
  const projectedMarginPercent =
    projectedRevenue > 0 ? roundPct((projectedProfit / projectedRevenue) * 100) : 0;

  const actualProfit = roundCurrency(invoicedRevenueNet - actualCost);
  const actualMarginPercent =
    invoicedRevenueNet > 0 ? roundPct((actualProfit / invoicedRevenueNet) * 100) : 0;

  const overdueInvoiceCount = overdueAgg._count._all;
  const overdueInvoiceOutstanding = roundCurrency(Number(overdueAgg._sum.outstandingAmount ?? 0));
  const unpaidSupplierBillCount = unpaidBillsAgg._count._all;
  const unpaidSupplierBillOutstanding = roundCurrency(Number(unpaidBillsAgg._sum.outstandingAmount ?? 0));

  const leakageSignals: ProjectPnlLeakageSignal[] = [];
  if (actualCost > estimatedCost + 0.01) {
    const delta = roundCurrency(actualCost - estimatedCost);
    const pct = estimatedCost > 0 ? (delta / estimatedCost) * 100 : 0;
    leakageSignals.push({
      type: "ACTUAL_COST_GT_ESTIMATED",
      message: `Actual cost exceeds budget by ${delta.toFixed(2)}.`,
      deltaAmount: delta,
      severity: pct >= 25 ? "CRITICAL" : pct >= 15 ? "HIGH" : pct >= 5 ? "MEDIUM" : "LOW",
    });
  }
  if (committedCost > estimatedCost + 0.01) {
    const delta = roundCurrency(committedCost - estimatedCost);
    const pct = estimatedCost > 0 ? (delta / estimatedCost) * 100 : 0;
    leakageSignals.push({
      type: "COMMITTED_COST_GT_ESTIMATED",
      message: `Committed cost exceeds budget by ${delta.toFixed(2)}.`,
      deltaAmount: delta,
      severity: pct >= 25 ? "CRITICAL" : pct >= 15 ? "HIGH" : pct >= 5 ? "MEDIUM" : "LOW",
    });
  }

  if (baselineMarginPercent !== null) {
    const drop = roundPct(baselineMarginPercent - projectedMarginPercent);
    if (drop > 0) {
      leakageSignals.push({
        type: "MARGIN_DROP_VS_BASELINE",
        message: `Margin dropped vs quotation baseline by ${drop.toFixed(1)}pp.`,
        dropPercentPoints: drop,
        severity: drop >= 15 ? "CRITICAL" : drop >= 10 ? "HIGH" : drop >= 5 ? "MEDIUM" : "LOW",
      });
    }
  }

  const billsByPo = await prisma.supplierBill.groupBy({
    by: ["purchaseOrderId"],
    where: { projectId, purchaseOrderId: { not: null }, status: { not: "VOID" } },
    _sum: { subtotal: true },
  });

  const poIds = billsByPo
    .map((g) => g.purchaseOrderId)
    .filter((id): id is string => typeof id === "string");

  const pos = poIds.length
    ? await prisma.purchaseOrder.findMany({
        where: { id: { in: poIds } },
        select: { id: true, poNumber: true, subtotal: true },
      })
    : [];

  const poMap = new Map(pos.map((po) => [po.id, po]));
  const billsExceedingPo = billsByPo
    .map((g) => {
      const po = g.purchaseOrderId ? poMap.get(g.purchaseOrderId) : null;
      if (!po || !g.purchaseOrderId) return null;
      const billedSubtotal = roundCurrency(Number(g._sum.subtotal ?? 0));
      const poSubtotal = roundCurrency(Number(po.subtotal));
      const delta = roundCurrency(billedSubtotal - poSubtotal);
      if (delta <= 0.01) return null;
      return {
        purchaseOrderId: g.purchaseOrderId,
        poNumber: po.poNumber,
        poSubtotal,
        billedSubtotal,
        delta,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.delta - a.delta);

  if (billsExceedingPo.length > 0) {
    leakageSignals.push({
      type: "BILLS_GT_PO",
      message: `${billsExceedingPo.length} PO(s) exceeded by supplier bills (subtotal).`,
      count: billsExceedingPo.length,
      severity: billsExceedingPo.length >= 3 ? "HIGH" : "MEDIUM",
    });
  }

  const claimsBySc = await prisma.subcontractClaim.groupBy({
    by: ["subcontractId"],
    where: { subcontract: { projectId }, status: { in: ["SUBMITTED", "CERTIFIED", "PAID"] } },
    _sum: { claimedAmount: true, certifiedAmount: true },
  });

  const scIds = claimsBySc
    .map((g) => g.subcontractId)
    .filter((id): id is string => typeof id === "string");

  const subcontracts = scIds.length
    ? await prisma.subcontract.findMany({
        where: { id: { in: scIds } },
        select: { id: true, title: true, contractSubtotal: true },
      })
    : [];

  const scMap = new Map(subcontracts.map((sc) => [sc.id, sc]));
  const claimsExceedingSubcontract = claimsBySc
    .map((g) => {
      const sc = scMap.get(g.subcontractId);
      if (!sc) return null;
      const claimedAmount = roundCurrency(Number(g._sum.claimedAmount ?? 0));
      const certifiedAmount = roundCurrency(Number(g._sum.certifiedAmount ?? 0));
      const exposure = Math.max(claimedAmount, certifiedAmount);
      const subcontractSubtotal = roundCurrency(Number(sc.contractSubtotal));
      const delta = roundCurrency(exposure - subcontractSubtotal);
      if (delta <= 0.01) return null;
      return {
        subcontractId: sc.id,
        title: sc.title,
        subcontractSubtotal,
        claimedAmount,
        certifiedAmount,
        exposure: roundCurrency(exposure),
        delta,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.delta - a.delta);

  if (claimsExceedingSubcontract.length > 0) {
    leakageSignals.push({
      type: "CLAIMS_GT_SUBCONTRACT",
      message: `${claimsExceedingSubcontract.length} subcontract(s) exceeded by claims exposure.`,
      count: claimsExceedingSubcontract.length,
      severity: claimsExceedingSubcontract.length >= 3 ? "HIGH" : "MEDIUM",
    });
  }

  return {
    quotedRevenueNet,
    quotationSubtotal,
    quotationTotalAmount,
    approvedVariationRevenue,
    contractTotalAmount: contractSigned
      ? roundCurrency(Number(contractSigned.totalAmount ?? contractSigned.contractValue ?? 0))
      : 0,
    invoicedRevenueNet,
    collectedRevenue,
    outstandingReceivables,
    estimatedCost,
    committedCost,
    poCommittedCost,
    subcontractCommittedCost,
    actualCost,
    supplierBillActualCost,
    projectedProfit,
    actualProfit,
    projectedMarginPercent,
    actualMarginPercent,
    baselineMarginPercent,
    overdueInvoiceCount,
    overdueInvoiceOutstanding,
    unpaidSupplierBillCount,
    unpaidSupplierBillOutstanding,
    leakageSignals,
    billsExceedingPo,
    claimsExceedingSubcontract,
  };
}
