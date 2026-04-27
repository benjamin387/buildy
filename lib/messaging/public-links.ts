import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PublicDocumentType } from "@prisma/client";

function getPublicBaseUrl(): string {
  const value = process.env.PUBLIC_APP_URL?.trim();
  if (value) return value.replaceAll(/\/+$/g, "");
  return "http://localhost:3000";
}

export function buildPublicDocumentUrl(token: string): string {
  return `${getPublicBaseUrl()}/public/documents/${token}`;
}

export function buildPublicUrlForDocument(params: { documentType: PublicDocumentType; token: string }): string {
  if (params.documentType === "VARIATION_ORDER") {
    return `${getPublicBaseUrl()}/public/variations/${params.token}`;
  }
  return buildPublicDocumentUrl(params.token);
}

function generateToken(): string {
  // 192-bit token; URL safe.
  return crypto.randomBytes(24).toString("base64url");
}

export async function createPublicDocumentLink(params: {
  projectId?: string | null;
  documentType: PublicDocumentType;
  documentId: string;
  expiresInDays?: number | null;
}) {
  const now = new Date();
  const token = generateToken();
  const expiresAt =
    params.expiresInDays && params.expiresInDays > 0
      ? new Date(now.getTime() + params.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const link = await prisma.publicDocumentLink.create({
    data: {
      projectId: params.projectId ?? null,
      documentType: params.documentType,
      documentId: params.documentId,
      token,
      expiresAt,
      isActive: true,
    },
  });

  return {
    id: link.id,
    token: link.token,
    url: buildPublicUrlForDocument({ documentType: link.documentType, token: link.token }),
    expiresAt: link.expiresAt,
  };
}

export async function getActivePublicLinkByToken(token: string) {
  const link = await prisma.publicDocumentLink.findUnique({ where: { token } });
  if (!link) return null;
  if (!link.isActive) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  return link;
}

export async function markPublicLinkViewed(linkId: string) {
  const now = new Date();
  const link = await prisma.publicDocumentLink.update({
    where: { id: linkId },
    data: { viewedAt: now },
  });

  // Best-effort: if a link was created as part of an outbound message, mark that message as viewed too.
  await prisma.outboundMessage.updateMany({
    where: { publicDocumentLinkId: link.id, viewedAt: null },
    data: { viewedAt: now },
  });

  return link;
}
