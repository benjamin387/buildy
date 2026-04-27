import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/messaging/email";
import { buildPublicDocumentUrl } from "@/lib/messaging/public-links";

function getBaseUrl(): string {
  const value = process.env.PUBLIC_APP_URL?.trim();
  if (value) return value.replaceAll(/\/+$/g, "");
  return "http://localhost:3000";
}

export function buildClientAccessUrl(token: string): string {
  return `${getBaseUrl()}/client/access/${token}`;
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function findActivePortalAccountByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return prisma.clientPortalAccount.findUnique({ where: { email: normalized } });
}

export async function createPortalToken(params: {
  accountId: string;
  expiresInMinutes: number;
}) {
  const now = new Date();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + params.expiresInMinutes * 60 * 1000);

  const row = await prisma.clientPortalToken.create({
    data: {
      accountId: params.accountId,
      token,
      expiresAt,
    },
  });

  return { token: row.token, expiresAt: row.expiresAt, url: buildClientAccessUrl(row.token) };
}

export async function consumePortalToken(token: string) {
  const row = await prisma.clientPortalToken.findUnique({
    where: { token },
    include: { account: true },
  });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  if (!row.account.isActive) return null;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.clientPortalToken.update({
      where: { id: row.id },
      data: { usedAt: now },
    });
    await tx.clientPortalAccount.update({
      where: { id: row.accountId },
      data: { lastLoginAt: now },
    });
  });

  return { accountId: row.accountId };
}

export async function sendPortalMagicLinkEmail(params: {
  to: string;
  toName: string;
  url: string;
  expiresAt: Date;
}) {
  const subject = "Your project portal access link";
  const text =
    `Dear ${params.toName},\n\n` +
    `Use the secure link below to access your project portal:\n` +
    `${params.url}\n\n` +
    `This link expires on: ${params.expiresAt.toISOString()}\n\n` +
    `If you did not request this, please ignore this email.\n`;

  return sendEmail({
    to: params.to,
    toName: params.toName,
    subject,
    text,
    html: null,
  });
}

export async function requirePortalProjectAccess(params: { accountId: string; projectId: string }) {
  const account = await prisma.clientPortalAccount.findUnique({
    where: { id: params.accountId },
  });
  if (!account || !account.isActive) return null;

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, clientId: true, name: true, siteAddress: true, addressLine1: true, status: true },
  });
  if (!project) return null;

  const allowed =
    (account.projectId && account.projectId === project.id) ||
    (account.clientId && account.clientId === project.clientId);
  if (!allowed) return null;

  return { account, project };
}

export async function listAccessibleProjects(accountId: string) {
  const account = await prisma.clientPortalAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) return [];

  if (account.projectId) {
    const p = await prisma.project.findUnique({
      where: { id: account.projectId },
      select: { id: true, name: true, siteAddress: true, addressLine1: true, status: true },
    });
    return p ? [p] : [];
  }

  if (account.clientId) {
    return prisma.project.findMany({
      where: { clientId: account.clientId },
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, name: true, siteAddress: true, addressLine1: true, status: true },
      take: 100,
    });
  }

  return [];
}

export async function createOrUpdateProjectPortalAccount(params: {
  projectId: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string | null;
}) {
  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required.");

  return prisma.clientPortalAccount.upsert({
    where: { email },
    create: {
      clientId: params.clientId,
      projectId: params.projectId,
      name: params.name.trim(),
      email,
      phone: params.phone?.trim() || null,
      isActive: true,
    },
    update: {
      clientId: params.clientId,
      projectId: params.projectId,
      name: params.name.trim(),
      phone: params.phone?.trim() || null,
      isActive: true,
    },
  });
}

export async function createClientPortalMessage(params: {
  projectId: string;
  accountId: string;
  subject: string;
  message: string;
}) {
  const subject = params.subject.trim();
  const message = params.message.trim();
  if (!subject) throw new Error("Subject is required.");
  if (!message) throw new Error("Message is required.");

  const created = await prisma.clientPortalMessage.create({
    data: {
      projectId: params.projectId,
      accountId: params.accountId,
      subject,
      message,
      status: "NEW",
    },
  });

  // Also log to project comms for internal visibility (no costs, client-safe content only).
  await prisma.projectCommunicationLog.create({
    data: {
      projectId: params.projectId,
      channel: "OTHER",
      direction: "INBOUND",
      subject,
      body: message,
      participants: `client_portal:${params.accountId}`,
      occurredAt: new Date(),
      metadata: { clientPortalMessageId: created.id },
    },
  });

  return created;
}

export async function markClientPortalMessageStatus(params: { messageId: string; status: "READ" | "RESOLVED" | "ARCHIVED" }) {
  return prisma.clientPortalMessage.update({
    where: { id: params.messageId },
    data: { status: params.status },
  });
}

// Convenience: build a public document preview link (not used for auth; just for reuse).
export function buildPublicDocumentPreviewUrl(token: string) {
  return buildPublicDocumentUrl(token);
}
