"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { createDefectReport, upsertDlp } from "@/lib/claims/service";
import { prisma } from "@/lib/prisma";

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const dlpSchema = z.object({
  projectId: z.string().min(1),
  contractId: z.string().optional().or(z.literal("")).default(""),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertDlpAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = dlpSchema.safeParse({
    projectId,
    contractId: formData.get("contractId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid DLP input.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  await upsertDlp({
    projectId,
    contractId: parsed.data.contractId || null,
    startDate: toDate(parsed.data.startDate),
    endDate: toDate(parsed.data.endDate),
    notes: parsed.data.notes || null,
    actorUserId: userId,
  });

  revalidatePath(`/projects/${projectId}/dlp`);
  redirect(`/projects/${projectId}/dlp`);
}

const defectSchema = z.object({
  projectId: z.string().min(1),
  dlpId: z.string().optional().or(z.literal("")).default(""),
  title: z.string().min(1),
  description: z.string().optional().or(z.literal("")).default(""),
});

export async function createDefectReportAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = defectSchema.safeParse({
    projectId,
    dlpId: formData.get("dlpId"),
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) throw new Error("Invalid defect input.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  await createDefectReport({
    projectId,
    dlpId: parsed.data.dlpId || null,
    title: parsed.data.title,
    description: parsed.data.description || null,
    actorUserId: userId,
  });

  revalidatePath(`/projects/${projectId}/dlp`);
  redirect(`/projects/${projectId}/dlp`);
}

const updateDefectSchema = z.object({
  projectId: z.string().min(1),
  defectId: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "RECTIFIED", "CLOSED"]),
});

export async function updateDefectStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateDefectSchema.safeParse({
    projectId,
    defectId: formData.get("defectId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const user = await requireUser();

  const defect = await prisma.defectReport.findUnique({ where: { id: parsed.data.defectId } });
  if (!defect || defect.projectId !== projectId) throw new Error("Defect not found.");

  await prisma.defectReport.update({
    where: { id: defect.id },
    data: {
      status: parsed.data.status,
      rectifiedAt: parsed.data.status === "CLOSED" ? new Date() : defect.rectifiedAt,
      notes: defect.notes,
    },
  });

  // Lightweight audit trail via legacy audit event (mirrors into new audit log best-effort).
  // We keep this local to avoid importing the full logger everywhere.
  await prisma.auditEvent.create({
    data: {
      module: "dlp",
      action: "defect_status",
      actorUserId: userId,
      projectId,
      entityType: "DefectReport",
      entityId: defect.id,
      metadata: { status: parsed.data.status, actor: { name: user.name ?? null, email: user.email } },
    },
  });

  revalidatePath(`/projects/${projectId}/dlp`);
  redirect(`/projects/${projectId}/dlp`);
}

