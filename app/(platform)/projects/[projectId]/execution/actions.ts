"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/rbac";
import {
  createBudgetRevisionFromActiveLocked,
  lockBudget,
  unlockBudget,
  type ExecutionActor,
} from "@/lib/execution/budget-service";
import {
  convertProcurementItemToPurchaseOrder,
  convertProcurementItemToSubcontract,
  setProcurementPlannedVendor,
} from "@/lib/execution/procurement-service";
import { generateExecutionCashflowSnapshot } from "@/lib/execution/cashflow-auto";
import { refreshProjectExecutionAlerts } from "@/lib/execution/alerts";

function actorFromUser(user: Awaited<ReturnType<typeof requireUser>>): ExecutionActor {
  return {
    userId: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    roleKeys: user.roleKeys,
    isAdmin: user.isAdmin,
  };
}

const createRevisionSchema = z.object({
  projectId: z.string().min(1),
  note: z.string().optional().or(z.literal("")).default(""),
});

export async function createBudgetRevisionAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createRevisionSchema.safeParse({
    projectId,
    note: formData.get("note"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const user = await requireUser();
  const actor = actorFromUser({ ...user, id: userId });

  await createBudgetRevisionFromActiveLocked({
    projectId,
    actor,
    note: parsed.data.note || null,
  });

  await refreshProjectExecutionAlerts(projectId).catch(() => null);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/execution`);
}

const lockSchema = z.object({
  projectId: z.string().min(1),
  budgetId: z.string().min(1),
});

export async function lockBudgetAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = lockSchema.safeParse({
    projectId,
    budgetId: formData.get("budgetId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requireExecutive();
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const user = await requireUser();
  await lockBudget({ projectId, budgetId: parsed.data.budgetId, actor: actorFromUser(user) });

  await refreshProjectExecutionAlerts(projectId).catch(() => null);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/execution`);
}

const unlockSchema = z.object({
  projectId: z.string().min(1),
  budgetId: z.string().min(1),
  reason: z.string().min(5),
});

export async function unlockBudgetAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = unlockSchema.safeParse({
    projectId,
    budgetId: formData.get("budgetId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const user = await requireExecutive();
  const isDirector = user.roleKeys.includes("DIRECTOR");
  if (!user.isAdmin && !isDirector) throw new Error("Director approval required to unlock budgets.");

  await unlockBudget({
    projectId,
    budgetId: parsed.data.budgetId,
    actor: actorFromUser(user),
    reason: parsed.data.reason,
  });

  await refreshProjectExecutionAlerts(projectId).catch(() => null);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/execution`);
}

const vendorSchema = z.object({
  projectId: z.string().min(1),
  planItemId: z.string().min(1),
  vendorId: z.string().optional().or(z.literal("")).default(""),
});

export async function setProcurementPlannedVendorAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = vendorSchema.safeParse({
    projectId,
    planItemId: formData.get("planItemId"),
    vendorId: formData.get("vendorId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });
  const user = await requireUser();

  await setProcurementPlannedVendor({
    projectId,
    planItemId: parsed.data.planItemId,
    vendorId: parsed.data.vendorId ? parsed.data.vendorId : null,
    actor: actorFromUser(user),
  });

  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/execution`);
}

const convertPoSchema = z.object({
  projectId: z.string().min(1),
  planItemId: z.string().min(1),
  issueDate: z.string().min(1),
  expectedDeliveryDate: z.string().optional().or(z.literal("")).default(""),
});

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

export async function convertProcurementToPoAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = convertPoSchema.safeParse({
    projectId,
    planItemId: formData.get("planItemId"),
    issueDate: formData.get("issueDate"),
    expectedDeliveryDate: formData.get("expectedDeliveryDate"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });
  const user = await requireUser();

  const res = await convertProcurementItemToPurchaseOrder({
    projectId,
    planItemId: parsed.data.planItemId,
    issueDate: toDate(parsed.data.issueDate),
    expectedDeliveryDate: parsed.data.expectedDeliveryDate ? toDate(parsed.data.expectedDeliveryDate) : null,
    actor: actorFromUser(user),
  });

  await refreshProjectExecutionAlerts(projectId).catch(() => null);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/purchase-orders/${res.purchaseOrderId}`);
}

const convertSubSchema = z.object({
  projectId: z.string().min(1),
  planItemId: z.string().min(1),
});

export async function convertProcurementToSubcontractAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = convertSubSchema.safeParse({
    projectId,
    planItemId: formData.get("planItemId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.SUBCONTRACT_WRITE, projectId });
  const user = await requireUser();

  const res = await convertProcurementItemToSubcontract({
    projectId,
    planItemId: parsed.data.planItemId,
    actor: actorFromUser(user),
  });

  await refreshProjectExecutionAlerts(projectId).catch(() => null);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/suppliers/subcontracts/${res.subcontractId}`);
}

const cashflowSchema = z.object({
  projectId: z.string().min(1),
});

export async function generateExecutionCashflowSnapshotAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = cashflowSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  await requireExecutive();
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const user = await requireUser();
  await generateExecutionCashflowSnapshot({ projectId, actor: actorFromUser(user) });
  await refreshProjectExecutionAlerts(projectId).catch(() => null);

  revalidatePath(`/projects/${projectId}/cashflow`);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/cashflow`);
}

export async function refreshExecutionAlertsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = cashflowSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_READ, projectId });
  await refreshProjectExecutionAlerts(projectId).catch(() => null);
  revalidatePath(`/projects/${projectId}/execution`);
  redirect(`/projects/${projectId}/execution`);
}

