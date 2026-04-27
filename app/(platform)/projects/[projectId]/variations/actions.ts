"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createVariationDraft, updateVariationDraft, submitVariationForApproval, approveVariationInternal, rejectVariationInternal, createVariationInvoice, reviseRejectedVariation } from "@/lib/variation-orders/service";

const itemSchema = z.object({
  itemId: z.string().optional().or(z.literal("")).transform((v) => (v ? v : null)).optional(),
  sku: z.string().optional().or(z.literal("")).transform((v) => (v ? v : null)).optional(),
  description: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0),
  sortOrder: z.coerce.number().int().min(0),
});

const baseSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().or(z.literal("")).default(""),
  reason: z.string().optional().or(z.literal("")).default(""),
  requestedBy: z.string().optional().or(z.literal("")).default(""),
  contractId: z.string().optional().or(z.literal("")).default(""),
  quotationId: z.string().optional().or(z.literal("")).default(""),
  timeImpactDays: z.coerce.number().int().min(0).optional().default(0),
  itemsJson: z.string().min(2),
});

function parseItems(itemsJson: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(itemsJson);
  } catch {
    throw new Error("Invalid items payload.");
  }
  const parsed = z.array(itemSchema).safeParse(raw);
  if (!parsed.success) throw new Error("Invalid items payload.");
  return parsed.data.map((i) => ({
    itemId: i.itemId ?? null,
    sku: i.sku ?? null,
    description: i.description,
    unit: i.unit,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    costPrice: i.costPrice,
    sortOrder: i.sortOrder,
  }));
}

export async function createVariationAction(formData: FormData) {
  const parsed = baseSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description"),
    reason: formData.get("reason"),
    requestedBy: formData.get("requestedBy"),
    contractId: formData.get("contractId"),
    quotationId: formData.get("quotationId"),
    timeImpactDays: formData.get("timeImpactDays"),
    itemsJson: formData.get("itemsJson"),
  });
  if (!parsed.success) throw new Error("Invalid variation order input.");

  const items = parseItems(parsed.data.itemsJson);
  const vo = await createVariationDraft({
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    reason: parsed.data.reason || null,
    requestedBy: parsed.data.requestedBy || null,
    contractId: parsed.data.contractId || null,
    quotationId: parsed.data.quotationId || null,
    timeImpactDays: parsed.data.timeImpactDays ?? 0,
    items,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/variations`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/variations/${vo.id}`);
}

const updateSchema = baseSchema.extend({
  variationId: z.string().min(1),
});

export async function updateVariationAction(formData: FormData) {
  const parsed = updateSchema.safeParse({
    projectId: formData.get("projectId"),
    variationId: formData.get("variationId"),
    title: formData.get("title"),
    description: formData.get("description"),
    reason: formData.get("reason"),
    requestedBy: formData.get("requestedBy"),
    contractId: formData.get("contractId"),
    quotationId: formData.get("quotationId"),
    timeImpactDays: formData.get("timeImpactDays"),
    itemsJson: formData.get("itemsJson"),
  });
  if (!parsed.success) throw new Error("Invalid variation order input.");

  const items = parseItems(parsed.data.itemsJson);
  await updateVariationDraft({
    projectId: parsed.data.projectId,
    variationId: parsed.data.variationId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    reason: parsed.data.reason || null,
    requestedBy: parsed.data.requestedBy || null,
    contractId: parsed.data.contractId || null,
    quotationId: parsed.data.quotationId || null,
    timeImpactDays: parsed.data.timeImpactDays ?? 0,
    items,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
}

const submitSchema = z.object({
  projectId: z.string().min(1),
  variationId: z.string().min(1),
  approverName: z.string().min(1),
  approverEmail: z.string().email(),
  approverRole: z.string().min(1),
});

export async function submitVariationForApprovalAction(formData: FormData) {
  const parsed = submitSchema.safeParse({
    projectId: formData.get("projectId"),
    variationId: formData.get("variationId"),
    approverName: formData.get("approverName"),
    approverEmail: formData.get("approverEmail"),
    approverRole: formData.get("approverRole"),
  });
  if (!parsed.success) throw new Error("Invalid submit request.");

  await submitVariationForApproval({
    projectId: parsed.data.projectId,
    variationId: parsed.data.variationId,
    approverName: parsed.data.approverName,
    approverEmail: parsed.data.approverEmail,
    approverRole: parsed.data.approverRole,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
}

const approveSchema = z.object({
  projectId: z.string().min(1),
  variationId: z.string().min(1),
});

export async function approveVariationInternalAction(formData: FormData) {
  const parsed = approveSchema.safeParse({
    projectId: formData.get("projectId"),
    variationId: formData.get("variationId"),
  });
  if (!parsed.success) throw new Error("Invalid approve request.");

  await approveVariationInternal({ projectId: parsed.data.projectId, variationId: parsed.data.variationId });
  revalidatePath(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/pnl`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
}

const rejectSchema = z.object({
  projectId: z.string().min(1),
  variationId: z.string().min(1),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function rejectVariationInternalAction(formData: FormData) {
  const parsed = rejectSchema.safeParse({
    projectId: formData.get("projectId"),
    variationId: formData.get("variationId"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid reject request.");

  await rejectVariationInternal({ projectId: parsed.data.projectId, variationId: parsed.data.variationId, remarks: parsed.data.remarks || null });
  revalidatePath(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/pnl`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
}

const invoiceSchema = z.object({
  projectId: z.string().min(1),
  variationId: z.string().min(1),
});

export async function createVariationInvoiceAction(formData: FormData) {
  const parsed = invoiceSchema.safeParse({
    projectId: formData.get("projectId"),
    variationId: formData.get("variationId"),
  });
  if (!parsed.success) throw new Error("Invalid invoice request.");

  const invoice = await createVariationInvoice({ projectId: parsed.data.projectId, variationId: parsed.data.variationId });
  revalidatePath(`/projects/${parsed.data.projectId}/variations/${parsed.data.variationId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/invoices`);
  revalidatePath(`/projects/${parsed.data.projectId}/billing`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/invoices/${invoice.id}`);
}

const reviseSchema = z.object({
  projectId: z.string().min(1),
  variationId: z.string().min(1),
});

export async function reviseRejectedVariationAction(formData: FormData) {
  const parsed = reviseSchema.safeParse({
    projectId: formData.get("projectId"),
    variationId: formData.get("variationId"),
  });
  if (!parsed.success) throw new Error("Invalid revise request.");

  const next = await reviseRejectedVariation({ projectId: parsed.data.projectId, variationId: parsed.data.variationId });
  revalidatePath(`/projects/${parsed.data.projectId}/variations`);
  revalidatePath(`/projects/${parsed.data.projectId}/documents`);
  revalidatePath(`/documents`);
  redirect(`/projects/${parsed.data.projectId}/variations/${next.id}/edit`);
}
