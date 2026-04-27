import "server-only";

import { toMoney } from "@/lib/bidding/service";

export type BidStrategyMode = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
export type BidPricingPosition = "UNDERCUT" | "MATCH" | "PREMIUM";

export type PricingIntelligence = {
  strategyMode: BidStrategyMode;
  pricingPosition: BidPricingPosition;
  targetMarginPercent: number;
  recommendedBidPrice: number;
  recommendedGrossProfit: number;
  recommendedMarginPercent: number;
  deltaFromCurrent: number;
  narrative: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeDivide(a: number, b: number): number {
  if (!(b > 0)) return 0;
  return a / b;
}

export function strategyTargetMargin(mode: BidStrategyMode): number {
  if (mode === "CONSERVATIVE") return 0.2;
  if (mode === "AGGRESSIVE") return 0.1;
  return 0.15;
}

export function computePricingIntelligence(params: {
  strategyMode: BidStrategyMode;
  pricingPosition: BidPricingPosition;
  estimatedCost: number;
  currentBidPrice: number;
  procurementType?: string;
  competitorPrices?: number[];
  estimatedValue?: number | null;
}): PricingIntelligence {
  const baseTarget = strategyTargetMargin(params.strategyMode);
  // Small adjustments for tender complexity.
  const procurementAdj = params.procurementType === "TENDER" ? 0.01 : 0;
  const targetMargin = clamp(baseTarget + procurementAdj, 0.05, 0.3);

  // Pricing position tweaks.
  const positionAdj = params.pricingPosition === "UNDERCUT" ? -0.02 : params.pricingPosition === "PREMIUM" ? 0.02 : 0;
  const effectiveTarget = clamp(targetMargin + positionAdj, 0.03, 0.35);

  const cost = Math.max(0, toMoney(params.estimatedCost));
  const current = Math.max(0, toMoney(params.currentBidPrice));

  const recommendedBid = cost > 0 ? toMoney(cost / (1 - effectiveTarget)) : 0;
  const recommendedProfit = toMoney(recommendedBid - cost);
  const recommendedMargin = recommendedBid > 0 ? safeDivide(recommendedProfit, recommendedBid) : 0;

  const delta = toMoney(recommendedBid - current);

  const narrative: string[] = [];
  narrative.push(`Strategy: ${params.strategyMode} (${Math.round(targetMargin * 100)}% baseline target).`);
  narrative.push(`Position: ${params.pricingPosition} (adjusted target ~${Math.round(effectiveTarget * 100)}%).`);

  if (params.estimatedValue != null && params.estimatedValue > 0) {
    const pctOfEstimate = toMoney((recommendedBid / params.estimatedValue) * 100);
    narrative.push(`Recommended bid is ~${pctOfEstimate.toFixed(1)}% of estimated value.`);
  }

  const competitor = (params.competitorPrices ?? []).filter((n) => Number.isFinite(n) && n > 0);
  if (competitor.length > 0) {
    const min = Math.min(...competitor);
    const max = Math.max(...competitor);
    narrative.push(`Competitor range observed: SGD ${Math.round(min).toLocaleString("en-SG")} – ${Math.round(max).toLocaleString("en-SG")}.`);
    if (recommendedBid > 0) {
      const diff = toMoney(recommendedBid - min);
      narrative.push(diff > 0 ? `Recommended is +SGD ${Math.round(diff).toLocaleString("en-SG")} above lowest observed.` : `Recommended is -SGD ${Math.round(Math.abs(diff)).toLocaleString("en-SG")} below lowest observed.`);
    }
  } else {
    narrative.push("No competitor pricing captured yet. Add competitor records after debrief if available.");
  }

  if (delta === 0 && recommendedBid > 0) narrative.push("Current bid aligns with recommendation.");
  else if (delta > 0) narrative.push("Recommendation is higher than current bid; confirm scope and value justification.");
  else if (delta < 0) narrative.push("Recommendation is lower than current bid; consider undercut strategy only if risk is controlled.");

  return {
    strategyMode: params.strategyMode,
    pricingPosition: params.pricingPosition,
    targetMarginPercent: Math.round(effectiveTarget * 1000) / 10,
    recommendedBidPrice: recommendedBid,
    recommendedGrossProfit: recommendedProfit,
    recommendedMarginPercent: Math.round(recommendedMargin * 1000) / 10,
    deltaFromCurrent: delta,
    narrative,
  };
}

