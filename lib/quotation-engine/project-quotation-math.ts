import type { BuilderSectionInput } from "@/lib/quotation-engine/renovation-default-sections";

export type ComputedQuotationItem = {
  totalPrice: number;
  totalCost: number;
  profit: number;
  marginPercent: number | null;
};

export type ComputedQuotationSection = {
  subtotal: number;
  costSubtotal: number;
  profit: number;
  marginPercent: number | null;
  lineItems: ComputedQuotationItem[];
};

export type ComputedQuotationSummary = {
  subtotal: number;
  discountAmount: number;
  revenueNet: number;
  gstAmount: number;
  totalAmount: number;
  costSubtotal: number;
  estimatedCost: number;
  profitAmount: number;
  profitGrossAmount: number;
  marginPercent: number | null;
  marginGrossPercent: number | null;
  sections: ComputedQuotationSection[];
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundCurrency(value: number): number {
  return round(value, 2);
}

function roundPct(value: number): number {
  return round(value, 4);
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return 0;
  return roundPct((numerator / denominator) * 100);
}

export function computeProjectQuotationSummary(input: {
  sections: BuilderSectionInput[];
  discountAmount?: number;
  gstRate?: number;
}): ComputedQuotationSummary {
  const discountAmount = roundCurrency(input.discountAmount ?? 0);
  const gstRate = input.gstRate ?? 0.09;

  const computedSections: ComputedQuotationSection[] = input.sections.map((section) => {
    const computedItems: ComputedQuotationItem[] = section.lineItems.map((item) => {
      const totalPrice = item.isIncluded
        ? roundCurrency(item.quantity * item.unitPrice)
        : 0;
      const totalCost = item.isIncluded
        ? roundCurrency(item.quantity * item.costPrice)
        : 0;
      const profit = roundCurrency(totalPrice - totalCost);

      return {
        totalPrice,
        totalCost,
        profit,
        marginPercent: pct(profit, totalPrice),
      };
    });

    const subtotal = roundCurrency(computedItems.reduce((sum, li) => sum + li.totalPrice, 0));
    const costSubtotal = roundCurrency(
      computedItems.reduce((sum, li) => sum + li.totalCost, 0),
    );
    const profit = roundCurrency(subtotal - costSubtotal);

    return {
      subtotal,
      costSubtotal,
      profit,
      marginPercent: pct(profit, subtotal),
      lineItems: computedItems,
    };
  });

  const subtotal = roundCurrency(computedSections.reduce((sum, s) => sum + s.subtotal, 0));
  const revenueNet = roundCurrency(Math.max(subtotal - discountAmount, 0));
  const gstAmount = roundCurrency(revenueNet * gstRate);
  const totalAmount = roundCurrency(revenueNet + gstAmount);
  const costSubtotal = roundCurrency(
    computedSections.reduce((sum, s) => sum + s.costSubtotal, 0),
  );
  const estimatedCost = costSubtotal;
  const profitGrossAmount = roundCurrency(subtotal - estimatedCost);
  const profitNetAmount = roundCurrency(revenueNet - estimatedCost);

  return {
    subtotal,
    discountAmount,
    revenueNet,
    gstAmount,
    totalAmount,
    costSubtotal,
    estimatedCost,
    profitAmount: profitNetAmount,
    profitGrossAmount,
    marginPercent: pct(profitNetAmount, revenueNet),
    marginGrossPercent: pct(profitGrossAmount, subtotal),
    sections: computedSections,
  };
}
