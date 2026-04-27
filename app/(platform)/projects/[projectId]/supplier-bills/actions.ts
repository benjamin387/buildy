"use server";

import { Permission } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { approveSupplierBill, createSupplierBill } from "@/lib/suppliers/service";
import { syncSupplierBillToXero } from "@/lib/accounting/sync-service";

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const lineSchema = z.object({
  id: z.string().optional().nullable(),
  itemId: z.string().optional().nullable(),
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

const createSchema = z.object({
  projectId: z.string().min(1),
  supplierId: z.string().min(1),
  purchaseOrderId: z.string().optional().or(z.literal("")).default(""),
  subcontractId: z.string().optional().or(z.literal("")).default(""),
  billDate: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
  linesJson: linesJsonSchema,
});

export async function createSupplierBillAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createSchema.safeParse({
    projectId,
    supplierId: formData.get("supplierId"),
    purchaseOrderId: formData.get("purchaseOrderId"),
    subcontractId: formData.get("subcontractId"),
    billDate: formData.get("billDate"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
    linesJson: formData.get("linesJson"),
  });
  if (!parsed.success) throw new Error("Invalid supplier bill input.");

  const { userId } = await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });

  const bill = await createSupplierBill({
    projectId,
    supplierId: parsed.data.supplierId,
    purchaseOrderId: parsed.data.purchaseOrderId || null,
    subcontractId: parsed.data.subcontractId || null,
    billDate: toDate(parsed.data.billDate),
    dueDate: parsed.data.dueDate ? toDate(parsed.data.dueDate) : null,
    notes: parsed.data.notes || null,
    lines: parsed.data.linesJson.map((l) => ({
      id: l.id ?? null,
      itemId: l.itemId ?? null,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unitCost,
      sortOrder: l.sortOrder,
    })),
  });

  await auditLog({
    module: "supplier_bill",
    action: "create",
    actorUserId: userId,
    projectId,
    entityType: "SupplierBill",
    entityId: bill.id,
    metadata: { billNumber: bill.billNumber, supplierId: bill.supplierId },
  });

  await createRevision({
    entityType: "SupplierBill",
    entityId: bill.id,
    projectId,
    actorUserId: userId,
    note: "Draft created",
    data: { billNumber: bill.billNumber, subtotal: Number(bill.subtotal), totalAmount: Number(bill.totalAmount) },
  });

  revalidatePath(`/projects/${projectId}/supplier-bills`);
  redirect(`/projects/${projectId}/supplier-bills/${bill.id}`);
}

const approveSchema = z.object({
  projectId: z.string().min(1),
  supplierBillId: z.string().min(1),
});

export async function approveSupplierBillAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = approveSchema.safeParse({
    projectId,
    supplierBillId: formData.get("supplierBillId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });

  const bill = await approveSupplierBill({ projectId, supplierBillId: parsed.data.supplierBillId });

  await auditLog({
    module: "supplier_bill",
    action: "approve",
    actorUserId: userId,
    projectId,
    entityType: "SupplierBill",
    entityId: bill.id,
    metadata: { billNumber: bill.billNumber },
  });

  revalidatePath(`/projects/${projectId}/supplier-bills`);
  redirect(`/projects/${projectId}/supplier-bills/${bill.id}`);
}

const syncSchema = z.object({
  projectId: z.string().min(1),
  supplierBillId: z.string().min(1),
});

export async function syncSupplierBillToXeroAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = syncSchema.safeParse({
    projectId,
    supplierBillId: formData.get("supplierBillId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });
  await requirePermission({ permission: Permission.SETTINGS_WRITE });

  const result = await syncSupplierBillToXero(parsed.data.supplierBillId);

  await auditLog({
    module: "accounting",
    action: "sync_supplier_bill",
    actorUserId: userId,
    projectId,
    entityType: "SupplierBill",
    entityId: parsed.data.supplierBillId,
    metadata: { ...result },
  });

  revalidatePath(`/projects/${projectId}/supplier-bills/${parsed.data.supplierBillId}`);
  redirect(`/projects/${projectId}/supplier-bills/${parsed.data.supplierBillId}`);
}
