import "server-only";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ActivitySeverity, AuditAction, AuditSource, Prisma } from "@prisma/client";

type ActorInfo = {
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

async function getRequestInfo(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent");
    const ipRaw = h.get("x-forwarded-for") || h.get("x-real-ip") || null;
    const ipAddress = ipRaw ? ipRaw.split(",")[0]?.trim() || null : null;
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

const SENSITIVE_KEY = /(password|passphrase|secret|token|hash|salt|cookie|authorization|api[_-]?key)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 2000) return `${value.slice(0, 2000)}…`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    const limited = value.slice(0, 50).map((v) => sanitize(v, depth + 1));
    if (value.length > 50) limited.push(`[+${value.length - 50} more]`);
    return limited;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function diffTopLevel(before: unknown, after: unknown) {
  const b = isPlainObject(before) ? (before as Record<string, unknown>) : {};
  const a = isPlainObject(after) ? (after as Record<string, unknown>) : {};

  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changedKeys: string[] = [];
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};

  for (const k of keys) {
    const bv = b[k];
    const av = a[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      changedKeys.push(k);
      beforeDiff[k] = bv;
      afterDiff[k] = av;
    }
  }

  changedKeys.sort((x, y) => x.localeCompare(y));
  return { changedKeys, beforeDiff, afterDiff };
}

function severityForAction(action: AuditAction): ActivitySeverity {
  if (action === AuditAction.APPROVE || action === AuditAction.SIGN) return ActivitySeverity.IMPORTANT;
  if (action === AuditAction.REJECT || action === AuditAction.DELETE) return ActivitySeverity.WARNING;
  if (action === AuditAction.STATUS_CHANGE || action === AuditAction.SEND) return ActivitySeverity.IMPORTANT;
  return ActivitySeverity.INFO;
}

function titleForAudit(action: AuditAction, entityType: string): string {
  const t = entityType;
  switch (action) {
    case AuditAction.CREATE:
      return `${t} created`;
    case AuditAction.UPDATE:
      return `${t} updated`;
    case AuditAction.DELETE:
      return `${t} deleted`;
    case AuditAction.STATUS_CHANGE:
      return `${t} status changed`;
    case AuditAction.SEND:
      return `${t} sent`;
    case AuditAction.APPROVE:
      return `${t} approved`;
    case AuditAction.REJECT:
      return `${t} rejected`;
    case AuditAction.SIGN:
      return `${t} signed`;
    case AuditAction.LOGIN:
      return `Login`;
    case AuditAction.EXPORT:
      return `Export`;
    default:
      return `${t} activity`;
  }
}

export async function logAudit(params: {
  entityType: string;
  entityId: string;
  action: AuditAction;
  source: AuditSource;
  actor?: ActorInfo | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  // When provided, also create a mirrored ActivityEvent on Project entity for consolidated project timeline.
  projectIdForActivity?: string | null;
  relatedDocumentType?: string | null;
  relatedDocumentId?: string | null;
}) {
  const req = await getRequestInfo();

  const beforeSan = sanitize(params.before);
  const afterSan = sanitize(params.after);
  const metadataSan = sanitize(params.metadata);

  const diff = diffTopLevel(beforeSan, afterSan);

  const auditRow = await prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      source: params.source,
      actorName: params.actor?.name ?? null,
      actorEmail: params.actor?.email ?? null,
      actorRole: params.actor?.role ?? null,
      beforeJson: diff.changedKeys.length
        ? (diff.beforeDiff as Prisma.InputJsonValue)
        : undefined,
      afterJson: diff.changedKeys.length
        ? (diff.afterDiff as Prisma.InputJsonValue)
        : undefined,
      metadataJson: metadataSan ? (metadataSan as Prisma.InputJsonValue) : undefined,
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    },
    select: { id: true, createdAt: true },
  });

  const createdBy = params.actor?.name || params.actor?.email || null;
  const severity = severityForAction(params.action);
  const title = titleForAudit(params.action, params.entityType);
  const legacyLabel =
    isPlainObject(metadataSan) && isPlainObject((metadataSan as any).legacy)
      ? String((metadataSan as any).legacy.action ?? "")
      : "";
  const description =
    diff.changedKeys.length > 0
      ? `Changed: ${diff.changedKeys.join(", ")}`
      : legacyLabel.trim()
        ? `Action: ${legacyLabel.trim()}`
        : null;

  const activityMetadata = {
    auditLogId: auditRow.id,
    changedKeys: diff.changedKeys,
    source: params.source,
    ...((isPlainObject(metadataSan) ? (metadataSan as any) : { legacyMetadata: metadataSan }) as any),
  };

  // Primary entity activity
  await prisma.activityEvent.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      title,
      description,
      severity,
      relatedDocumentType: params.relatedDocumentType ?? null,
      relatedDocumentId: params.relatedDocumentId ?? null,
      createdBy,
      metadataJson: activityMetadata as Prisma.InputJsonValue,
      createdAt: auditRow.createdAt,
    },
  });

  // Mirrored project activity (for consolidated project timeline)
  const projectId = params.projectIdForActivity?.trim() ? params.projectIdForActivity.trim() : null;
  if (projectId && !(params.entityType === "Project" && params.entityId === projectId)) {
    await prisma.activityEvent.create({
      data: {
        entityType: "Project",
        entityId: projectId,
        title,
        description,
        severity,
        relatedDocumentType: params.relatedDocumentType ?? null,
        relatedDocumentId: params.relatedDocumentId ?? null,
        createdBy,
        metadataJson: {
          ...activityMetadata,
          mirroredFrom: { entityType: params.entityType, entityId: params.entityId },
        } as Prisma.InputJsonValue,
        createdAt: auditRow.createdAt,
      },
    });
  }

  return auditRow.id;
}

export async function logActivity(params: {
  entityType: string;
  entityId: string;
  title: string;
  description?: string | null;
  severity?: ActivitySeverity | null;
  relatedDocumentType?: string | null;
  relatedDocumentId?: string | null;
  createdBy?: string | null;
  metadata?: unknown;
  projectIdForMirror?: string | null;
}) {
  const metaSan = sanitize(params.metadata);
  const row = await prisma.activityEvent.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      title: params.title,
      description: params.description ?? null,
      severity: params.severity ?? ActivitySeverity.INFO,
      relatedDocumentType: params.relatedDocumentType ?? null,
      relatedDocumentId: params.relatedDocumentId ?? null,
      createdBy: params.createdBy ?? null,
      metadataJson: metaSan ? (metaSan as Prisma.InputJsonValue) : undefined,
    },
    select: { id: true, createdAt: true },
  });

  const projectId = params.projectIdForMirror?.trim() ? params.projectIdForMirror.trim() : null;
  if (projectId && !(params.entityType === "Project" && params.entityId === projectId)) {
    await prisma.activityEvent.create({
      data: {
        entityType: "Project",
        entityId: projectId,
        title: params.title,
        description: params.description ?? null,
        severity: params.severity ?? ActivitySeverity.INFO,
        relatedDocumentType: params.relatedDocumentType ?? null,
        relatedDocumentId: params.relatedDocumentId ?? null,
        createdBy: params.createdBy ?? null,
        metadataJson: {
          ...(isPlainObject(metaSan) ? (metaSan as any) : { legacyMetadata: metaSan }),
          mirroredFrom: { entityType: params.entityType, entityId: params.entityId },
        } as Prisma.InputJsonValue,
        createdAt: row.createdAt,
      },
    });
  }

  return row.id;
}
