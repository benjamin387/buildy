import "server-only";

import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/bidding/service";
import { logAudit } from "@/lib/audit/logger";
import { AuditAction, AuditSource, BidCostApprovalStatus, BidCostVersionStatus, BidPricingPosition, BidStrategyMode, BidTradePackageKey } from "@prisma/client";

function safeDiv(n: number, d: number): number {
  if (!(d > 0)) return 0;
  return n / d;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.95, value));
}

function defaultsForStrategy(strategy: BidStrategyMode) {
  if (strategy === "CONSERVATIVE") {
    return { desiredMargin: 0.25, overheadPercent: 0.1, contingencyPercent: 0.07, preliminariesRate: 0.03, pricingPosition: "PREMIUM" as BidPricingPosition };
  }
  if (strategy === "AGGRESSIVE") {
    return { desiredMargin: 0.12, overheadPercent: 0.06, contingencyPercent: 0.03, preliminariesRate: 0.02, pricingPosition: "UNDERCUT" as BidPricingPosition };
  }
  return { desiredMargin: 0.18, overheadPercent: 0.08, contingencyPercent: 0.05, preliminariesRate: 0.025, pricingPosition: "MATCH" as BidPricingPosition };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function generateBidCostVersionFromRfq(params: {
  opportunityId: string;
  rfqId: string;
  strategyMode: BidStrategyMode;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: params.opportunityId },
    select: { id: true, targetMargin: true, costingLockedAt: true, approvedCostVersionId: true },
  });
  if (!opp) throw new Error("Opportunity not found.");
  if (opp.costingLockedAt) throw new Error("Costing is locked. Create a new bid if you need revisions.");

  const rfq = await prisma.bidRfq.findUnique({
    where: { id: params.rfqId },
    include: {
      tradePackages: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          preferredQuote: { include: { lines: true } },
          quotes: {
            include: { lines: true },
            where: { status: "SUBMITTED" },
            orderBy: [{ submittedAt: "desc" }],
          },
        },
      },
    },
  });
  if (!rfq || rfq.opportunityId !== params.opportunityId) throw new Error("RFQ not found.");

  const max = await prisma.bidCostVersion.aggregate({
    where: { opportunityId: params.opportunityId },
    _max: { versionNo: true },
  });
  const maxNo = max._max.versionNo != null ? Number(max._max.versionNo) : 0;
  const vNo = (Number.isFinite(maxNo) ? maxNo : 0) + 1;

  const stratDefaults = defaultsForStrategy(params.strategyMode);
  const desiredMargin = opp.targetMargin != null ? clampPercent(Number(opp.targetMargin)) : stratDefaults.desiredMargin;

  const tradeLines: Array<{
    tradeKey: BidTradePackageKey;
    description: string;
    costAmount: number;
    sourceQuoteId: string | null;
  }> = [];

  for (const pkg of rfq.tradePackages) {
    const preferred = pkg.preferredQuote && pkg.preferredQuote.status === "SUBMITTED" ? pkg.preferredQuote : null;
    const candidates = pkg.quotes ?? [];
    const chosen =
      preferred ??
      candidates
        .map((q) => {
          const total = (q.lines ?? []).reduce((sum, l) => sum + toMoney(Number(l.totalAmount ?? 0)), 0);
          return { q, total };
        })
        .filter((x) => x.total > 0)
        .sort((a, b) => a.total - b.total)[0]?.q ??
      null;

    const costAmount = chosen ? (chosen.lines ?? []).reduce((sum, l) => sum + toMoney(Number(l.totalAmount ?? 0)), 0) : 0;

    tradeLines.push({
      tradeKey: pkg.tradeKey,
      description: pkg.title,
      costAmount: toMoney(costAmount),
      sourceQuoteId: chosen?.id ?? null,
    });
  }

  const subtotalCost = toMoney(tradeLines.reduce((s, l) => s + toMoney(l.costAmount), 0));
  const preliminariesAmount = toMoney(subtotalCost * stratDefaults.preliminariesRate);
  const overheadPercent = clampPercent(stratDefaults.overheadPercent);
  const contingencyPercent = clampPercent(stratDefaults.contingencyPercent);
  const totalCost = toMoney(subtotalCost + preliminariesAmount + subtotalCost * overheadPercent + subtotalCost * contingencyPercent);

  const bidPrice =
    desiredMargin > 0.0001
      ? toMoney(totalCost / (1 - desiredMargin))
      : toMoney(totalCost);
  const marginPercent = bidPrice > 0 ? round2((bidPrice - totalCost) / bidPrice) : 0;

  // Allocate sell amount across trade lines proportional to cost.
  const poolSell = Math.max(0, bidPrice - preliminariesAmount);
  const factor = subtotalCost > 0 ? poolSell / subtotalCost : 0;

  const sellAmounts = tradeLines.map((l) => toMoney(l.costAmount * factor));
  // Fix rounding drift on last line.
  const drift = toMoney(poolSell - sellAmounts.reduce((s, n) => s + n, 0));
  if (sellAmounts.length > 0) sellAmounts[sellAmounts.length - 1] = toMoney(sellAmounts[sellAmounts.length - 1] + drift);

  const created = await prisma.$transaction(async (tx) => {
    const version = await tx.bidCostVersion.create({
      data: {
        opportunityId: params.opportunityId,
        versionNo: vNo,
        label: `Auto from RFQ ${rfq.title}`,
        status: BidCostVersionStatus.APPROVAL_REQUIRED,
        strategyMode: params.strategyMode,
        pricingPosition: stratDefaults.pricingPosition,
        subtotalCost,
        subtotalSell: poolSell,
        preliminariesAmount,
        overheadPercent,
        contingencyPercent,
        totalCost,
        bidPrice,
        marginPercent,
        generatedFromRfqId: rfq.id,
        createdByName: params.actor?.name ?? null,
        createdByEmail: params.actor?.email ?? null,
      },
      select: { id: true, opportunityId: true, versionNo: true, bidPrice: true, totalCost: true, marginPercent: true, status: true, createdAt: true },
    });

    await tx.bidCostVersionLine.createMany({
      data: tradeLines.map((l, idx) => ({
        costVersionId: version.id,
        tradeKey: l.tradeKey,
        description: l.description,
        costAmount: l.costAmount,
        sellAmount: sellAmounts[idx] ?? 0,
        sourceQuoteId: l.sourceQuoteId,
        sortOrder: idx,
      })),
    });

    await tx.bidCostApproval.create({
      data: {
        costVersionId: version.id,
        approverName: params.actor?.name ?? "QS",
        approverEmail: params.actor?.email ?? null,
        status: BidCostApprovalStatus.PENDING,
      },
    });

    return version;
  });

  await logAudit({
    entityType: "BidCostVersion",
    entityId: created.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: created,
    metadata: { rfqId: rfq.id, strategyMode: params.strategyMode, desiredMargin },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "COSTING",
      title: "Auto cost version generated",
      description: `Generated cost version v${vNo} from RFQ "${rfq.title}" (${params.strategyMode}).`,
      actorName: params.actor?.name ?? null,
      actorEmail: params.actor?.email ?? null,
    },
  });

  return created;
}

export async function approveBidCostVersion(params: {
  opportunityId: string;
  costVersionId: string;
  approver: { name?: string | null; email?: string | null; role?: string | null } | null;
  remarks?: string | null;
}) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: params.opportunityId },
    select: { id: true, costingLockedAt: true, approvedCostVersionId: true },
  });
  if (!opp) throw new Error("Opportunity not found.");
  if (opp.costingLockedAt) throw new Error("Costing is already locked.");

  const version = await prisma.bidCostVersion.findUnique({
    where: { id: params.costVersionId },
    include: { approvals: true },
  });
  if (!version || version.opportunityId !== params.opportunityId) throw new Error("Cost version not found.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.bidCostApproval.create({
      data: {
        costVersionId: version.id,
        approverName: params.approver?.name ?? "Director",
        approverEmail: params.approver?.email ?? null,
        status: BidCostApprovalStatus.APPROVED,
        remarks: params.remarks?.trim() ? params.remarks.trim() : null,
        decidedAt: now,
      },
    });

    const v = await tx.bidCostVersion.update({
      where: { id: version.id },
      data: { status: BidCostVersionStatus.APPROVED, approvedAt: now },
      select: { id: true, opportunityId: true, bidPrice: true, totalCost: true, marginPercent: true, approvedAt: true, status: true },
    });

    // Lock opportunity using this cost version.
    const bidPrice = toMoney(Number(v.bidPrice ?? 0));
    const estimatedCost = toMoney(Number(v.totalCost ?? 0));
    const finalMargin = bidPrice > 0 ? (bidPrice - estimatedCost) / bidPrice : 0;

    await tx.bidOpportunity.update({
      where: { id: params.opportunityId },
      data: {
        approvedCostVersionId: v.id,
        costingLockedAt: now,
        bidPrice,
        estimatedCost,
        finalMargin,
      },
    });

    return v;
  });

  await logAudit({
    entityType: "BidCostVersion",
    entityId: updated.id,
    action: AuditAction.APPROVE,
    source: AuditSource.USER,
    actor: params.approver,
    before: { status: version.status, approvedAt: version.approvedAt, opportunityApprovedCostVersionId: opp.approvedCostVersionId },
    after: { status: updated.status, approvedAt: updated.approvedAt, opportunityApprovedCostVersionId: updated.id },
    metadata: { remarks: params.remarks ?? null },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "APPROVAL",
      title: "Costing approved & locked",
      description: `Approved and locked bid costing using cost version ${version.versionNo}.`,
      actorName: params.approver?.name ?? null,
      actorEmail: params.approver?.email ?? null,
    },
  });

  return updated;
}

export async function listBidCostVersions(opportunityId: string) {
  return prisma.bidCostVersion.findMany({
    where: { opportunityId },
    orderBy: [{ versionNo: "desc" }],
    include: {
      approvals: { orderBy: [{ createdAt: "desc" }], take: 3 },
      lines: { orderBy: [{ sortOrder: "asc" }] },
    },
  });
}
