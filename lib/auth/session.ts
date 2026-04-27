import "server-only";

import crypto from "node:crypto";
import { cache } from "react";
import { AuditAction, AuditSource, Prisma, type AuthAuditAction, type Permission, type User } from "@prisma/client";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import { getPrimaryRoleKey, getRoleLabel } from "@/lib/rbac/permissions";
import { verifyPassword } from "@/lib/security/password";

export const SESSION_COOKIE_NAME = "app_session";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
const FAILED_LOGIN_MAX = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_LOCK_MS = 15 * 60 * 1000;

type SessionUserRecord = Prisma.UserGetPayload<{
  // IMPORTANT: do not include lead-channel fields here.
  // We fetch `mobileNumber/whatsappNumber/telegramChatId/canSubmitLeads` via raw SQL
  // to avoid PrismaClientValidationError when Prisma Client is stale in dev.
  select: {
    id: true;
    email: true;
    name: true;
    status: true;
    roles: {
      select: {
        role: {
          select: {
            key: true;
            name: true;
            permissions: true;
          };
        };
      };
    };
  };
}>;

type SessionRecord = Prisma.SessionGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        name: true;
        status: true;
        roles: {
          select: {
            role: {
              select: {
                key: true;
                name: true;
                permissions: true;
              };
            };
          };
        };
      };
    };
  };
}>;

type RequestMetadata = {
  ipAddress: string;
  userAgent: string | null;
};

type SessionUserChannelFields = {
  mobileNumber: string | null;
  whatsappNumber: string | null;
  telegramChatId: string | null;
  canSubmitLeads: boolean;
};

type SessionUserWithChannels = SessionUserRecord & SessionUserChannelFields;

export type SessionUser = Pick<User, "id" | "email" | "name" | "status"> & {
  mobileNumber: string | null;
  whatsappNumber: string | null;
  telegramChatId: string | null;
  canSubmitLeads: boolean;
  roleKeys: string[];
  roleNames: string[];
  permissions: Permission[];
  primaryRoleKey: string | null;
  primaryRoleLabel: string;
  isAdmin: boolean;
};

export type AuthenticatedSession = {
  session: Pick<
    SessionRecord,
    "id" | "createdAt" | "lastSeenAt" | "expiresAt" | "ipAddress" | "userAgent"
  >;
  user: SessionUser;
};

export type AuthenticationResult =
  | {
      ok: true;
      user: SessionUser;
    }
  | {
      ok: false;
      reason: "INVALID_CREDENTIALS" | "LOCKED_OUT";
    };

export class SessionAccessError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "SessionAccessError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function getSessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

async function getRequestMetadata(): Promise<RequestMetadata> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const ipAddress =
    forwardedFor?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    "unknown";

  return {
    ipAddress,
    userAgent: headerStore.get("user-agent"),
  };
}

async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

function buildSessionUser(user: SessionUserRecord): SessionUser {
  const roleKeys = user.roles.map((entry) => entry.role.key);
  const roleNames = user.roles.map((entry) => entry.role.name);
  const permissions = Array.from(
    new Set(user.roles.flatMap((entry) => entry.role.permissions)),
  );
  const primaryRoleKey = getPrimaryRoleKey(roleKeys);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    // These fields are attached by our session/user loaders (raw SQL) to remain
    // resilient when Prisma Client is stale in dev.
    mobileNumber: (user as SessionUserWithChannels).mobileNumber ?? null,
    whatsappNumber: (user as SessionUserWithChannels).whatsappNumber ?? null,
    telegramChatId: (user as SessionUserWithChannels).telegramChatId ?? null,
    canSubmitLeads: Boolean((user as SessionUserWithChannels).canSubmitLeads),
    roleKeys,
    roleNames,
    permissions,
    primaryRoleKey,
    primaryRoleLabel: getRoleLabel(primaryRoleKey),
    isAdmin: roleKeys.includes("ADMIN"),
  };
}

async function findSessionByToken(input: {
  sessionToken: string;
  includeUser: boolean;
}): Promise<SessionRecord | (Pick<SessionRecord, "id" | "userId" | "revokedAt" | "expiresAt"> & { user?: { id: string; email: string } | null }) | null> {
  // Avoid Prisma `where: { sessionToken }` selectors because they hard-fail if Prisma Client
  // is stale (common in dev without restarting after `prisma generate`).
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; userId: string; revokedAt: Date | null; expiresAt: Date }>>(
      Prisma.sql`SELECT "id", "userId", "revokedAt", "expiresAt" FROM "Session" WHERE "sessionToken" = ${input.sessionToken} LIMIT 1`,
    );

    const row = rows[0];
    if (!row?.id) return null;

    if (!input.includeUser) {
      // Minimal shape for logout flow.
      return {
        id: row.id,
        userId: row.userId,
        revokedAt: row.revokedAt,
        expiresAt: row.expiresAt,
        user: null,
      };
    }

    const session = await prisma.session.findUnique({
      where: { id: row.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            roles: {
              select: {
                role: {
                  select: {
                    key: true,
                    name: true,
                    permissions: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) return null;

    const channelFields =
      (await prisma
        .$queryRaw<Array<SessionUserChannelFields>>(
          Prisma.sql`
            SELECT
              "mobileNumber",
              "whatsappNumber",
              "telegramChatId",
              COALESCE("canSubmitLeads", true) AS "canSubmitLeads"
            FROM "User"
            WHERE "id" = ${session.userId}
            LIMIT 1
          `,
        )
        .catch(() => [])) ?? [];

    const channels = channelFields[0] ?? {
      mobileNumber: null,
      whatsappNumber: null,
      telegramChatId: null,
      canSubmitLeads: true,
    };

    return {
      ...session,
      user: {
        ...session.user,
        ...channels,
      },
    } as unknown as SessionRecord;
  } catch {
    return null;
  }
}

async function createAuthAuditLog(params: {
  userId?: string | null;
  emailAttempted: string;
  action: AuthAuditAction;
  reason?: string | null;
}) {
  const metadata = await getRequestMetadata();

  await prisma.authAuditLog.create({
    data: {
      userId: params.userId ?? null,
      emailAttempted: params.emailAttempted,
      action: params.action,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      reason: params.reason ?? null,
    },
  });

  // Mirror into the global AuditLog/ActivityEvent layer (best-effort).
  try {
    const actor =
      params.userId
        ? await prisma.user
            .findUnique({
              where: { id: params.userId },
              select: {
                name: true,
                email: true,
                roles: { select: { role: { select: { key: true } } } },
              },
            })
            .catch(() => null)
        : null;

    const actorRole = actor?.roles?.[0]?.role?.key ?? null;

    await logAudit({
      entityType: "Auth",
      entityId: params.userId ?? params.emailAttempted,
      action: AuditAction.LOGIN,
      source: AuditSource.SYSTEM,
      actor: actor
        ? { name: actor.name ?? null, email: actor.email ?? null, role: actorRole }
        : { name: null, email: params.emailAttempted, role: null },
      before: null,
      after: null,
      metadata: {
        authAction: params.action,
        emailAttempted: params.emailAttempted,
        reason: params.reason ?? null,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
  } catch {
    // ignore
  }
}

async function getLoginAttemptKey(email: string) {
  const metadata = await getRequestMetadata();

  return {
    email: normalizeEmail(email),
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  };
}

async function resetLoginAttempt(email: string) {
  const { email: normalizedEmail, ipAddress } = await getLoginAttemptKey(email);

  await prisma.loginAttempt.deleteMany({
    where: {
      email: normalizedEmail,
      ipAddress,
    },
  });
}

async function getCurrentLoginAttempt(email: string) {
  const { email: normalizedEmail, ipAddress } = await getLoginAttemptKey(email);

  return prisma.loginAttempt.findUnique({
    where: {
      email_ipAddress: {
        email: normalizedEmail,
        ipAddress,
      },
    },
  });
}

async function registerFailedLogin(params: {
  email: string;
  userId?: string | null;
  reason: "INVALID_CREDENTIALS" | "LOCKED_OUT";
}) {
  const now = new Date();
  const { email, ipAddress } = await getLoginAttemptKey(params.email);
  const existing = await prisma.loginAttempt.findUnique({
    where: {
      email_ipAddress: {
        email,
        ipAddress,
      },
    },
  });

  const activeLock =
    existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime()
      ? existing.lockedUntil
      : null;

  if (params.reason === "LOCKED_OUT" && existing && activeLock) {
    await prisma.loginAttempt.update({
      where: {
        email_ipAddress: {
          email,
          ipAddress,
        },
      },
      data: {
        failedCount: existing.failedCount,
        lockedUntil: activeLock,
        lastFailedAt: now,
      },
    });

    await createAuthAuditLog({
      userId: params.userId,
      emailAttempted: email,
      action: "LOGIN_FAILED",
      reason: params.reason,
    });

    return;
  }

  const withinWindow =
    existing && now.getTime() - existing.lastFailedAt.getTime() <= FAILED_LOGIN_WINDOW_MS;
  const nextFailedCount = withinWindow ? existing.failedCount + 1 : 1;
  const lockedUntil =
    nextFailedCount >= FAILED_LOGIN_MAX
      ? new Date(now.getTime() + FAILED_LOGIN_LOCK_MS)
      : null;

  await prisma.loginAttempt.upsert({
    where: {
      email_ipAddress: {
        email,
        ipAddress,
      },
    },
    create: {
      email,
      ipAddress,
      failedCount: nextFailedCount,
      lockedUntil,
      lastFailedAt: now,
    },
    update: {
      failedCount: nextFailedCount,
      lockedUntil,
      lastFailedAt: now,
    },
  });

  await createAuthAuditLog({
    userId: params.userId,
    emailAttempted: email,
    action: "LOGIN_FAILED",
    reason: params.reason,
  });
}

async function ensureLoginNotLocked(email: string): Promise<boolean> {
  const attempt = await getCurrentLoginAttempt(email);
  return !!attempt?.lockedUntil && attempt.lockedUntil.getTime() > Date.now();
}

async function touchSession(session: SessionRecord): Promise<SessionRecord> {
  if (Date.now() - session.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) {
    return session;
  }

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
    select: { lastSeenAt: true },
  });

  return {
    ...session,
    lastSeenAt: updated.lastSeenAt,
  };
}

const getCachedAuthenticatedSession = cache(
  async (sessionToken: string | undefined): Promise<AuthenticatedSession | null> => {
    if (!sessionToken) {
      return null;
    }

    const session = (await findSessionByToken({
      sessionToken,
      includeUser: true,
    })) as SessionRecord | null;

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    if (!session.user || session.user.status !== "ACTIVE") {
      return null;
    }

    const freshSession = await touchSession(session);

    return {
      session: {
        id: freshSession.id,
        createdAt: freshSession.createdAt,
        lastSeenAt: freshSession.lastSeenAt,
        expiresAt: freshSession.expiresAt,
        ipAddress: freshSession.ipAddress,
        userAgent: freshSession.userAgent,
      },
      user: buildSessionUser(freshSession.user),
    };
  },
);

export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const sessionToken = await getSessionToken();
  return getCachedAuthenticatedSession(sessionToken);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuthenticatedSession();
  return session?.user ?? null;
}

export async function requireAuthenticatedSession(): Promise<AuthenticatedSession> {
  const session = await getAuthenticatedSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireUser(): Promise<SessionUser> {
  const session = await requireAuthenticatedSession();
  return session.user;
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

export async function createSession(userId: string): Promise<AuthenticatedSession> {
  const sessionToken = createSessionToken();
  const metadata = await getRequestMetadata();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await prisma.session.create({
    data: {
      sessionToken,
      userId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      expiresAt,
    },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
    },
  });

  const baseUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      roles: {
        select: {
          role: {
            select: {
              key: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
    },
  });
  if (!baseUser || baseUser.status !== "ACTIVE") {
    throw new Error("Unauthorized");
  }

  const channelFields =
    (await prisma
      .$queryRaw<Array<SessionUserChannelFields>>(
        Prisma.sql`
          SELECT
            "mobileNumber",
            "whatsappNumber",
            "telegramChatId",
            COALESCE("canSubmitLeads", true) AS "canSubmitLeads"
          FROM "User"
          WHERE "id" = ${userId}
          LIMIT 1
        `,
      )
      .catch(() => [])) ?? [];
  const channels = channelFields[0] ?? {
    mobileNumber: null,
    whatsappNumber: null,
    telegramChatId: null,
    canSubmitLeads: true,
  };

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions(expiresAt),
  );

  return {
    session: {
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    },
    user: buildSessionUser({ ...baseUser, ...channels } as unknown as SessionUserRecord),
  };
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    const session = await findSessionByToken({ sessionToken, includeUser: false });

    if (session && !session.revokedAt) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      await createAuthAuditLog({
        userId: session.userId,
        // Best-effort; user email isn't required to revoke the session.
        emailAttempted: session.user?.email ?? "",
        action: "LOGOUT",
        reason: "USER_LOGOUT",
      });
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function authenticateUser(params: {
  email: string;
  password: string;
}): Promise<AuthenticationResult> {
  const email = normalizeEmail(params.email);

  if (await ensureLoginNotLocked(email)) {
    await registerFailedLogin({
      email,
      reason: "LOCKED_OUT",
    });

    return {
      ok: false,
      reason: "LOCKED_OUT",
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      passwordHash: true,
      passwordSalt: true,
      roles: {
        select: {
          role: {
            select: {
              key: true,
              name: true,
              permissions: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") {
    await registerFailedLogin({
      email,
      userId: user?.id,
      reason: "INVALID_CREDENTIALS",
    });

    return {
      ok: false,
      reason: "INVALID_CREDENTIALS",
    };
  }

  const isValid = await verifyPassword({
    password: params.password,
    hashBase64: user.passwordHash,
    saltBase64: user.passwordSalt,
  });

  if (!isValid) {
    await registerFailedLogin({
      email,
      userId: user.id,
      reason: "INVALID_CREDENTIALS",
    });

    return {
      ok: false,
      reason: "INVALID_CREDENTIALS",
    };
  }

  const channelFields =
    (await prisma
      .$queryRaw<Array<SessionUserChannelFields>>(
        Prisma.sql`
          SELECT
            "mobileNumber",
            "whatsappNumber",
            "telegramChatId",
            COALESCE("canSubmitLeads", true) AS "canSubmitLeads"
          FROM "User"
          WHERE "id" = ${user.id}
          LIMIT 1
        `,
      )
      .catch(() => [])) ?? [];
  const channels = channelFields[0] ?? {
    mobileNumber: null,
    whatsappNumber: null,
    telegramChatId: null,
    canSubmitLeads: true,
  };

  await resetLoginAttempt(email);

  return {
    ok: true,
    user: buildSessionUser({ ...user, ...channels } as unknown as SessionUserRecord),
  };
}

export async function recordLoginSuccess(user: SessionUser): Promise<void> {
  await createAuthAuditLog({
    userId: user.id,
    emailAttempted: user.email,
    action: "LOGIN_SUCCESS",
    reason: "PASSWORD_LOGIN",
  });
}

export async function listActiveSessionsForUser(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      userAgent: true,
      ipAddress: true,
      expiresAt: true,
    },
  });
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  const currentSession = await requireAuthenticatedSession();

  if (currentSession.session.id === sessionId) {
    throw new SessionAccessError("Cannot revoke the current session.");
  }

  const targetSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!targetSession) {
    throw new Error("Session not found.");
  }

  if (!currentSession.user.isAdmin && targetSession.userId !== currentSession.user.id) {
    throw new SessionAccessError();
  }

  if (!targetSession.revokedAt) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    await createAuthAuditLog({
      userId: currentSession.user.id,
      emailAttempted: targetSession.user?.email ?? currentSession.user.email,
      action: "SESSION_REVOKED",
      reason: "MANUAL_REVOCATION",
    });
  }
}

export async function revokeOtherSessionsForUser(params: {
  userId: string;
  currentSessionId: string;
  emailAttempted: string;
  reason: string;
}) {
  const sessions = await prisma.session.findMany({
    where: {
      userId: params.userId,
      revokedAt: null,
      id: {
        not: params.currentSessionId,
      },
    },
    select: {
      id: true,
    },
  });

  if (sessions.length === 0) {
    return 0;
  }

  const sessionIds = sessions.map((session) => session.id);

  await prisma.session.updateMany({
    where: {
      id: {
        in: sessionIds,
      },
    },
    data: {
      revokedAt: new Date(),
    },
  });

  await Promise.all(
    sessionIds.map(() =>
      createAuthAuditLog({
        userId: params.userId,
        emailAttempted: params.emailAttempted,
        action: "SESSION_REVOKED",
        reason: params.reason,
      }),
    ),
  );

  return sessionIds.length;
}
