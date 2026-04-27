"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { refreshFinalAccount } from "@/lib/claims/service";
import { prisma } from "@/lib/prisma";
import { auditLog, createRevision } from "@/lib/audit";

const baseSchema = z.object({
  projectId: z.string().min(1),
});

export async function refreshFinalAccountAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = baseSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_READ, projectId });
  await refreshFinalAccount({ projectId, actorUserId: userId });

  revalidatePath(`/projects/${projectId}/final-account`);
  redirect(`/projects/${projectId}/final-account`);
}

export async function submitFinalAccountForApprovalAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = baseSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const fa = await prisma.finalAccount.findUnique({ where: { projectId } });
  if (!fa) throw new Error("Final account not found. Refresh first.");
  if (fa.status === "LOCKED") throw new Error("Final account is locked.");

  await prisma.$transaction(async (tx) => {
    await tx.finalAccount.update({ where: { id: fa.id }, data: { status: "PENDING_APPROVAL" } });
    await tx.finalAccountApproval.upsert({
      where: { finalAccountId_roleKey: { finalAccountId: fa.id, roleKey: "DIRECTOR" } },
      create: { finalAccountId: fa.id, roleKey: "DIRECTOR", status: "PENDING" },
      update: { status: "PENDING" },
    });
  });

  await auditLog({
    module: "final_account",
    action: "submit",
    actorUserId: userId,
    projectId,
    entityType: "FinalAccount",
    entityId: fa.id,
    metadata: { status: "PENDING_APPROVAL" },
  });

  await createRevision({
    entityType: "FinalAccount",
    entityId: fa.id,
    projectId,
    actorUserId: userId,
    note: "Final account submitted for approval",
    data: { status: "PENDING_APPROVAL" },
  });

  revalidatePath(`/projects/${projectId}/final-account`);
  redirect(`/projects/${projectId}/final-account`);
}

export async function approveFinalAccountAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = baseSchema.safeParse({ projectId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.CONTRACT_APPROVE, projectId });
  const user = await requireUser();

  const fa = await prisma.finalAccount.findUnique({ where: { projectId } });
  if (!fa) throw new Error("Final account not found.");
  if (fa.status !== "PENDING_APPROVAL") throw new Error("Final account must be pending approval.");

  // Final retention release must be eligible (DLP ended and no open defects).
  const dlp = await prisma.defectLiabilityPeriod.findUnique({
    where: { projectId },
    include: { defects: { select: { id: true, status: true } } },
  });
  if (dlp) {
    const open = dlp.defects.filter((d) => d.status !== "CLOSED");
    if (open.length > 0) throw new Error("Cannot approve final account: there are open defects.");
    if (new Date() < dlp.endDate) throw new Error("Cannot approve final account: DLP has not ended.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.finalAccount.update({
      where: { id: fa.id },
      data: { status: "LOCKED", lockedAt: now, lockedByName: user.name ?? null, lockedByEmail: user.email },
    });
    await tx.finalAccountApproval.updateMany({
      where: { finalAccountId: fa.id, roleKey: "DIRECTOR" },
      data: { status: "APPROVED", approverName: user.name ?? null, approverEmail: user.email, actedAt: now },
    });
  });

  await auditLog({
    module: "final_account",
    action: "approve",
    actorUserId: userId,
    projectId,
    entityType: "FinalAccount",
    entityId: fa.id,
    metadata: { status: "LOCKED" },
  });

  await createRevision({
    entityType: "FinalAccount",
    entityId: fa.id,
    projectId,
    actorUserId: userId,
    note: "Final account locked",
    data: { status: "LOCKED", lockedAt: now },
  });

  revalidatePath(`/projects/${projectId}/final-account`);
  redirect(`/projects/${projectId}/final-account`);
}

