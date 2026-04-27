"use server";

import { Permission } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const createLogSchema = z.object({
  projectId: z.string().min(1),
  channel: z.enum(["EMAIL", "WHATSAPP", "PHONE", "MEETING", "OTHER"]),
  direction: z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]).default("INTERNAL"),
  participants: z.string().optional().or(z.literal("")).default(""),
  subject: z.string().optional().or(z.literal("")).default(""),
  body: z.string().min(1),
  occurredAt: z.string().min(1),
});

export async function createCommunicationLog(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createLogSchema.safeParse({
    projectId,
    channel: formData.get("channel"),
    direction: formData.get("direction"),
    participants: formData.get("participants"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) throw new Error("Invalid communication log.");

  const { userId } = await requirePermission({
    permission: Permission.COMMS_WRITE,
    projectId,
  });

  const log = await prisma.projectCommunicationLog.create({
    data: {
      projectId,
      createdById: userId,
      channel: parsed.data.channel,
      direction: parsed.data.direction,
      participants: parsed.data.participants || null,
      subject: parsed.data.subject || null,
      body: parsed.data.body,
      occurredAt: new Date(parsed.data.occurredAt),
      metadata: {},
    },
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `${log.channel} ${log.direction}: ${log.subject || "Message"}`,
      description: log.participants || null,
      createdById: userId,
      metadata: { communicationLogId: log.id, channel: log.channel },
    },
  });

  await auditLog({
    module: "comms",
    action: "create_log",
    actorUserId: userId,
    projectId,
    entityType: "ProjectCommunicationLog",
    entityId: log.id,
    metadata: { channel: log.channel, direction: log.direction },
  });

  await createRevision({
    entityType: "ProjectCommunicationLog",
    entityId: log.id,
    projectId,
    actorUserId: userId,
    note: "Created",
    data: { channel: log.channel, direction: log.direction, occurredAt: log.occurredAt.toISOString() },
  });

  revalidatePath(`/projects/${projectId}/comms`);
  revalidatePath(`/projects/${projectId}`);
}

