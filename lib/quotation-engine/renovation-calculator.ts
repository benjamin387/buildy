import type {
  BuilderLineItemInput,
  BuilderSectionInput,
} from "@/lib/quotation-engine/renovation-default-sections";

export type CalculatedLineItem = BuilderLineItemInput & {
  totalPrice: number;
};

export type CalculatedSection = Omit<BuilderSectionInput, "lineItems"> & {
  subtotal: number;
  lineItems: CalculatedLineItem[];
};

export type CalculatedRenovationQuote = {
  sections: CalculatedSection[];
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  totalAmount: number;
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLineItemAmount(item: BuilderLineItemInput): number {
  if (!item.isIncluded) {
    return 0;
  }

  return round(item.quantity * item.unitPrice);
}

export function calculateSectionSubtotal(
  section: BuilderSectionInput,
): CalculatedSection {
  const lineItems = section.lineItems.map((item) => ({
    ...item,
    totalPrice: calculateLineItemAmount(item),
  }));

  const subtotal = round(lineItems.reduce((sum, item) => sum + item.totalPrice, 0));

  return {
    ...section,
    subtotal,
    lineItems,
  };
}

export function calculateRenovationQuote(input: {
  sections: BuilderSectionInput[];
  discountAmount?: number;
  gstRate?: number;
}): CalculatedRenovationQuote {
  const sections = input.sections.map(calculateSectionSubtotal);
  const subtotal = round(sections.reduce((sum, section) => sum + section.subtotal, 0));
  const discountAmount = round(input.discountAmount ?? 0);
  const taxableAmount = round(Math.max(subtotal - discountAmount, 0));
  const gstRate = input.gstRate ?? 0.09;
  const gstAmount = round(taxableAmount * gstRate);
  const totalAmount = round(taxableAmount + gstAmount);

  return {
    sections,
    subtotal,
    discountAmount,
    gstAmount,
    totalAmount,
  };
}
