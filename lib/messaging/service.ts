import { prisma } from "@/lib/prisma";
import { Prisma, type MessageChannel, type MessageRelatedType, type PublicDocumentType } from "@prisma/client";
import { buildPublicUrlForDocument, createPublicDocumentLink } from "@/lib/messaging/public-links";
import { ensureDefaultMessageTemplates } from "@/lib/messaging/templates";
import { sendEmail } from "@/lib/messaging/email";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type SendOutboundMessageParams = {
  projectId?: string | null;
  relatedType: MessageRelatedType;
  relatedId: string;
  channel: MessageChannel;
  recipientName: string;
  recipientAddress: string;
  subject?: string | null;
  body: string;
  includeSecureLink: boolean;
  includePdfAttachment: boolean;
  linkExpiresInDays?: number | null;
  documentType: PublicDocumentType;
  documentId: string;
};

export async function listOutboundMessagesForEntity(params: {
  relatedType: MessageRelatedType;
  relatedId: string;
  take?: number;
}) {
  const take = params.take ?? 25;
  const messages = await prisma.outboundMessage.findMany({
    where: { relatedType: params.relatedType, relatedId: params.relatedId },
    orderBy: [{ createdAt: "desc" }],
    take,
    include: { attachments: true, publicDocumentLink: { select: { expiresAt: true, viewedAt: true } } },
  });

  // Do not expose tokens/URLs to the client; keep attachment metadata only.
  return messages.map((m) => ({
    ...m,
    publicDocumentLink: m.publicDocumentLink,
    attachments: m.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      documentType: a.documentType,
      documentId: a.documentId,
      createdAt: a.createdAt,
    })),
  }));
}

export async function createOutboundMessageDraft(params: SendOutboundMessageParams) {
  await ensureDefaultMessageTemplates();

  const now = new Date();
  const recipientName = params.recipientName.trim();
  const recipientAddress = params.recipientAddress.trim();
  const subject = params.subject?.trim() ? params.subject.trim() : null;
  const body = params.body.trim();

  let publicLinkUrl: string | null = null;
  let publicLinkId: string | null = null;
  const mustCreateLink = Boolean(params.includeSecureLink || params.includePdfAttachment);
  if (mustCreateLink) {
    const link = await createPublicDocumentLink({
      projectId: params.projectId ?? null,
      documentType: params.documentType,
      documentId: params.documentId,
      expiresInDays: params.linkExpiresInDays ?? null,
    });
    publicLinkUrl = link.url;
    publicLinkId = link.id;
  }

  const auditBody =
    publicLinkUrl
      ? body.includes("[generated]")
        ? body
        : `${body}\n\nSecure link: [generated]`
      : body;

  const message = await prisma.outboundMessage.create({
    data: {
      projectId: params.projectId ?? null,
      relatedType: params.relatedType,
      relatedId: params.relatedId,
      channel: params.channel,
      publicDocumentLinkId: publicLinkId,
      recipientName,
      recipientAddress,
      subject,
      body: auditBody,
      status: "DRAFT",
      sentAt: null,
      providerMessageId: null,
    },
  });

  if (params.includePdfAttachment && publicLinkUrl) {
    await prisma.messageAttachment.create({
      data: {
        messageId: message.id,
        fileName: `${params.documentType}_${params.documentId}.pdf`,
        fileUrl: publicLinkUrl,
        documentType: params.documentType,
        documentId: params.documentId,
      },
    });
  }

  return { messageId: message.id, status: "DRAFT" as const };
}

export async function sendExistingOutboundMessage(params: { messageId: string }) {
  await ensureDefaultMessageTemplates();

  const now = new Date();
  const message = await prisma.outboundMessage.findUnique({
    where: { id: params.messageId },
    include: {
      attachments: true,
      publicDocumentLink: true,
      project: { select: { id: true } },
    },
  });
  if (!message) throw new Error("Outbound message not found.");

  if (message.channel === "LINK") {
    // Link-only messages are already "sent" at creation time.
    return { messageId: message.id, status: message.status, providerMessageId: message.providerMessageId ?? "LINK" };
  }

  if (message.status === "SENT" || message.status === "CANCELLED") {
    return { messageId: message.id, status: message.status, providerMessageId: message.providerMessageId ?? null };
  }

  let publicLinkUrl: string | null = null;
  let publicLinkId: string | null = message.publicDocumentLinkId ?? null;
  if (publicLinkId) {
    // Do not expose token to clients; resolve URL server-side.
    const linkRow = await prisma.publicDocumentLink.findUnique({
      where: { id: publicLinkId },
      select: { token: true, isActive: true, expiresAt: true, documentType: true, documentId: true, projectId: true },
    });

    const isExpired = Boolean(linkRow?.expiresAt && linkRow.expiresAt.getTime() < Date.now());
    const canUse = Boolean(linkRow && linkRow.isActive && !isExpired);

    if (linkRow && canUse) {
      publicLinkUrl = buildPublicUrlForDocument({ documentType: linkRow.documentType, token: linkRow.token });
    } else if (linkRow) {
      // Re-issue a new link if the old link is expired or inactive.
      const reissued = await createPublicDocumentLink({
        projectId: linkRow.projectId ?? null,
        documentType: linkRow.documentType,
        documentId: linkRow.documentId,
        expiresInDays: 14,
      });
      publicLinkUrl = reissued.url;
      publicLinkId = reissued.id;
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: { publicDocumentLinkId: publicLinkId },
      });
    }
  }

  let sendBody = message.body;
  if (publicLinkUrl) {
    sendBody = sendBody.includes("[generated]")
      ? sendBody.replaceAll("[generated]", publicLinkUrl)
      : `${sendBody}\n\nSecure link: ${publicLinkUrl}`;
  }

  try {
    const providerMessageId =
      message.channel === "EMAIL"
        ? (
            await sendEmail({
              to: message.recipientAddress,
              toName: message.recipientName,
              subject: message.subject ?? "(No subject)",
              text: sendBody,
              html: null,
            })
          ).providerMessageId
        : (
            await sendWhatsApp({
              to: message.recipientAddress,
              toName: message.recipientName,
              body: sendBody,
            })
          ).providerMessageId;

    const updated = await prisma.outboundMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        sentAt: now,
        failedAt: null,
        providerMessageId,
        errorMessage: null,
      },
    });

    if (updated.projectId) {
      await prisma.projectCommunicationLog.create({
        data: {
          projectId: updated.projectId,
          channel: updated.channel,
          direction: "OUTBOUND",
          subject: updated.subject,
          body: updated.body,
          participants: updated.recipientAddress,
          occurredAt: now,
          metadata: {
            outboundMessageId: updated.id,
            providerMessageId,
            relatedType: updated.relatedType,
            relatedId: updated.relatedId,
            publicDocumentLinkId: publicLinkId,
          },
        },
      });
    }

    return { messageId: updated.id, status: updated.status, providerMessageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown send error";
    await prisma.outboundMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", failedAt: now, errorMessage },
    });
    return { messageId: message.id, status: "FAILED" as const, errorMessage };
  }
}

export async function sendOutboundMessage(params: SendOutboundMessageParams) {
  await ensureDefaultMessageTemplates();

  const now = new Date();
  const recipientName = params.recipientName.trim();
  const recipientAddress = params.recipientAddress.trim();
  const subject = params.subject?.trim() ? params.subject.trim() : null;
  const body = params.body.trim();

  let publicLinkUrl: string | null = null;
  let publicLinkId: string | null = null;
  const mustCreateLink = params.channel === "LINK" || params.includeSecureLink || params.includePdfAttachment;
  if (mustCreateLink) {
    const link = await createPublicDocumentLink({
      projectId: params.projectId ?? null,
      documentType: params.documentType,
      documentId: params.documentId,
      expiresInDays: params.linkExpiresInDays ?? null,
    });
    publicLinkUrl = link.url;
    publicLinkId = link.id;
  }

  const auditBody =
    publicLinkUrl
      ? `${body}\n\nSecure link: [generated]`
      : body;
  const sendBody =
    publicLinkUrl
      ? `${body}\n\nSecure link: ${publicLinkUrl}`
      : body;

  const message = await prisma.outboundMessage.create({
    data: {
      projectId: params.projectId ?? null,
      relatedType: params.relatedType,
      relatedId: params.relatedId,
      channel: params.channel,
      publicDocumentLinkId: publicLinkId,
      recipientName,
      recipientAddress,
      subject,
      body: auditBody,
      status: params.channel === "LINK" ? "SENT" : "QUEUED",
      sentAt: params.channel === "LINK" ? now : null,
      providerMessageId: params.channel === "LINK" ? "LINK" : null,
    },
  });

  if (params.includePdfAttachment && publicLinkUrl) {
    await prisma.messageAttachment.create({
      data: {
        messageId: message.id,
        fileName: `${params.documentType}_${params.documentId}.pdf`,
        // Attachment is represented as a secure link for now; PDF snapshot/export wiring comes later.
        fileUrl: publicLinkUrl,
        documentType: params.documentType,
        documentId: params.documentId,
      },
    });
  }

  if (params.channel === "LINK") {
    if (params.projectId) {
      await prisma.projectCommunicationLog.create({
        data: {
          projectId: params.projectId,
          channel: "LINK",
          direction: "OUTBOUND",
          subject,
          body: auditBody,
          participants: recipientAddress,
          occurredAt: now,
          metadata: {
            outboundMessageId: message.id,
            providerMessageId: "LINK",
            relatedType: params.relatedType,
            relatedId: params.relatedId,
            documentLinkCreated: Boolean(publicLinkUrl),
            publicDocumentLinkId: publicLinkId,
          },
        },
      });
    }

    return { messageId: message.id, status: "SENT" as const, providerMessageId: "LINK" };
  }

  try {
    const providerMessageId =
      params.channel === "EMAIL"
        ? (
            await sendEmail({
              to: recipientAddress,
              toName: recipientName,
              subject: subject ?? "(No subject)",
              text: sendBody,
              html: null,
            })
          ).providerMessageId
        : (
            await sendWhatsApp({
              to: recipientAddress,
              toName: recipientName,
              body: sendBody,
            })
          ).providerMessageId;

    const updated = await prisma.outboundMessage.update({
      where: { id: message.id },
      data: { status: "SENT", sentAt: now, providerMessageId, errorMessage: null },
    });

    if (params.projectId) {
      await prisma.projectCommunicationLog.create({
        data: {
          projectId: params.projectId,
          channel: params.channel,
          direction: "OUTBOUND",
          subject,
          body: auditBody,
          participants: recipientAddress,
          occurredAt: now,
          metadata: {
            outboundMessageId: updated.id,
            providerMessageId,
            relatedType: params.relatedType,
            relatedId: params.relatedId,
            documentLinkCreated: Boolean(publicLinkUrl),
            publicDocumentLinkId: publicLinkId,
          },
        },
      });
    }

    return { messageId: updated.id, status: updated.status, providerMessageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown send error";
    await prisma.outboundMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", failedAt: new Date(), errorMessage },
    });

    if (params.projectId) {
      await prisma.projectCommunicationLog.create({
        data: {
          projectId: params.projectId,
          channel: params.channel,
          direction: "OUTBOUND",
          subject,
          body: auditBody,
          participants: recipientAddress,
          occurredAt: now,
          metadata: {
            outboundMessageId: message.id,
            relatedType: params.relatedType,
            relatedId: params.relatedId,
            errorMessage,
            publicDocumentLinkId: publicLinkId,
          },
        },
      });
    }

    // Fail gracefully: message is marked FAILED and the UI can surface it in history.
    return { messageId: message.id, status: "FAILED" as const, errorMessage };
  }
}

export function formatCurrency(value: number): string {
  const rounded = roundCurrency(value);
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(rounded);
}
