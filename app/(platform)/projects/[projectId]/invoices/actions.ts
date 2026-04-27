"use server";

import { InvoiceStatus, InvoiceType, Permission } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requirePermission as requireModulePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import {
  computeProjectInvoiceSummary,
  createInvoiceFromPaymentSchedule,
  createManualInvoice,
  createCreditNote,
  generatePaymentScheduleFromApprovedQuotation,
  generatePaymentScheduleFromSignedContract,
  getInvoiceById,
  markOverdueInvoices,
  recordPaymentReceipt,
  setInvoiceStatus,
  updateInvoiceDraft,
} from "@/lib/invoices/service";
import { auditLog, createRevision } from "@/lib/audit";
import { generateReceiptNumber } from "@/lib/invoices/receipt-number";
import { generateCreditNoteNumber } from "@/lib/invoices/credit-note-number";
import { syncInvoiceToXero, syncPaymentReceiptToXero } from "@/lib/accounting/sync-service";

const dateString = z.string().min(1);

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const invoiceLineSchema = z.object({
  id: z.string().optional().nullable(),
  itemId: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  description: z.string().min(1),
  unit: z.string().optional().nullable(),
  quantity: z.number().finite().min(0),
  unitPrice: z.number().finite().min(0),
  sortOrder: z.number().int().min(0),
});

const linesJsonSchema = z
  .string()
  .min(2)
  .transform((val, ctx) => {
    try {
      return JSON.parse(val) as unknown;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid lines JSON." });
      return z.NEVER;
    }
  })
  .pipe(z.array(invoiceLineSchema).min(1));

const createManualInvoiceSchema = z.object({
  projectId: z.string().min(1),
  invoiceType: z.nativeEnum(InvoiceType),
  issueDate: dateString,
  dueDate: z.string().optional().or(z.literal("")).default(""),
  discountAmount: z.coerce.number().min(0).default(0),
  title: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
  contractId: z.string().optional().or(z.literal("")).default(""),
  quotationId: z.string().optional().or(z.literal("")).default(""),
  variationOrderId: z.string().optional().or(z.literal("")).default(""),
  linesJson: linesJsonSchema,
});

export async function createManualInvoiceAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createManualInvoiceSchema.safeParse({
    projectId,
    invoiceType: formData.get("invoiceType"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    discountAmount: formData.get("discountAmount"),
    title: formData.get("title"),
    notes: formData.get("notes"),
    contractId: formData.get("contractId"),
    quotationId: formData.get("quotationId"),
    variationOrderId: formData.get("variationOrderId"),
    linesJson: formData.get("linesJson"),
  });
  if (!parsed.success) throw new Error("Invalid invoice input.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });
  await requireModulePermission({ moduleKey: "INVOICES" satisfies PermissionModuleKey, action: "create" });

  const invoice = await createManualInvoice({
    projectId,
    contractId: parsed.data.contractId || null,
    quotationId: parsed.data.quotationId || null,
    variationOrderId: parsed.data.variationOrderId || null,
    invoiceType: parsed.data.invoiceType,
    issueDate: toDate(parsed.data.issueDate),
    dueDate: parsed.data.dueDate ? toDate(parsed.data.dueDate) : null,
    discountAmount: parsed.data.discountAmount,
    title: parsed.data.title || null,
    notes: parsed.data.notes || null,
    lines: parsed.data.linesJson.map((l) => ({
      id: l.id ?? null,
      itemId: l.itemId ?? null,
      sku: l.sku ?? null,
      description: l.description,
      unit: l.unit ?? "lot",
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      sortOrder: l.sortOrder,
    })),
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "INVOICE",
      title: `Invoice drafted: ${invoice.invoiceNumber}`,
      createdById: userId,
      metadata: { invoiceId: invoice.id },
    },
  });

  await auditLog({
    module: "invoice",
    action: "create_manual",
    actorUserId: userId,
    projectId,
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, invoiceType: invoice.invoiceType },
  });

  await createRevision({
    entityType: "Invoice",
    entityId: invoice.id,
    projectId,
    actorUserId: userId,
    note: "Draft created",
    data: { invoiceNumber: invoice.invoiceNumber, totalAmount: Number(invoice.totalAmount) },
  });

  revalidatePath(`/projects/${projectId}/invoices`);
  redirect(`/projects/${projectId}/invoices/${invoice.id}`);
}

const createFromScheduleSchema = z.object({
  projectId: z.string().min(1),
  paymentScheduleId: z.string().min(1),
  issueDate: dateString,
  dueDate: z.string().optional().or(z.literal("")).default(""),
  invoiceType: z.nativeEnum(InvoiceType).optional(),
});

export async function createInvoiceFromScheduleAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createFromScheduleSchema.safeParse({
    projectId,
    paymentScheduleId: formData.get("paymentScheduleId"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    invoiceType: formData.get("invoiceType") ?? undefined,
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });
  await requireModulePermission({ moduleKey: "INVOICES" satisfies PermissionModuleKey, action: "create" });

  const invoice = await createInvoiceFromPaymentSchedule({
    projectId,
    paymentScheduleId: parsed.data.paymentScheduleId,
    issueDate: toDate(parsed.data.issueDate),
    dueDate: parsed.data.dueDate ? toDate(parsed.data.dueDate) : null,
    invoiceType: parsed.data.invoiceType,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "INVOICE",
      title: `Invoice drafted: ${invoice.invoiceNumber}`,
      createdById: userId,
      metadata: { invoiceId: invoice.id, paymentScheduleId: parsed.data.paymentScheduleId },
    },
  });

  await auditLog({
    module: "invoice",
    action: "create_from_schedule",
    actorUserId: userId,
    projectId,
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber, paymentScheduleId: parsed.data.paymentScheduleId },
  });

  revalidatePath(`/projects/${projectId}/billing`);
  revalidatePath(`/projects/${projectId}/invoices`);
  redirect(`/projects/${projectId}/invoices/${invoice.id}`);
}

const updateDraftSchema = z.object({
  projectId: z.string().min(1),
  invoiceId: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  discountAmount: z.coerce.number().min(0).default(0),
  title: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
  linesJson: linesJsonSchema,
});

export async function updateInvoiceDraftAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateDraftSchema.safeParse({
    projectId,
    invoiceId: formData.get("invoiceId"),
    dueDate: formData.get("dueDate"),
    discountAmount: formData.get("discountAmount"),
    title: formData.get("title"),
    notes: formData.get("notes"),
    linesJson: formData.get("linesJson"),
  });
  if (!parsed.success) throw new Error("Invalid invoice input.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });
  await requireModulePermission({ moduleKey: "INVOICES" satisfies PermissionModuleKey, action: "edit" });

  const invoice = await updateInvoiceDraft({
    projectId,
    invoiceId: parsed.data.invoiceId,
    dueDate: parsed.data.dueDate ? toDate(parsed.data.dueDate) : null,
    discountAmount: parsed.data.discountAmount,
    title: parsed.data.title || null,
    notes: parsed.data.notes || null,
    lines: parsed.data.linesJson.map((l) => ({
      id: l.id ?? null,
      itemId: l.itemId ?? null,
      sku: l.sku ?? null,
      description: l.description,
      unit: l.unit ?? "lot",
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      sortOrder: l.sortOrder,
    })),
  });

  await auditLog({
    module: "invoice",
    action: "update_draft",
    actorUserId: userId,
    projectId,
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { invoiceNumber: invoice.invoiceNumber },
  });

  await createRevision({
    entityType: "Invoice",
    entityId: invoice.id,
    projectId,
    actorUserId: userId,
    note: "Draft updated",
    data: { totalAmount: Number(invoice.totalAmount) },
  });

  revalidatePath(`/projects/${projectId}/invoices/${invoice.id}`);
  redirect(`/projects/${projectId}/invoices/${invoice.id}`);
}

const setStatusSchema = z.object({
  projectId: z.string().min(1),
  invoiceId: z.string().min(1),
  status: z.nativeEnum(InvoiceStatus),
});

export async function setInvoiceStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = setStatusSchema.safeParse({
    projectId,
    invoiceId: formData.get("invoiceId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_SEND, projectId });
  await requireModulePermission({ moduleKey: "INVOICES" satisfies PermissionModuleKey, action: "send" });

  const updated = await setInvoiceStatus({
    projectId,
    invoiceId: parsed.data.invoiceId,
    status: parsed.data.status,
  });

  await auditLog({
    module: "invoice",
    action: "status_update",
    actorUserId: userId,
    projectId,
    entityType: "Invoice",
    entityId: updated.id,
    metadata: { status: parsed.data.status },
  });

  revalidatePath(`/projects/${projectId}/invoices/${updated.id}`);
  revalidatePath(`/projects/${projectId}/invoices`);
  redirect(`/projects/${projectId}/invoices/${updated.id}`);
}

const receiptSchema = z.object({
  projectId: z.string().min(1),
  invoiceId: z.string().min(1),
  paymentDate: dateString,
  amount: z.coerce.number().min(0.01),
  paymentMethod: z.string().optional().or(z.literal("")).default(""),
  referenceNo: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function recordPaymentReceiptAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = receiptSchema.safeParse({
    projectId,
    invoiceId: formData.get("invoiceId"),
    paymentDate: formData.get("paymentDate"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod"),
    referenceNo: formData.get("referenceNo"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid payment input.");

  const { userId } = await requirePermission({ permission: Permission.PAYMENT_RECORD, projectId });
  await requireModulePermission({ moduleKey: "RECEIPTS" satisfies PermissionModuleKey, action: "create" });

  const receipt = await recordPaymentReceipt({
    projectId,
    invoiceId: parsed.data.invoiceId,
    receiptNumber: generateReceiptNumber(toDate(parsed.data.paymentDate)),
    paymentDate: toDate(parsed.data.paymentDate),
    amount: parsed.data.amount,
    paymentMethod: parsed.data.paymentMethod || null,
    referenceNo: parsed.data.referenceNo || null,
    notes: parsed.data.notes || null,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "PAYMENT",
      title: `Receipt recorded: ${receipt.receiptNumber}`,
      createdById: userId,
      metadata: { receiptId: receipt.id, invoiceId: parsed.data.invoiceId, amount: parsed.data.amount },
    },
  });

  await auditLog({
    module: "invoice",
    action: "record_receipt",
    actorUserId: userId,
    projectId,
    entityType: "PaymentReceipt",
    entityId: receipt.id,
    metadata: { invoiceId: parsed.data.invoiceId, amount: parsed.data.amount },
  });

  revalidatePath(`/projects/${projectId}/receipts`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}/billing`);
  redirect(`/projects/${projectId}/invoices/${parsed.data.invoiceId}`);
}

const generateScheduleSchema = z.object({
  projectId: z.string().min(1),
  source: z.enum(["contract", "quotation"]),
});

export async function generatePaymentScheduleAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = generateScheduleSchema.safeParse({
    projectId,
    source: formData.get("source"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });

  const result =
    parsed.data.source === "contract"
      ? await generatePaymentScheduleFromSignedContract(projectId)
      : await generatePaymentScheduleFromApprovedQuotation(projectId);

  await auditLog({
    module: "invoice",
    action: "generate_schedule",
    actorUserId: userId,
    projectId,
    entityType: "PaymentSchedule",
    metadata: { source: parsed.data.source, result },
  });

  revalidatePath(`/projects/${projectId}/billing`);
  redirect(`/projects/${projectId}/billing`);
}

const markOverdueSchema = z.object({
  projectId: z.string().min(1),
});

export async function markOverdueInvoicesAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = markOverdueSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });
  await markOverdueInvoices(projectId);
  revalidatePath(`/projects/${projectId}/invoices`);
  redirect(`/projects/${projectId}/invoices`);
}

const creditNoteSchema = z.object({
  projectId: z.string().min(1),
  invoiceId: z.string().optional().or(z.literal("")).default(""),
  issueDate: dateString,
  amount: z.coerce.number().min(0.01),
  reason: z.string().min(2),
});

export async function createCreditNoteAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = creditNoteSchema.safeParse({
    projectId,
    invoiceId: formData.get("invoiceId"),
    issueDate: formData.get("issueDate"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) throw new Error("Invalid credit note input.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });

  const credit = await createCreditNote({
    projectId,
    invoiceId: parsed.data.invoiceId || null,
    creditNoteNumber: generateCreditNoteNumber(toDate(parsed.data.issueDate)),
    issueDate: toDate(parsed.data.issueDate),
    amount: parsed.data.amount,
    reason: parsed.data.reason,
  });

  await auditLog({
    module: "invoice",
    action: "create_credit_note",
    actorUserId: userId,
    projectId,
    entityType: "CreditNote",
    entityId: credit.id,
    metadata: { creditNoteNumber: credit.creditNoteNumber, amount: parsed.data.amount },
  });

  revalidatePath(`/projects/${projectId}/invoices`);
  redirect(`/projects/${projectId}/invoices`);
}

// Convenience loader for UI pages (kept here to avoid duplicating includes).
export async function getInvoiceSummaryForProject(projectId: string) {
  await computeProjectInvoiceSummary(projectId);
}

export async function getInvoiceDetail(projectId: string, invoiceId: string) {
  return getInvoiceById({ projectId, invoiceId });
}

const syncInvoiceSchema = z.object({
  projectId: z.string().min(1),
  invoiceId: z.string().min(1),
});

export async function syncInvoiceToXeroAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = syncInvoiceSchema.safeParse({
    projectId,
    invoiceId: formData.get("invoiceId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_READ, projectId });
  await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const result = await syncInvoiceToXero(parsed.data.invoiceId);

  await auditLog({
    module: "accounting",
    action: "sync_invoice",
    actorUserId: userId,
    projectId,
    entityType: "Invoice",
    entityId: parsed.data.invoiceId,
    metadata: { ...result },
  });

  revalidatePath(`/projects/${projectId}/invoices/${parsed.data.invoiceId}`);
  redirect(`/projects/${projectId}/invoices/${parsed.data.invoiceId}`);
}

const syncReceiptSchema = z.object({
  projectId: z.string().min(1),
  receiptId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal("")).default(""),
});

export async function syncPaymentReceiptToXeroAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = syncReceiptSchema.safeParse({
    projectId,
    receiptId: formData.get("receiptId"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_READ, projectId });
  await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const result = await syncPaymentReceiptToXero(parsed.data.receiptId);

  await auditLog({
    module: "accounting",
    action: "sync_payment_receipt",
    actorUserId: userId,
    projectId,
    entityType: "PaymentReceipt",
    entityId: parsed.data.receiptId,
    metadata: { ...result },
  });

  const returnTo = parsed.data.returnTo || `/projects/${projectId}/receipts`;
  revalidatePath(returnTo);
  redirect(returnTo);
}
