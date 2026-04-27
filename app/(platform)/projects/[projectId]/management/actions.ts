"use server";

import { Permission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const createUpdateSchema = z.object({
  projectId: z.string().min(1),
  visibility: z.enum(["INTERNAL", "CLIENT"]).default("INTERNAL"),
  title: z.string().min(1),
  body: z.string().min(1),
  occurredAt: z.string().min(1),
});

export async function createProjectUpdate(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createUpdateSchema.safeParse({
    projectId,
    visibility: formData.get("visibility"),
    title: formData.get("title"),
    body: formData.get("body"),
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) throw new Error("Invalid update input.");

  const { userId } = await requirePermission({
    permission: Permission.PM_UPDATE_WRITE,
    projectId,
  });

  const update = await prisma.projectUpdate.create({
    data: {
      projectId,
      authorId: userId,
      visibility: parsed.data.visibility,
      title: parsed.data.title,
      body: parsed.data.body,
      occurredAt: new Date(parsed.data.occurredAt),
    },
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Update: ${update.title}`,
      description: update.visibility === "CLIENT" ? "Client-facing update" : "Internal update",
      createdById: userId,
      metadata: { projectUpdateId: update.id, visibility: update.visibility },
    },
  });

  await auditLog({
    module: "pm",
    action: "create_update",
    actorUserId: userId,
    projectId,
    entityType: "ProjectUpdate",
    entityId: update.id,
    metadata: { visibility: update.visibility, title: update.title },
  });

  await createRevision({
    entityType: "ProjectUpdate",
    entityId: update.id,
    projectId,
    actorUserId: userId,
    note: "Created",
    data: { title: update.title, visibility: update.visibility, occurredAt: update.occurredAt.toISOString() },
  });

  revalidatePath(`/projects/${projectId}/management`);
  revalidatePath(`/projects/${projectId}`);
}

