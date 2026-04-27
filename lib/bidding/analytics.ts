import "server-only";

import { prisma } from "@/lib/prisma";
import { computeClosingRisk } from "@/lib/bidding/intelligence";

export type BidDirectorAnalytics = {
  kpis: {
    openBids: number;
    closingSoon7d: number;
    submitted30d: number;
    awarded90d: number;
    lost90d: number;
    winRate90d: number; // 0-1
    pipelineBidValue: number;
    awardedValueYtd: number;
    avgMarginAwarded90d: number; // 0-1
  };
  risk: {
    criticalClosing: number;
    highClosing: number;
    mediumClosing: number;
  };
  agencies: Array<{
    agencyName: string;
    opportunities: number;
    awarded: number;
    lost: number;
    winRate: number; // 0-1
  }>;
  competitors: Array<{
    competitorName: string;
    appearances: number;
    wins: number;
  }>;
  recent: Array<{
    id: string;
    opportunityNo: string;
    title: string;
    agency: string;
    status: string;
    closingDate: Date | null;
    bidPrice: number;
    estimatedCost: number;
    finalMargin: number | null;
  }>;
};

function toNumber(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}

export async function getBidDirectorAnalytics(): Promise<BidDirectorAnalytics> {
  const now = new Date();
  const in7 = new Date(now);
  in7.setDate(in7.getDate() + 7);

  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);

  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);

  const ytd = startOfYear(now);

  const [openBids, closingSoon7d, submitted30d, awarded90d, lost90d, pipelineAgg, awardedYtdAgg, awardedMarginAgg, recentRows] =
    await Promise.all([
      prisma.bidOpportunity.count({ where: { status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL"] } } }),
      prisma.bidOpportunity.count({ where: { closingDate: { lte: in7 }, status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL"] } } }),
      prisma.bidOpportunity.count({ where: { status: "SUBMITTED", submittedAt: { gte: d30 } } }),
      prisma.bidOpportunity.count({ where: { status: "AWARDED", awardedAt: { gte: d90 } } }),
      prisma.bidOpportunity.count({ where: { status: "LOST", updatedAt: { gte: d90 } } }),
      prisma.bidOpportunity.aggregate({
        where: { status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL", "SUBMITTED"] } },
        _sum: { bidPrice: true },
      }),
      prisma.bidOpportunity.aggregate({ where: { status: "AWARDED", awardedAt: { gte: ytd } }, _sum: { bidPrice: true } }),
      prisma.bidOpportunity.aggregate({ where: { status: "AWARDED", awardedAt: { gte: d90 } }, _avg: { finalMargin: true } }),
      prisma.bidOpportunity.findMany({
        orderBy: [{ closingDate: "asc" }, { updatedAt: "desc" }],
        take: 10,
        select: {
          id: true,
          opportunityNo: true,
          title: true,
          agency: true,
          status: true,
          closingDate: true,
          bidPrice: true,
          estimatedCost: true,
          finalMargin: true,
        },
      }),
    ]);

  const pipelineBidValue = toNumber(pipelineAgg._sum.bidPrice ?? 0);
  const awardedValueYtd = toNumber(awardedYtdAgg._sum.bidPrice ?? 0);
  const avgMarginAwarded90d = toNumber(awardedMarginAgg._avg.finalMargin ?? 0);
  const winRate90d = awarded90d + lost90d > 0 ? awarded90d / (awarded90d + lost90d) : 0;

  // Closing risk distribution (computed in-memory for 200 most-recent open bids)
  const openForRisk = await prisma.bidOpportunity.findMany({
    where: { status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL", "SUBMITTED"] } },
    orderBy: [{ closingDate: "asc" }, { updatedAt: "desc" }],
    take: 200,
    select: { closingDate: true },
  });

  let criticalClosing = 0;
  let highClosing = 0;
  let mediumClosing = 0;
  for (const r of openForRisk) {
    const risk = computeClosingRisk(r.closingDate ?? null, now);
    if (risk.severity === "CRITICAL") criticalClosing += 1;
    else if (risk.severity === "HIGH") highClosing += 1;
    else if (risk.severity === "MEDIUM") mediumClosing += 1;
  }

  // Agency performance (last 180 days)
  const d180 = new Date(now);
  d180.setDate(d180.getDate() - 180);
  const agencyRows = await prisma.bidOpportunity.findMany({
    where: { createdAt: { gte: d180 } },
    select: { agency: true, status: true },
    take: 4000,
  });

  const agencyMap = new Map<string, { opportunities: number; awarded: number; lost: number }>();
  for (const r of agencyRows) {
    const key = r.agency || "Unknown";
    const cur = agencyMap.get(key) ?? { opportunities: 0, awarded: 0, lost: 0 };
    cur.opportunities += 1;
    if (r.status === "AWARDED") cur.awarded += 1;
    if (r.status === "LOST") cur.lost += 1;
    agencyMap.set(key, cur);
  }

  const agencies = Array.from(agencyMap.entries())
    .map(([agencyName, v]) => ({
      agencyName,
      opportunities: v.opportunities,
      awarded: v.awarded,
      lost: v.lost,
      winRate: v.awarded + v.lost > 0 ? v.awarded / (v.awarded + v.lost) : 0,
    }))
    .sort((a, b) => b.opportunities - a.opportunities)
    .slice(0, 10);

  // Competitor signals
  const competitorAgg = await prisma.bidCompetitorRecord.groupBy({
    by: ["competitorName"],
    _count: { competitorName: true },
    _sum: { quotedPrice: true },
    where: { createdAt: { gte: d180 } },
    orderBy: { _count: { competitorName: "desc" } },
    take: 10,
  });
  const competitorWins = await prisma.bidCompetitorRecord.groupBy({
    by: ["competitorName"],
    _count: { competitorName: true },
    where: { createdAt: { gte: d180 }, isWinner: true },
    orderBy: { _count: { competitorName: "desc" } },
    take: 20,
  });
  const winMap = new Map<string, number>();
  for (const w of competitorWins) winMap.set(w.competitorName, w._count.competitorName);

  const competitors = competitorAgg.map((c) => ({
    competitorName: c.competitorName,
    appearances: c._count.competitorName,
    wins: winMap.get(c.competitorName) ?? 0,
  }));

  return {
    kpis: {
      openBids,
      closingSoon7d,
      submitted30d,
      awarded90d,
      lost90d,
      winRate90d,
      pipelineBidValue,
      awardedValueYtd,
      avgMarginAwarded90d,
    },
    risk: { criticalClosing, highClosing, mediumClosing },
    agencies,
    competitors,
    recent: recentRows.map((r) => ({
      id: r.id,
      opportunityNo: r.opportunityNo,
      title: r.title,
      agency: r.agency,
      status: String(r.status),
      closingDate: r.closingDate ?? null,
      bidPrice: toNumber(r.bidPrice),
      estimatedCost: toNumber(r.estimatedCost),
      finalMargin: r.finalMargin != null ? toNumber(r.finalMargin) : null,
    })),
  };
}

