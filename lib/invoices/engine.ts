import { Prisma } from "@prisma/client";

export type InvoiceLineInput = {
  description: string;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  sortOrder: number;
  itemId?: string | null;
  sku?: string | null;
};

export type InvoiceComputed = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function assertFiniteNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value)) throw new Error(`${field} must be a valid number.`);
  if (value < 0) throw new Error(`${field} cannot be negative.`);
  return value;
}

export function computeLineAmount(quantity: number, unitPrice: number): number {
  assertFiniteNonNegative(quantity, "Quantity");
  assertFiniteNonNegative(unitPrice, "Unit price");
  return roundCurrency(quantity * unitPrice);
}

export function computeInvoiceTotals(params: {
  lines: Array<Pick<InvoiceLineInput, "quantity" | "unitPrice">>;
  discountAmount: number;
  gstRate: number;
}): InvoiceComputed {
  const discountAmount = roundCurrency(assertFiniteNonNegative(params.discountAmount, "Discount"));
  const gstRate = assertFiniteNonNegative(params.gstRate, "GST rate");

  const subtotal = roundCurrency(
    params.lines.reduce((sum, line) => sum + computeLineAmount(line.quantity, line.unitPrice), 0),
  );

  const taxable = Math.max(roundCurrency(subtotal - discountAmount), 0);
  const taxAmount = roundCurrency(taxable * gstRate);
  const totalAmount = roundCurrency(taxable + taxAmount);

  return { subtotal, discountAmount, taxAmount, totalAmount };
}

export function computeOutstandingAmount(totalAmount: number, receiptsTotal: number): number {
  const total = assertFiniteNonNegative(totalAmount, "Total amount");
  const receipts = assertFiniteNonNegative(receiptsTotal, "Receipts total");
  return Math.max(roundCurrency(total - receipts), 0);
}

export function toDecimal(value: number): Prisma.Decimal {
  // Prisma.Decimal accepts number but we enforce rounding to 2dp to avoid long floats.
  return new Prisma.Decimal(roundCurrency(value));
}

