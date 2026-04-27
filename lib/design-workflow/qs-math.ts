import { Prisma } from "@prisma/client";

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

function pct(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return roundPct((numerator / denominator) * 100);
}

export function computeQsDerived(params: {
  quantity: number;
  recommendedSellingUnitPrice: number;
  estimatedCostUnitPrice: number;
}) {
  const qty = Number.isFinite(params.quantity) ? Math.max(0, params.quantity) : 0;
  const sell = Number.isFinite(params.recommendedSellingUnitPrice)
    ? Math.max(0, params.recommendedSellingUnitPrice)
    : 0;
  const cost = Number.isFinite(params.estimatedCostUnitPrice)
    ? Math.max(0, params.estimatedCostUnitPrice)
    : 0;

  const sellingTotal = roundCurrency(qty * sell);
  const costTotal = roundCurrency(qty * cost);
  const profit = roundCurrency(sellingTotal - costTotal);
  const marginPercent = pct(profit, sellingTotal);

  return { sellingTotal, costTotal, profit, marginPercent };
}

export function toDecimalCurrency(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundCurrency(value));
}

export function toDecimalPct(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundPct(value));
}

