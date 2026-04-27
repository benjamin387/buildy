import type { BuilderSectionInput } from "@/lib/quotation-engine/renovation-default-sections";
import { calculateRenovationQuote } from "@/lib/quotation-engine/renovation-calculator";

export type MarginLineItem = {
  revenueAmount: number;
  costAmount: number;
  grossMargin: number;
  marginPct: number | null;
};

export type MarginSection = {
  category: BuilderSectionInput["category"];
  title: string;
  revenueSubtotal: number;
  costSubtotal: number;
  grossMargin: number;
  marginPct: number | null;
};

export type MarginSummary = {
  revenueSubtotal: number;
  revenueDiscount: number;
  revenueNet: number;
  costSubtotal: number;
  grossMargin: number;
  marginPct: number | null;
  sections: MarginSection[];
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round((numerator / denominator) * 100);
}

export function computeMarginSummary(input: {
  sections: BuilderSectionInput[];
  discountAmount?: number;
  gstRate?: number;
}): MarginSummary {
  const calculated = calculateRenovationQuote({
    sections: input.sections,
    discountAmount: input.discountAmount,
    gstRate: input.gstRate,
  });

  const sectionSummaries: MarginSection[] = calculated.sections.map(
    (section, sectionIndex) => {
      const revenueSubtotal = round(section.subtotal);
      const costSubtotal = round(
        section.lineItems.reduce((sum, item, itemIndex) => {
          const cost = item.isIncluded ? item.quantity * item.costPrice : 0;
          return sum + cost;
        }, 0),
      );

      const grossMargin = round(revenueSubtotal - costSubtotal);
      return {
        category: section.category,
        title: section.title,
        revenueSubtotal,
        costSubtotal,
        grossMargin,
        marginPct: pct(grossMargin, revenueSubtotal),
      };
    },
  );

  const revenueSubtotal = round(calculated.subtotal);
  const revenueDiscount = round(calculated.discountAmount);
  const revenueNet = round(Math.max(revenueSubtotal - revenueDiscount, 0));
  const costSubtotal = round(
    sectionSummaries.reduce((sum, section) => sum + section.costSubtotal, 0),
  );
  const grossMargin = round(revenueNet - costSubtotal);

  return {
    revenueSubtotal,
    revenueDiscount,
    revenueNet,
    costSubtotal,
    grossMargin,
    marginPct: pct(grossMargin, revenueNet),
    sections: sectionSummaries,
  };
}
