import "server-only";

import type { DesignStyle, PropertyType } from "@prisma/client";

export type BudgetOptimizerBoqItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  recommendedSellingUnitPrice: number;
  estimatedCostUnitPrice: number;
};

export type BudgetOptimizationCut = {
  itemId: string;
  description: string;
  reason: string;
  suggestedSellingUnitPrice: number;
  suggestedCostUnitPrice: number;
  estimatedSavings: number;
};

export type OptimizeDesignBudgetInput = {
  targetBudget: number;
  currentBoqItems: BudgetOptimizerBoqItem[];
  designStyle: DesignStyle | null;
  propertyType: PropertyType;
  mustHaveItems: string[];
  optionalItems: string[];
};

export type OptimizeDesignBudgetOutput = {
  currentTotal: number;
  targetBudget: number;
  overBudgetAmount: number;
  recommendedCuts: BudgetOptimizationCut[];
  recommendedAlternatives: string[];
  valueEngineeringSuggestions: string[];
  itemsToKeep: string[];
  itemsToUpgrade: string[];
  revisedEstimatedTotal: number;
  adjustments: Array<{
    qsBoqDraftItemId: string;
    newRecommendedSellingUnitPrice: number;
    newEstimatedCostUnitPrice: number;
    note: string;
  }>;
};

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function normalizeText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function styleLabel(style: DesignStyle | null): string {
  if (!style) return "Contemporary";
  return style.replaceAll("_", " ").toLowerCase();
}

function computeLineTotal(qty: number, unitPrice: number): number {
  const q = clampNonNegative(qty);
  const p = clampNonNegative(unitPrice);
  return q * p;
}

function classifyPremiumKeywords(description: string): string[] {
  const d = normalizeText(description).toLowerCase();
  const hit: string[] = [];
  if (d.includes("marble")) hit.push("marble");
  if (d.includes("veneer")) hit.push("veneer");
  if (d.includes("quartz")) hit.push("quartz");
  if (d.includes("feature wall") || d.includes("feature-wall") || d.includes("accent")) hit.push("feature");
  if (d.includes("smart home") || d.includes("smart-home") || d.includes("automation")) hit.push("smart");
  if (d.includes("cove") || d.includes("profile") || d.includes("designer")) hit.push("premium-detail");
  if (d.includes("solid surface") || d.includes("corian")) hit.push("solid-surface");
  if (d.includes("brass") || d.includes("gold")) hit.push("metal-finish");
  if (d.includes("custom") || d.includes("bespoke")) hit.push("custom");
  if (d.includes("curtain") || d.includes("blind") || d.includes("soft furnishing")) hit.push("soft");
  if (d.includes("appliance")) hit.push("appliance");
  if (d.includes("lighting") || d.includes("pendant") || d.includes("chandelier")) hit.push("lighting");
  return hit;
}

function defaultReductionFactor(keywords: string[]): { sell: number; cost: number; reason: string } {
  // Deterministic, conservative VE factors. We keep margin healthy by reducing cost too (material substitution).
  if (keywords.includes("marble")) return { sell: 0.82, cost: 0.85, reason: "Suggest quartz/porcelain instead of marble." };
  if (keywords.includes("veneer")) return { sell: 0.88, cost: 0.9, reason: "Suggest laminate instead of veneer." };
  if (keywords.includes("solid-surface")) return { sell: 0.9, cost: 0.92, reason: "Suggest standard quartz/compact laminate instead of solid surface." };
  if (keywords.includes("lighting")) return { sell: 0.88, cost: 0.9, reason: "Suggest track lights / standard fittings instead of premium feature lighting." };
  if (keywords.includes("feature")) return { sell: 0.9, cost: 0.92, reason: "Simplify feature wall details/finishes." };
  if (keywords.includes("custom")) return { sell: 0.9, cost: 0.92, reason: "Simplify custom carpentry profiles and hardware." };
  if (keywords.includes("soft")) return { sell: 0.9, cost: 0.92, reason: "Use standard fabric ranges and simplify soft furnishing package." };
  if (keywords.includes("appliance")) return { sell: 0.92, cost: 0.94, reason: "Consider standard appliance ranges or reduce package scope." };
  return { sell: 0.92, cost: 0.94, reason: "Value engineer optional finishes while preserving core scope." };
}

function enforceMinimumMargin(sell: number, cost: number): { sell: number; cost: number } {
  const minGrossMargin = 0.22; // keeps commercial viability; can be adjusted later
  const safeCost = clampNonNegative(cost);
  const minSell = safeCost === 0 ? 0 : safeCost / (1 - minGrossMargin);
  return { sell: Math.max(clampNonNegative(sell), minSell), cost: safeCost };
}

export async function optimizeDesignBudget(input: OptimizeDesignBudgetInput): Promise<OptimizeDesignBudgetOutput> {
  const targetBudget = clampNonNegative(input.targetBudget);
  if (targetBudget <= 0) throw new Error("Target budget must be greater than 0.");

  const items = input.currentBoqItems.map((it) => ({
    ...it,
    description: normalizeText(it.description),
    unit: normalizeText(it.unit),
    quantity: clampNonNegative(it.quantity),
    recommendedSellingUnitPrice: clampNonNegative(it.recommendedSellingUnitPrice),
    estimatedCostUnitPrice: clampNonNegative(it.estimatedCostUnitPrice),
  }));

  const currentTotal = items.reduce(
    (sum, it) => sum + computeLineTotal(it.quantity, it.recommendedSellingUnitPrice),
    0,
  );

  const overBudgetAmount = Math.max(0, currentTotal - targetBudget);
  const mustKeep = new Set(input.mustHaveItems);
  const optional = new Set(input.optionalItems);

  const candidates = items
    .filter((it) => !mustKeep.has(it.id))
    .map((it) => {
      const keywords = classifyPremiumKeywords(it.description);
      const base = defaultReductionFactor(keywords);

      const extraOptBoost = optional.has(it.id) ? 0.03 : 0;
      const factorSell = Math.max(0.75, base.sell - extraOptBoost);
      const factorCost = Math.max(0.78, base.cost - extraOptBoost * 0.5);

      const suggestedSell = it.recommendedSellingUnitPrice * factorSell;
      const suggestedCost = it.estimatedCostUnitPrice * factorCost;
      const enforced = enforceMinimumMargin(suggestedSell, suggestedCost);

      const savings = computeLineTotal(it.quantity, it.recommendedSellingUnitPrice) - computeLineTotal(it.quantity, enforced.sell);

      return {
        item: it,
        keywords,
        reason: base.reason,
        suggestedSell: enforced.sell,
        suggestedCost: enforced.cost,
        savings,
      };
    })
    .filter((c) => c.savings > 0.01)
    .sort((a, b) => b.savings - a.savings);

  const recommendedCuts: BudgetOptimizationCut[] = [];
  const adjustments: OptimizeDesignBudgetOutput["adjustments"] = [];
  let remaining = overBudgetAmount;

  for (const c of candidates) {
    if (remaining <= 0.01) break;
    // Only recommend deeper cuts on explicitly optional items.
    if (!optional.has(c.item.id) && remaining > currentTotal * 0.15) continue;

    const appliedSavings = Math.min(c.savings, remaining);
    recommendedCuts.push({
      itemId: c.item.id,
      description: c.item.description,
      reason: c.reason,
      suggestedSellingUnitPrice: Number(c.suggestedSell.toFixed(2)),
      suggestedCostUnitPrice: Number(c.suggestedCost.toFixed(2)),
      estimatedSavings: Number(appliedSavings.toFixed(2)),
    });
    adjustments.push({
      qsBoqDraftItemId: c.item.id,
      newRecommendedSellingUnitPrice: Number(c.suggestedSell.toFixed(2)),
      newEstimatedCostUnitPrice: Number(c.suggestedCost.toFixed(2)),
      note: c.reason,
    });
    remaining -= appliedSavings;
  }

  const revisedEstimatedTotal =
    currentTotal -
    recommendedCuts.reduce((sum, cut) => sum + clampNonNegative(cut.estimatedSavings), 0);

  const style = styleLabel(input.designStyle);
  const valueEngineeringSuggestions = [
    `Prioritize core scope; value engineer premium finishes to align with the target budget (style: ${style}).`,
    "Reduce premium stone finishes (marble) where possible; propose quartz/porcelain alternatives.",
    "Use laminate instead of veneer for non-feature carpentry; keep premium only for focal areas.",
    "Simplify feature lighting to track lights + selected statement pieces.",
    "Standardize hardware profiles and modular storage to reduce custom fabrication cost.",
  ];

  const recommendedAlternatives = [
    "Laminate instead of veneer for wardrobes and non-feature carpentry.",
    "Quartz / porcelain slab instead of marble for countertops / feature walls.",
    "Standard carpentry profiles and concealed handles instead of premium profiles.",
    "Track lights instead of extensive cove lighting and custom feature lighting.",
    "Standard paint system instead of special effects / premium finishes except focal zones.",
  ];

  const itemsToUpgrade: string[] = [];
  if (currentTotal < targetBudget * 0.9) {
    itemsToUpgrade.push(
      "Add one premium focal point (feature wall or statement lighting) without compromising circulation and storage.",
    );
  }

  return {
    currentTotal: Number(currentTotal.toFixed(2)),
    targetBudget: Number(targetBudget.toFixed(2)),
    overBudgetAmount: Number(overBudgetAmount.toFixed(2)),
    recommendedCuts,
    recommendedAlternatives,
    valueEngineeringSuggestions,
    itemsToKeep: input.mustHaveItems,
    itemsToUpgrade,
    revisedEstimatedTotal: Number(revisedEstimatedTotal.toFixed(2)),
    adjustments,
  };
}

