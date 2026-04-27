"use server";

import { Permission } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { createPurchaseOrder, issuePurchaseOrder, updatePurchaseOrderDraft } from "@/lib/suppliers/service";

const lineSchema = z.object({
  id: z.string().optional().nullable(),
  itemId: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().finite().min(0),
  unitCost: z.number().finite().min(0),
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
  .pipe(z.array(lineSchema).min(1));

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const createSchema = z.object({
  projectId: z.string().min(1),
  supplierId: z.string().min(1),
  issueDate: z.string().min(1),
  expectedDeliveryDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
  linesJson: linesJsonSchema,
});

export async function createPurchaseOrderAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createSchema.safeParse({
    projectId,
    supplierId: formData.get("supplierId"),
    issueDate: formData.get("issueDate"),
    expectedDeliveryDate: formData.get("expectedDeliveryDate"),
    notes: formData.get("notes"),
    linesJson: formData.get("linesJson"),
  });
  if (!parsed.success) throw new Error("Invalid PO input.");

  const { userId } = await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });

  const po = await createPurchaseOrder({
    projectId,
    supplierId: parsed.data.supplierId,
    issueDate: toDate(parsed.data.issueDate),
    expectedDeliveryDate: parsed.data.expectedDeliveryDate ? toDate(parsed.data.expectedDeliveryDate) : null,
    notes: parsed.data.notes || null,
    lines: parsed.data.linesJson.map((l) => ({
      id: l.id ?? null,
      itemId: l.itemId ?? null,
      sku: l.sku ?? null,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      sortOrder: l.sortOrder,
    })),
  });

  await auditLog({
    module: "po",
    action: "create",
    actorUserId: userId,
    projectId,
    entityType: "PurchaseOrder",
    entityId: po.id,
    metadata: { poNumber: po.poNumber, supplierId: po.supplierId },
  });

  await createRevision({
    entityType: "PurchaseOrder",
    entityId: po.id,
    projectId,
    actorUserId: userId,
    note: "Draft created",
    data: { poNumber: po.poNumber, subtotal: Number(po.subtotal), totalAmount: Number(po.totalAmount) },
  });

  revalidatePath(`/projects/${projectId}/purchase-orders`);
  redirect(`/projects/${projectId}/purchase-orders/${po.id}`);
}

const updateSchema = z.object({
  projectId: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  issueDate: z.string().min(1),
  expectedDeliveryDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
  linesJson: linesJsonSchema,
});

export async function updatePurchaseOrderDraftAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateSchema.safeParse({
    projectId,
    purchaseOrderId: formData.get("purchaseOrderId"),
    issueDate: formData.get("issueDate"),
    expectedDeliveryDate: formData.get("expectedDeliveryDate"),
    notes: formData.get("notes"),
    linesJson: formData.get("linesJson"),
  });
  if (!parsed.success) throw new Error("Invalid PO input.");

  const { userId } = await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });

  const po = await updatePurchaseOrderDraft({
    projectId,
    purchaseOrderId: parsed.data.purchaseOrderId,
    issueDate: toDate(parsed.data.issueDate),
    expectedDeliveryDate: parsed.data.expectedDeliveryDate ? toDate(parsed.data.expectedDeliveryDate) : null,
    notes: parsed.data.notes || null,
    lines: parsed.data.linesJson.map((l) => ({
      id: l.id ?? null,
      itemId: l.itemId ?? null,
      sku: l.sku ?? null,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      sortOrder: l.sortOrder,
    })),
  });

  await auditLog({
    module: "po",
    action: "update_draft",
    actorUserId: userId,
    projectId,
    entityType: "PurchaseOrder",
    entityId: po.id,
    metadata: { poNumber: po.poNumber },
  });

  await createRevision({
    entityType: "PurchaseOrder",
    entityId: po.id,
    projectId,
    actorUserId: userId,
    note: "Draft updated",
    data: { subtotal: Number(po.subtotal), totalAmount: Number(po.totalAmount) },
  });

  revalidatePath(`/projects/${projectId}/purchase-orders/${po.id}`);
  redirect(`/projects/${projectId}/purchase-orders/${po.id}`);
}

const issueSchema = z.object({
  projectId: z.string().min(1),
  purchaseOrderId: z.string().min(1),
});

export async function issuePurchaseOrderAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = issueSchema.safeParse({
    projectId,
    purchaseOrderId: formData.get("purchaseOrderId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });

  const po = await issuePurchaseOrder({ projectId, purchaseOrderId: parsed.data.purchaseOrderId });

  await auditLog({
    module: "po",
    action: "issue",
    actorUserId: userId,
    projectId,
    entityType: "PurchaseOrder",
    entityId: po.id,
    metadata: { poNumber: po.poNumber },
  });

  revalidatePath(`/projects/${projectId}/purchase-orders`);
  redirect(`/projects/${projectId}/purchase-orders/${po.id}`);
}

