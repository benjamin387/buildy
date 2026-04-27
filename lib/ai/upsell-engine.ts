import "server-only";

import type { DesignStyle, PropertyType } from "@prisma/client";

export type UpsellOpportunity = {
  title: string;
  description: string;
  category: string;
  estimatedRevenueIncrease: number;
  estimatedCostIncrease: number;
  estimatedProfitIncrease: number;
  pitchText: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
};

export type GenerateUpsellRecommendationsInput = {
  propertyType: PropertyType;
  designStyle: DesignStyle | null;
  currentBoqItems: Array<{ description: string }>;
  currentBudget: number;
  clientNeeds: string;
};

export type GenerateUpsellRecommendationsOutput = {
  upsellOpportunities: UpsellOpportunity[];
  recommendedAddOns: UpsellOpportunity[];
  estimatedRevenueIncrease: number;
  estimatedCostIncrease: number;
  estimatedProfitIncrease: number;
  pitchText: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
};

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function styleLabel(style: DesignStyle | null): string {
  if (!style) return "contemporary";
  return style.replaceAll("_", " ").toLowerCase();
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function estimatePackageRevenue(baseBudget: number, pct: number, min: number, max: number): number {
  const v = clampNonNegative(baseBudget) * pct;
  return Math.min(max, Math.max(min, v));
}

function toMoney(n: number): number {
  return Number(clampNonNegative(n).toFixed(2));
}

function marginSplit(revenue: number, costRatio: number): { revenue: number; cost: number; profit: number } {
  const r = clampNonNegative(revenue);
  const c = r * costRatio;
  return { revenue: toMoney(r), cost: toMoney(c), profit: toMoney(r - c) };
}

export async function generateUpsellRecommendations(
  input: GenerateUpsellRecommendationsInput,
): Promise<GenerateUpsellRecommendationsOutput> {
  const budget = clampNonNegative(input.currentBudget);
  const needs = normalize(input.clientNeeds);
  const style = styleLabel(input.designStyle);

  const itemsText = normalize(input.currentBoqItems.map((i) => i.description).join(" | "));

  const opportunities: UpsellOpportunity[] = [];

  const smartHomeMissing = !containsAny(itemsText, ["smart home", "smart-home", "automation", "iot"]);
  const lightingMissing = !containsAny(itemsText, ["track", "lighting", "pendant", "cove", "feature light"]);
  const featureWallMissing = !containsAny(itemsText, ["feature wall", "accent wall", "wall cladding", "fluted"]);
  const softFurnMissing = !containsAny(itemsText, ["curtain", "blind", "soft furnishing", "drapes"]);
  const storageMissing = !containsAny(itemsText, ["storage", "shoe", "pantry", "cabinet", "wardrobe"]);

  const wantsConvenience = containsAny(needs, ["smart", "automation", "convenience", "voice", "app"]);
  const wantsLuxury = containsAny(needs, ["luxury", "premium", "hotel", "high-end", "exclusive"]);
  const wantsStorage = containsAny(needs, ["storage", "clutter", "organize", "tidy", "space"]);
  const wantsLighting = containsAny(needs, ["lighting", "warm", "bright", "cozy", "mood"]);

  if (smartHomeMissing) {
    const rev = estimatePackageRevenue(budget, 0.035, 3500, 12000);
    const m = marginSplit(rev, 0.62);
    opportunities.push({
      title: "Smart Home Starter Package",
      description:
        "Core smart switches, lighting scenes, and app control for everyday convenience. Scalable add-ons available (curtains, AC, door access).",
      category: "smart_home_system",
      estimatedRevenueIncrease: m.revenue,
      estimatedCostIncrease: m.cost,
      estimatedProfitIncrease: m.profit,
      priority: wantsConvenience ? "HIGH" : "MEDIUM",
      pitchText:
        "We recommend a Smart Home Starter Package so you can control lighting scenes and key switches from your phone. It upgrades daily comfort without changing the design language.",
    });
  }

  if (lightingMissing) {
    const rev = estimatePackageRevenue(budget, 0.02, 1800, 7000);
    const m = marginSplit(rev, 0.6);
    opportunities.push({
      title: "Premium Lighting Upgrade",
      description:
        "Layered lighting: track lights + key statement pendant + warm ambient zones. Improves space perception and mood.",
      category: "premium_lighting",
      estimatedRevenueIncrease: m.revenue,
      estimatedCostIncrease: m.cost,
      estimatedProfitIncrease: m.profit,
      priority: wantsLighting ? "HIGH" : "MEDIUM",
      pitchText:
        "A lighting upgrade gives the space a premium feel. We’ll layer ambient + task lighting and add one statement piece to match your style.",
    });
  }

  if (featureWallMissing) {
    const rev = estimatePackageRevenue(budget, 0.018, 1600, 6000);
    const m = marginSplit(rev, 0.58);
    opportunities.push({
      title: "Feature Wall / TV Wall Upgrade",
      description:
        "A focal wall using fluted panels, textured paint, or stone-look porcelain to anchor the living zone and elevate the finish.",
      category: "feature_wall",
      estimatedRevenueIncrease: m.revenue,
      estimatedCostIncrease: m.cost,
      estimatedProfitIncrease: m.profit,
      priority: wantsLuxury ? "HIGH" : "MEDIUM",
      pitchText:
        "To elevate the living area, we suggest a feature wall that becomes a focal point and makes the space feel more designed, not just renovated.",
    });
  }

  if (softFurnMissing) {
    const rev = estimatePackageRevenue(budget, 0.02, 2200, 9000);
    const m = marginSplit(rev, 0.65);
    opportunities.push({
      title: "Soft Furnishing Package",
      description:
        "Curtains/blinds + soft accessories aligned to the concept. Improves comfort, acoustic softness, and client-ready finishing.",
      category: "soft_furnishing_package",
      estimatedRevenueIncrease: m.revenue,
      estimatedCostIncrease: m.cost,
      estimatedProfitIncrease: m.profit,
      priority: "MEDIUM",
      pitchText:
        "A soft furnishing package completes the look with curtains/blinds and key soft elements that match the palette and improve comfort.",
    });
  }

  if (storageMissing || wantsStorage) {
    const rev = estimatePackageRevenue(budget, 0.02, 1600, 6500);
    const m = marginSplit(rev, 0.57);
    opportunities.push({
      title: "Storage Optimization Add-on",
      description:
        "Add hidden storage (shoe cabinet, pantry pull-out, bedroom storage) to reduce clutter and increase daily usability.",
      category: "storage_optimization",
      estimatedRevenueIncrease: m.revenue,
      estimatedCostIncrease: m.cost,
      estimatedProfitIncrease: m.profit,
      priority: wantsStorage ? "HIGH" : "MEDIUM",
      pitchText:
        "We can add targeted storage so the home stays tidy long-term. This is usually one of the highest impact upgrades for daily living.",
    });
  }

  // Always provide one style-aligned premium finish recommendation if budget is meaningful.
  if (budget >= 25000) {
    const rev = estimatePackageRevenue(budget, 0.015, 1200, 4500);
    const m = marginSplit(rev, 0.6);
    opportunities.push({
      title: `${style === "industrial" ? "Industrial Finish" : style === "scandinavian" ? "Warm Timber Finish" : "Premium Finish"} Upgrade`,
      description:
        "Upgrade one high-visibility finish (countertop, vanity top, or feature surface) while keeping the rest practical.",
      category: "premium_finish",
      estimatedRevenueIncrease: m.revenue,
      estimatedCostIncrease: m.cost,
      estimatedProfitIncrease: m.profit,
      priority: wantsLuxury ? "HIGH" : "LOW",
      pitchText:
        "If you want a more premium feel without escalating overall budget, we recommend upgrading one focal finish while keeping other zones practical.",
    });
  }

  // Deduplicate by category (first wins).
  const byCategory = new Map<string, UpsellOpportunity>();
  for (const o of opportunities) {
    if (!byCategory.has(o.category)) byCategory.set(o.category, o);
  }
  const deduped = Array.from(byCategory.values());

  const totals = deduped.reduce(
    (acc, o) => {
      acc.revenue += o.estimatedRevenueIncrease;
      acc.cost += o.estimatedCostIncrease;
      acc.profit += o.estimatedProfitIncrease;
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0 },
  );

  const overallPriority =
    deduped.some((o) => o.priority === "HIGH") ? "HIGH" : deduped.some((o) => o.priority === "MEDIUM") ? "MEDIUM" : "LOW";

  const pitchText = [
    "Optional upgrades (upsells) to increase value and client satisfaction:",
    ...deduped.slice(0, 5).map((o) => `- ${o.title}: ${o.pitchText}`),
  ].join("\n");

  return {
    upsellOpportunities: deduped,
    recommendedAddOns: deduped,
    estimatedRevenueIncrease: toMoney(totals.revenue),
    estimatedCostIncrease: toMoney(totals.cost),
    estimatedProfitIncrease: toMoney(totals.profit),
    pitchText,
    priority: overallPriority,
  };
}

