import { buildLineItems } from "./build-line-items";
import { QuotationInput } from "./validate-input";

export type ComputedQuotation = {
  lineItems: {
    label: string;
    formula: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }[];
  materialsSubtotal: number;
  fabrication: number;
  installation: number;
  designFee: number;
  margin: number;
  subtotal: number;
  gst: number;
  total: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeQuotation(input: QuotationInput): ComputedQuotation {
  const lineItems = buildLineItems(input);
  const materialsSubtotal = round(lineItems.reduce((sum, item) => sum + item.total, 0));
  const fabrication = round(materialsSubtotal * 0.35);
  const installation = round(materialsSubtotal * 0.12);
  const designFee = round(materialsSubtotal * 0.08);
  const margin = round(materialsSubtotal * 0.18);
  const subtotal = round(
    materialsSubtotal + fabrication + installation + designFee + margin,
  );
  const gst = round(subtotal * 0.09);
  const total = round(subtotal + gst);

  return {
    lineItems,
    materialsSubtotal,
    fabrication,
    installation,
    designFee,
    margin,
    subtotal,
    gst,
    total,
  };
}