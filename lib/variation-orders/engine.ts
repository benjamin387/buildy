import { Prisma } from "@prisma/client";

export type VariationItemInput = {
  itemId?: string | null;
  sku?: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  sortOrder: number;
};

export type VariationItemComputed = VariationItemInput & {
  totalPrice: number;
  totalCost: number;
  profitAmount: number;
  marginPercent: number;
};

export type VariationTotals = {
  subtotal: number;
  costSubtotal: number;
  profitAmount: number;
  marginPercent: number;
  gstAmount: number;
  totalAmount: number;
  costImpact: number;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

export function computeVariationItem(input: VariationItemInput): VariationItemComputed {
  const quantity = clampNonNegative(input.quantity);
  const unitPrice = clampNonNegative(input.unitPrice);
  const costPrice = clampNonNegative(input.costPrice);

  const totalPrice = roundCurrency(quantity * unitPrice);
  const totalCost = roundCurrency(quantity * costPrice);
  const profitAmount = roundCurrency(totalPrice - totalCost);
  const marginPercent = totalPrice > 0 ? roundPercent((profitAmount / totalPrice) * 100) : 0;

  return {
    ...input,
    quantity,
    unitPrice,
    costPrice,
    totalPrice,
    totalCost,
    profitAmount,
    marginPercent,
  };
}

export function computeVariationTotals(params: {
  items: VariationItemInput[];
  gstRate: number;
}): { items: VariationItemComputed[]; totals: VariationTotals } {
  const gstRate = Number.isFinite(params.gstRate) && params.gstRate >= 0 ? params.gstRate : 0;
  const computedItems = params.items.map(computeVariationItem);

  const subtotal = roundCurrency(computedItems.reduce((sum, i) => sum + i.totalPrice, 0));
  const costSubtotal = roundCurrency(computedItems.reduce((sum, i) => sum + i.totalCost, 0));
  const profitAmount = roundCurrency(subtotal - costSubtotal);
  const marginPercent = subtotal > 0 ? roundPercent((profitAmount / subtotal) * 100) : 0;
  const gstAmount = roundCurrency(subtotal * gstRate);
  const totalAmount = roundCurrency(subtotal + gstAmount);

  // "Cost impact" here means contract sum impact (net of GST).
  const costImpact = subtotal;

  return {
    items: computedItems,
    totals: {
      subtotal,
      costSubtotal,
      profitAmount,
      marginPercent,
      gstAmount,
      totalAmount,
      costImpact,
    },
  };
}

export function toDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(roundCurrency(n));
}

