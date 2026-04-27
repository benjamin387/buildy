import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AuditAction, AuditSource } from "@prisma/client";
import { logAudit } from "@/lib/audit/logger";

export async function auditLog(params: {
  module: string;
  action: string;
  actorUserId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
}) {
  await prisma.auditEvent.create({
    data: {
      module: params.module,
      action: params.action,
      actorUserId: params.actorUserId ?? null,
      projectId: params.projectId ?? null,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  // New production-grade audit trail + activity timeline (best-effort, never breaks legacy flow).
  try {
    const entityId = params.entityId ?? null;
    if (!entityId) return;

    const actor =
      params.actorUserId
        ? await prisma.user
            .findUnique({
              where: { id: params.actorUserId },
              select: {
                name: true,
                email: true,
                roles: { select: { role: { select: { key: true } } } },
              },
            })
            .catch(() => null)
        : null;

    const roleKey = actor?.roles?.[0]?.role?.key ?? null;

    const action = mapLegacyAction(params.action);
    const source: AuditSource =
      params.module === "ai" ? AuditSource.AI : params.actorUserId ? AuditSource.USER : AuditSource.SYSTEM;

    await logAudit({
      entityType: params.entityType,
      entityId,
      action,
      source,
      actor: actor
        ? { name: actor.name ?? null, email: actor.email ?? null, role: roleKey }
        : null,
      before: null,
      after: null,
      metadata: {
        legacy: {
          module: params.module,
          action: params.action,
        },
        ...(isPlainObject(params.metadata) ? (params.metadata as any) : { legacyMetadata: params.metadata }),
      },
      projectIdForActivity: params.projectId ?? null,
      relatedDocumentType: params.entityType ?? null,
      relatedDocumentId: entityId,
    });
  } catch {
    // ignore
  }
}

function mapLegacyAction(action: string): AuditAction {
  const a = action.toLowerCase();
  if (a.includes("create") || a.includes("created")) return AuditAction.CREATE;
  if (a.includes("delete") || a.includes("removed")) return AuditAction.DELETE;
  if (a.includes("status")) return AuditAction.STATUS_CHANGE;
  if (a.includes("send") || a.includes("sent")) return AuditAction.SEND;
  if (a.includes("approve") || a.includes("approved")) return AuditAction.APPROVE;
  if (a.includes("reject") || a.includes("rejected")) return AuditAction.REJECT;
  if (a.includes("sign") || a.includes("signed")) return AuditAction.SIGN;
  if (a.includes("login") || a.includes("signin")) return AuditAction.LOGIN;
  if (a.includes("export")) return AuditAction.EXPORT;
  return AuditAction.UPDATE;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

export async function createRevision(params: {
  entityType: string;
  entityId: string;
  data: unknown;
  projectId?: string | null;
  actorUserId?: string | null;
  note?: string | null;
}) {
  const last = await prisma.entityRevision.findFirst({
    where: { entityType: params.entityType, entityId: params.entityId },
    orderBy: { revision: "desc" },
    select: { revision: true },
  });

  const nextRevision = (last?.revision ?? 0) + 1;

  return await prisma.entityRevision.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      revision: nextRevision,
      data: params.data as Prisma.InputJsonValue,
      projectId: params.projectId ?? null,
      actorUserId: params.actorUserId ?? null,
      note: params.note ?? null,
    },
  });
}
