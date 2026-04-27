import "server-only";

import type { ItemMaster, Prisma } from "@prisma/client";

export type AccountingContactPayload = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type AccountingLinePayload = {
  sku?: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  taxCode?: string | null;
};

export type AccountingInvoicePayload = {
  invoiceNumber: string;
  issueDate: string; // ISO date
  dueDate?: string | null;
  contact: AccountingContactPayload;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: AccountingLinePayload[];
  notes?: string | null;
};

export type AccountingBillPayload = {
  billNumber: string;
  billDate: string; // ISO date
  dueDate?: string | null;
  supplier: AccountingContactPayload;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: AccountingLinePayload[];
  notes?: string | null;
};

export type AccountingPaymentPayload = {
  receiptNumber: string;
  paymentDate: string; // ISO date
  amount: number;
  method?: string | null;
  reference?: string | null;
  invoiceNumber?: string | null;
};

export type AccountingItemPayload = {
  sku: string;
  name: string;
  description?: string | null;
  sellPrice: number;
  costPrice: number;
  taxCode?: string | null;
  isActive: boolean;
};

function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function money(n: Prisma.Decimal | number | null | undefined): number {
  const v = n === null || n === undefined ? 0 : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function qty(n: Prisma.Decimal | number | null | undefined): number {
  const v = n === null || n === undefined ? 0 : Number(n);
  if (!Number.isFinite(v)) return 0;
  return v;
}

export function mapInvoiceToXeroPayload(input: {
  invoice: Prisma.InvoiceGetPayload<{
    include: {
      lineItems: true;
      project: { include: { client: true } };
    };
  }>;
  taxCode?: string | null;
}): AccountingInvoicePayload {
  const project = input.invoice.project;
  const contactName =
    project.clientName ||
    project.client?.name ||
    project.client?.companyName ||
    "Client";

  return {
    invoiceNumber: input.invoice.invoiceNumber,
    issueDate: isoDate(input.invoice.issueDate) ?? "",
    dueDate: isoDate(input.invoice.dueDate),
    contact: {
      name: contactName,
      email: project.clientEmail || project.client?.email || null,
      phone: project.clientPhone || project.client?.phone || null,
    },
    currency: "SGD",
    subtotal: money(input.invoice.subtotal),
    taxAmount: money(input.invoice.taxAmount),
    totalAmount: money(input.invoice.totalAmount),
    notes: input.invoice.notes ?? null,
    lines: input.invoice.lineItems.map((li) => ({
      sku: li.sku ?? null,
      description: li.description,
      quantity: qty(li.quantity),
      unitAmount: money(li.unitPrice),
      lineAmount: money(li.lineAmount),
      taxCode: input.taxCode ?? null,
    })),
  };
}

export function mapSupplierBillToXeroPayload(input: {
  bill: Prisma.SupplierBillGetPayload<{
    include: { lines: true; supplier: true };
  }>;
  taxCode?: string | null;
}): AccountingBillPayload {
  return {
    billNumber: input.bill.billNumber,
    billDate: isoDate(input.bill.billDate) ?? "",
    dueDate: isoDate(input.bill.dueDate),
    supplier: {
      name: input.bill.supplier.name,
      email: input.bill.supplier.email ?? null,
      phone: input.bill.supplier.phone ?? null,
    },
    currency: "SGD",
    subtotal: money(input.bill.subtotal),
    taxAmount: money(input.bill.taxAmount),
    totalAmount: money(input.bill.totalAmount),
    notes: input.bill.notes ?? null,
    lines: input.bill.lines.map((l) => ({
      sku: null,
      description: l.description,
      quantity: qty(l.quantity),
      unitAmount: money(l.unitCost),
      lineAmount: money(l.lineAmount),
      taxCode: input.taxCode ?? null,
    })),
  };
}

export function mapReceiptToXeroPayload(input: {
  receipt: Prisma.PaymentReceiptGetPayload<{
    include: { invoice: { select: { invoiceNumber: true } } };
  }>;
}): AccountingPaymentPayload {
  return {
    receiptNumber: input.receipt.receiptNumber,
    paymentDate: isoDate(input.receipt.paymentDate) ?? "",
    amount: money(input.receipt.amount),
    method: input.receipt.paymentMethod ?? null,
    reference: input.receipt.referenceNo ?? null,
    invoiceNumber: input.receipt.invoice?.invoiceNumber ?? null,
  };
}

export function mapClientToXeroPayload(input: {
  client: Prisma.ClientGetPayload<{
    include: { contacts: true };
  }>;
}): AccountingContactPayload {
  return {
    name: input.client.companyName || input.client.name,
    email: input.client.email ?? input.client.contacts.find((c) => c.isPrimary)?.email ?? null,
    phone: input.client.phone ?? input.client.contacts.find((c) => c.isPrimary)?.phone ?? null,
  };
}

export function mapVendorToXeroPayload(input: {
  vendor: Prisma.VendorGetPayload<{
    include: { contacts: true };
  }>;
}): AccountingContactPayload {
  return {
    name: input.vendor.companyName || input.vendor.name,
    email: input.vendor.email ?? input.vendor.contacts.find((c) => c.isPrimary)?.email ?? null,
    phone: input.vendor.phone ?? input.vendor.contacts.find((c) => c.isPrimary)?.phone ?? null,
  };
}

export function mapItemMasterToXeroPayload(input: {
  item: ItemMaster;
}): AccountingItemPayload {
  return {
    sku: input.item.sku,
    name: input.item.name,
    description: input.item.description ?? null,
    sellPrice: money(input.item.sellPrice),
    costPrice: money(input.item.costPrice),
    taxCode: input.item.taxCode ?? null,
    isActive: input.item.status === "ACTIVE",
  };
}
