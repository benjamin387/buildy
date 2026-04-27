import "server-only";

import { NotificationSeverity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureNotificationPreference, createNotification } from "@/lib/notifications/service";
import { sendEmailMessage, sendWhatsAppMessage } from "@/lib/messaging/send-service";

const prismaAny = prisma as unknown as Record<string, any>;

export type DispatchNotificationInput = {
  // Targets
  userEmails?: string[] | null;
  roleKeys?: string[] | null;
  // Payload
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
};

type Recipient = {
  email: string;
  whatsappNumber: string | null;
};

function getUserDelegate() {
  const d = prismaAny.user;
  if (!d) throw new Error("Prisma delegate for User not found. Run prisma generate.");
  return d as {
    findMany: (args: any) => Promise<Array<{ email: string; whatsappNumber: string | null }>>;
  };
}

function isCritical(sev: NotificationSeverity) {
  return sev === NotificationSeverity.CRITICAL;
}

function parseHHmm(s: string | null | undefined): { h: number; m: number } | null {
  const raw = (s ?? "").trim();
  if (!raw) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  return { h, m };
}

function isInQuietHours(params: { start: string | null; end: string | null; now: Date }) {
  const start = parseHHmm(params.start);
  const end = parseHHmm(params.end);
  if (!start || !end) return false;

  const minutesNow = params.now.getHours() * 60 + params.now.getMinutes();
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  // Same-day window (e.g. 22:00 -> 23:00)
  if (startMin < endMin) {
    return minutesNow >= startMin && minutesNow < endMin;
  }

  // Wrap-around (e.g. 22:00 -> 08:00)
  return minutesNow >= startMin || minutesNow < endMin;
}

async function resolveRecipients(input: DispatchNotificationInput): Promise<Recipient[]> {
  const direct = (input.userEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const roles = (input.roleKeys ?? []).map((r) => r.trim()).filter(Boolean);

  const emails = new Set<string>(direct);
  const userDelegate = getUserDelegate();

  if (roles.length) {
    const rows = await userDelegate.findMany({
      where: {
        status: "ACTIVE",
        roles: {
          some: {
            role: { key: { in: roles } },
          },
        },
      },
      select: {
        email: true,
        whatsappNumber: true,
      },
    });
    for (const r of rows) {
      if (r.email) emails.add(String(r.email).trim().toLowerCase());
    }
  }

  if (emails.size === 0) return [];

  const recipients = await userDelegate.findMany({
    where: { email: { in: Array.from(emails) } },
    select: { email: true, whatsappNumber: true },
  });

  return recipients.map((r) => ({
    email: String(r.email).trim().toLowerCase(),
    whatsappNumber: r.whatsappNumber ?? null,
  }));
}

export async function dispatchNotification(input: DispatchNotificationInput) {
  const now = new Date();
  const severity = input.severity ?? NotificationSeverity.INFO;

  const recipients = await resolveRecipients(input);
  if (recipients.length === 0) return { created: 0, emailed: 0, whatsapped: 0 };

  const results = await Promise.all(
    recipients.map(async (recipient) => {
      const pref = await ensureNotificationPreference(recipient.email);
      let created = 0;
      let emailed = 0;
      let whatsapped = 0;

      // Always create IN_APP notification unless explicitly disabled.
      if (pref.enableInApp) {
        await createNotification({
          userEmail: recipient.email,
          role: null,
          entityType: input.entityType,
          entityId: input.entityId,
          title: input.title,
          message: input.message,
          severity,
          actionUrl: input.actionUrl ?? null,
          metadata: input.metadata ?? null,
          dedupeKey: input.dedupeKey ?? null,
        });
        created = 1;
      }

      const quiet = isInQuietHours({ start: pref.quietHoursStart, end: pref.quietHoursEnd, now });
      const allowExternal = !quiet || isCritical(severity);

      if (allowExternal && pref.enableEmail) {
        const subject = `[Buildy] ${input.title}`.slice(0, 140);
        const body = input.actionUrl ? `${input.message}\n\nOpen: ${input.actionUrl}` : input.message;
        try {
          await sendEmailMessage({
            to: recipient.email,
            toName: recipient.email,
            subject,
            text: body,
          });
          emailed = 1;
        } catch {
          // Best-effort; in-app is the source of truth.
        }
      }

      if (allowExternal && pref.enableWhatsApp && recipient.whatsappNumber) {
        const body =
          input.actionUrl
            ? `${input.title}\n\n${input.message}\n\n${input.actionUrl}`
            : `${input.title}\n\n${input.message}`;
        try {
          await sendWhatsAppMessage({ to: recipient.whatsappNumber, body });
          whatsapped = 1;
        } catch {
          // Best-effort; in-app is the source of truth.
        }
      }

      return { created, emailed, whatsapped };
    }),
  );

  return results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      emailed: acc.emailed + r.emailed,
      whatsapped: acc.whatsapped + r.whatsapped,
    }),
    { created: 0, emailed: 0, whatsapped: 0 },
  );
}
