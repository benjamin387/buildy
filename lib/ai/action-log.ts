import "server-only";

import { prisma } from "@/lib/prisma";
import { ActivitySeverity, NotificationSeverity, Prisma, type AIActionStatus } from "@prisma/client";
import type { AIDecisionPriority, AIEntityType, AIActionName } from "@/lib/ai/action-types";
import { logActivity } from "@/lib/audit/logger";
import { dispatchNotification } from "@/lib/notifications/dispatcher";

const prismaAny = prisma as unknown as Record<string, any>;

export type CreateAIActionLogInput = {
  action: AIActionName;
  entityType: AIEntityType;
  entityId: string;
  priority: AIDecisionPriority;
  confidence: number;
  reason: string;
  status: AIActionStatus;
  requiresApproval: boolean;
  metadataJson?: Record<string, unknown> | null;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function createAIActionLog(input: CreateAIActionLogInput) {
  // Model name is AIActionLog -> Prisma delegate may be `aIActionLog`.
  const delegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  if (!delegate) throw new Error("Prisma delegate for AIActionLog not found. Run prisma generate.");

  const created = await delegate.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      priority: input.priority,
      confidence: new Prisma.Decimal(clamp01(input.confidence)),
      reason: input.reason.trim(),
      status: input.status,
      requiresApproval: input.requiresApproval,
      metadataJson: (input.metadataJson ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  // Best-effort activity markers to make AI recommendations visible in timelines.
  try {
    const projectId =
      input.metadataJson && typeof input.metadataJson["projectId"] === "string"
        ? String(input.metadataJson["projectId"])
        : null;

    const severity =
      input.priority === "CRITICAL" || input.priority === "HIGH"
        ? ActivitySeverity.IMPORTANT
        : input.priority === "MEDIUM"
          ? ActivitySeverity.INFO
          : ActivitySeverity.INFO;

    await logActivity({
      entityType: String(input.entityType),
      entityId: input.entityId,
      title: `AI recommended: ${input.action}`,
      description: `Priority: ${input.priority} · Confidence: ${clamp01(input.confidence).toFixed(2)} · ${input.reason}`,
      severity,
      createdBy: "AI",
      metadata: { aiActionLogId: created.id, requiresApproval: input.requiresApproval },
      projectIdForMirror: projectId,
    });

    await logActivity({
      entityType: "AIActionLog",
      entityId: created.id,
      title: `AI action queued: ${input.action}`,
      description: `Target: ${input.entityType} ${input.entityId}`,
      severity,
      createdBy: "AI",
      metadata: {
        entityType: input.entityType,
        entityId: input.entityId,
        priority: input.priority,
        confidence: clamp01(input.confidence),
        requiresApproval: input.requiresApproval,
      },
      projectIdForMirror: projectId,
    });
  } catch {
    // ignore
  }

  // Notify ADMIN/DIRECTOR when an AI action enters the approval queue.
  if (input.requiresApproval) {
    try {
      const title = "AI action requires approval";
      const message = `${input.action} · Priority: ${input.priority} · Confidence: ${clamp01(input.confidence).toFixed(2)}\n\n${input.reason}`.trim();
      await dispatchNotification({
        roleKeys: ["ADMIN", "DIRECTOR"],
        entityType: "AIActionLog",
        entityId: created.id,
        title,
        message,
        severity:
          input.priority === "CRITICAL"
            ? NotificationSeverity.CRITICAL
            : input.priority === "HIGH"
              ? NotificationSeverity.WARNING
              : NotificationSeverity.INFO,
        actionUrl: "/ai-actions",
        metadata: {
          aiActionLogId: created.id,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          priority: input.priority,
          confidence: clamp01(input.confidence),
          requiresApproval: true,
        },
        dedupeKey: `AIActionApproval:${created.id}`,
      });
    } catch {
      // ignore (notification tables may not exist yet during bootstrap)
    }
  }

  return created;
}

export async function getAIActionLogById(id: string) {
  const delegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  if (!delegate) throw new Error("Prisma delegate for AIActionLog not found. Run prisma generate.");
  return await delegate.findUnique({ where: { id } });
}

export async function updateAIActionLog(id: string, data: Record<string, unknown>) {
  const delegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  if (!delegate) throw new Error("Prisma delegate for AIActionLog not found. Run prisma generate.");
  return await delegate.update({ where: { id }, data });
}

export async function listAIActionLogs(params?: { status?: AIActionStatus; take?: number }) {
  const delegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  if (!delegate) throw new Error("Prisma delegate for AIActionLog not found. Run prisma generate.");
  const take = params?.take ?? 200;
  return await delegate.findMany({
    where: params?.status ? { status: params.status } : undefined,
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}
