import { Prisma } from "@prisma/client";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function assertFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`${field} must be a valid number.`);
  if (value < 0) throw new Error(`${field} cannot be negative.`);
  return value;
}

export function computeLineAmount(quantity: number, unitCost: number): number {
  assertFiniteNonNegative(quantity, "Quantity");
  assertFiniteNonNegative(unitCost, "Unit cost");
  return roundCurrency(quantity * unitCost);
}

export function computeDocumentTotals(params: {
  lines: Array<{ quantity: number; unitCost: number }>;
  gstRate: number;
  isGstRegistered: boolean;
}): { subtotal: number; taxAmount: number; totalAmount: number } {
  const gstRate = assertFiniteNonNegative(params.gstRate, "GST rate");
  const subtotal = roundCurrency(
    params.lines.reduce((sum, l) => sum + computeLineAmount(l.quantity, l.unitCost), 0),
  );
  const taxAmount = params.isGstRegistered ? roundCurrency(subtotal * gstRate) : 0;
  const totalAmount = roundCurrency(subtotal + taxAmount);
  return { subtotal, taxAmount, totalAmount };
}

export function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundCurrency(value));
}

