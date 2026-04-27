import "server-only";

import { NotificationSeverity, Prisma, type Notification, type NotificationPreference } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const prismaAny = prisma as unknown as Record<string, any>;

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

function getNotificationDelegate() {
  const d = prismaAny.notification;
  if (!d) throw new Error("Prisma delegate for Notification not found. Run prisma generate.");
  return d as {
    create: (args: any) => Promise<Notification>;
    findUnique: (args: any) => Promise<Notification | null>;
    findMany: (args: any) => Promise<Notification[]>;
    count: (args: any) => Promise<number>;
    updateMany: (args: any) => Promise<{ count: number }>;
    findFirst: (args: any) => Promise<Notification | null>;
    update: (args: any) => Promise<Notification>;
  };
}

function getNotificationPreferenceDelegate() {
  const d = prismaAny.notificationPreference;
  if (!d) throw new Error("Prisma delegate for NotificationPreference not found. Run prisma generate.");
  return d as {
    findUnique: (args: any) => Promise<NotificationPreference | null>;
    create: (args: any) => Promise<NotificationPreference>;
    update: (args: any) => Promise<NotificationPreference>;
    upsert: (args: any) => Promise<NotificationPreference>;
  };
}

export type CreateNotificationInput = {
  userEmail: string;
  role?: string | null;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  // Optional explicit key to prevent duplicates during noisy workflows.
  dedupeKey?: string | null;
};

export type NotificationPreviewItem = Pick<
  Notification,
  "id" | "title" | "message" | "severity" | "isRead" | "actionUrl" | "createdAt" | "entityType" | "entityId"
>;

export async function ensureNotificationPreference(userEmail: string) {
  const prefDelegate = getNotificationPreferenceDelegate();
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) throw new Error("userEmail is required.");

  return await prefDelegate.upsert({
    where: { userEmail: normalized },
    create: {
      userEmail: normalized,
      enableInApp: true,
      enableEmail: false,
      enableWhatsApp: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    },
    update: {},
  });
}

function buildDedupeKey(input: CreateNotificationInput): string {
  const base = `${input.entityType}:${input.entityId}:${input.title.trim()}:${input.severity ?? "INFO"}`;
  return input.dedupeKey?.trim() ? input.dedupeKey.trim() : base;
}

export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const delegate = getNotificationDelegate();
  const now = new Date();

  const userEmail = input.userEmail.trim().toLowerCase();
  if (!userEmail) throw new Error("userEmail is required.");
  const title = input.title.trim();
  if (!title) throw new Error("title is required.");
  const message = input.message.trim();
  if (!message) throw new Error("message is required.");
  const entityType = input.entityType.trim();
  const entityId = input.entityId.trim();
  if (!entityType || !entityId) throw new Error("entityType/entityId are required.");

  const dedupeKey = buildDedupeKey({ ...input, userEmail });
  const since = new Date(now.getTime() - DEDUPE_WINDOW_MS);

  const existing = await delegate.findFirst({
    where: {
      userEmail,
      isRead: false,
      createdAt: { gte: since },
      metadataJson: {
        path: ["dedupeKey"],
        equals: dedupeKey,
      },
    },
    select: { id: true } as any,
  });

  if (existing?.id) {
    // Return the existing record to keep the UI stable.
    const found = await delegate.findUnique({ where: { id: existing.id } });
    if (found) return found;
  }

  return await delegate.create({
    data: {
      userEmail,
      role: input.role?.trim() ? input.role.trim() : null,
      entityType,
      entityId,
      title,
      message,
      severity: input.severity ?? NotificationSeverity.INFO,
      channel: "IN_APP",
      isRead: false,
      readAt: null,
      actionUrl: input.actionUrl?.trim() ? input.actionUrl.trim() : null,
      metadataJson: {
        ...(input.metadata ?? {}),
        dedupeKey,
      } as Prisma.InputJsonValue,
      createdAt: now,
    },
  });
}

export async function markNotificationAsRead(params: { user: SessionUser; id: string }) {
  const delegate = getNotificationDelegate();
  const id = params.id.trim();
  if (!id) throw new Error("id is required.");

  // Users can only mark their own inbox items.
  const updated = await delegate.updateMany({
    where: { id, userEmail: params.user.email },
    data: { isRead: true, readAt: new Date() },
  });

  if (updated.count === 0) {
    throw new Error("Notification not found.");
  }

  const row = await delegate.findUnique({ where: { id } });
  if (!row) throw new Error("Notification not found.");
  return row;
}

export async function markAllNotificationsAsRead(params: { user: SessionUser }) {
  const delegate = getNotificationDelegate();
  return await delegate.updateMany({
    where: { userEmail: params.user.email, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function getUserNotificationPreview(params: { user: SessionUser; take?: number }) {
  const delegate = getNotificationDelegate();
  const take = Math.max(1, Math.min(20, params.take ?? 5));

  const [unreadCount, items] = await Promise.all([
    delegate.count({ where: { userEmail: params.user.email, isRead: false } }),
    delegate.findMany({
      where: { userEmail: params.user.email },
      orderBy: [{ createdAt: "desc" }],
      take,
      select: {
        id: true,
        title: true,
        message: true,
        severity: true,
        isRead: true,
        actionUrl: true,
        createdAt: true,
        entityType: true,
        entityId: true,
      } as any,
    }),
  ]);

  return { unreadCount, items: items as NotificationPreviewItem[] };
}

export type GetUserNotificationsParams = {
  user: SessionUser;
  unreadOnly?: boolean;
  severity?: NotificationSeverity | null;
  take?: number;
  skip?: number;
};

export async function getUserNotifications(params: GetUserNotificationsParams) {
  const delegate = getNotificationDelegate();
  const take = Math.max(1, Math.min(100, params.take ?? 50));
  const skip = Math.max(0, params.skip ?? 0);

  const where: Record<string, unknown> = {
    userEmail: params.user.email,
  };

  if (params.unreadOnly) {
    where["isRead"] = false;
  }

  if (params.severity) {
    where["severity"] = params.severity;
  }

  const [total, items] = await Promise.all([
    delegate.count({ where }),
    delegate.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take,
      skip,
    }),
  ]);

  return { total, items };
}
