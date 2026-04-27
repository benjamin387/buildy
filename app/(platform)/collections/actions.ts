"use server";

import { z } from "zod";
import { Permission } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import {
  addCollectionAction,
  closeCollectionCase,
  completeCollectionAction,
  markPromiseToPay,
  refreshOverdueCollectionCases,
} from "@/lib/collections/service";
import { prisma } from "@/lib/prisma";

const refreshSchema = z.object({
  projectId: z.string().optional().or(z.literal("")).default(""),
});

export async function refreshCollectionsAction(formData: FormData) {
  const parsed = refreshSchema.safeParse({
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const projectId = parsed.data.projectId || undefined;
  await requirePermission({ permission: Permission.INVOICE_READ, projectId });

  await refreshOverdueCollectionCases({ projectId });
  revalidatePath("/collections");
  if (projectId) revalidatePath(`/projects/${projectId}/collections`);
}

const manualNoteSchema = z.object({
  caseId: z.string().min(1),
  message: z.string().min(1),
});

export async function addManualCollectionNoteAction(formData: FormData) {
  const parsed = manualNoteSchema.safeParse({
    caseId: formData.get("caseId"),
    message: formData.get("message"),
  });
  if (!parsed.success) throw new Error("Invalid note.");

  const { userId } = await requirePermission({ permission: Permission.PAYMENT_RECORD });

  const c = await prisma.collectionCase.findUnique({
    where: { id: parsed.data.caseId },
    select: { id: true, projectId: true, caseNumber: true },
  });
  if (!c) throw new Error("Case not found.");

  await addCollectionAction({
    caseId: c.id,
    actionType: "MANUAL_NOTE",
    channel: "MANUAL",
    message: parsed.data.message,
    status: "COMPLETED",
  });

  await auditLog({
    module: "collections",
    action: "manual_note",
    actorUserId: userId,
    projectId: c.projectId,
    entityType: "CollectionCase",
    entityId: c.id,
    metadata: { caseNumber: c.caseNumber },
  });

  await createRevision({
    entityType: "CollectionCase",
    entityId: c.id,
    projectId: c.projectId,
    actorUserId: userId,
    note: "Manual note added",
    data: { message: parsed.data.message },
  });

  revalidatePath(`/collections/${c.id}`);
  revalidatePath(`/projects/${c.projectId}/collections`);
  redirect(`/collections/${c.id}`);
}

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const promiseSchema = z.object({
  caseId: z.string().min(1),
  nextActionDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function markPromiseToPayAction(formData: FormData) {
  const parsed = promiseSchema.safeParse({
    caseId: formData.get("caseId"),
    nextActionDate: formData.get("nextActionDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PAYMENT_RECORD });

  const c = await prisma.collectionCase.findUnique({
    where: { id: parsed.data.caseId },
    select: { id: true, projectId: true, caseNumber: true },
  });
  if (!c) throw new Error("Case not found.");

  const nextActionDate = parsed.data.nextActionDate ? toDate(parsed.data.nextActionDate) : null;
  await markPromiseToPay({ caseId: c.id, nextActionDate, notes: parsed.data.notes || null });

  await addCollectionAction({
    caseId: c.id,
    actionType: "MANUAL_NOTE",
    channel: "MANUAL",
    message: `Promise to pay recorded.${parsed.data.notes ? ` Notes: ${parsed.data.notes}` : ""}`,
    status: "COMPLETED",
  });

  await auditLog({
    module: "collections",
    action: "promise_to_pay",
    actorUserId: userId,
    projectId: c.projectId,
    entityType: "CollectionCase",
    entityId: c.id,
    metadata: { caseNumber: c.caseNumber, nextActionDate: nextActionDate?.toISOString() ?? null },
  });

  revalidatePath(`/collections/${c.id}`);
  revalidatePath(`/projects/${c.projectId}/collections`);
  redirect(`/collections/${c.id}`);
}

const closeSchema = z.object({
  caseId: z.string().min(1),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function closeCollectionCaseAction(formData: FormData) {
  const parsed = closeSchema.safeParse({
    caseId: formData.get("caseId"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PAYMENT_RECORD });

  const c = await prisma.collectionCase.findUnique({
    where: { id: parsed.data.caseId },
    select: { id: true, projectId: true, caseNumber: true },
  });
  if (!c) throw new Error("Case not found.");

  await closeCollectionCase({ caseId: c.id, notes: parsed.data.notes || null });

  await addCollectionAction({
    caseId: c.id,
    actionType: "MANUAL_NOTE",
    channel: "MANUAL",
    message: `Case closed.${parsed.data.notes ? ` Notes: ${parsed.data.notes}` : ""}`,
    status: "COMPLETED",
  });

  await auditLog({
    module: "collections",
    action: "close_case",
    actorUserId: userId,
    projectId: c.projectId,
    entityType: "CollectionCase",
    entityId: c.id,
    metadata: { caseNumber: c.caseNumber },
  });

  revalidatePath(`/collections/${c.id}`);
  revalidatePath("/collections");
  revalidatePath(`/projects/${c.projectId}/collections`);
  redirect(`/collections/${c.id}`);
}

const completeActionSchema = z.object({
  caseId: z.string().min(1),
  actionId: z.string().min(1),
});

export async function completeCollectionActionAction(formData: FormData) {
  const parsed = completeActionSchema.safeParse({
    caseId: formData.get("caseId"),
    actionId: formData.get("actionId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PAYMENT_RECORD });

  const c = await prisma.collectionCase.findUnique({
    where: { id: parsed.data.caseId },
    select: { id: true, projectId: true, caseNumber: true },
  });
  if (!c) throw new Error("Case not found.");

  await completeCollectionAction({ caseId: c.id, actionId: parsed.data.actionId });

  await auditLog({
    module: "collections",
    action: "complete_action",
    actorUserId: userId,
    projectId: c.projectId,
    entityType: "CollectionCase",
    entityId: c.id,
    metadata: { caseNumber: c.caseNumber, actionId: parsed.data.actionId },
  });

  revalidatePath(`/collections/${c.id}`);
  revalidatePath("/collections");
  revalidatePath(`/projects/${c.projectId}/collections`);
  redirect(`/collections/${c.id}`);
}
