"use server";

import { z } from "zod";
import { Permission } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { sendExistingOutboundMessage, sendOutboundMessage } from "@/lib/messaging/service";
import { prisma } from "@/lib/prisma";
import { completeCollectionAction } from "@/lib/collections/service";

const sendSchema = z.object({
  returnTo: z.string().min(1),
  projectId: z.string().optional().or(z.literal("")).default(""),
  relatedType: z.enum([
    "DESIGN_PRESENTATION",
    "QUOTATION",
    "CONTRACT",
    "INVOICE",
    "VARIATION_ORDER",
    "PURCHASE_ORDER",
    "SUBCONTRACT",
    "SUPPLIER_BILL",
    "COLLECTION_REMINDER",
  ]),
  relatedId: z.string().min(1),
  documentType: z.enum([
    "DESIGN_PRESENTATION",
    "QUOTATION",
    "CONTRACT",
    "INVOICE",
    "VARIATION_ORDER",
    "PURCHASE_ORDER",
    "SUBCONTRACT",
    "SUPPLIER_BILL",
    "COLLECTION_REMINDER",
  ]),
  documentId: z.string().min(1),
  channel: z.enum(["EMAIL", "WHATSAPP", "LINK"]),
  recipientName: z.string().min(1),
  recipientAddress: z.string().optional().or(z.literal("")).default(""),
  subject: z.string().optional().or(z.literal("")).default(""),
  body: z.string().min(1),
  includeSecureLink: z.union([z.literal("on"), z.literal("true"), z.literal("1")]).optional(),
  includePdfAttachment: z.union([z.literal("on"), z.literal("true"), z.literal("1")]).optional(),
  linkExpiresInDays: z.string().optional().or(z.literal("")).default(""),
  collectionActionId: z.string().optional().or(z.literal("")).default(""),
});

function parseDays(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function requireDocumentRead(params: { projectId?: string; relatedType: string }) {
  const projectId = params.projectId;
  const type = params.relatedType;

  if (type === "DESIGN_PRESENTATION") {
    await requirePermission({ permission: Permission.PROJECT_READ, projectId });
    return;
  }
  if (type === "QUOTATION") {
    await requirePermission({ permission: Permission.QUOTE_READ, projectId });
    return;
  }
  if (type === "CONTRACT") {
    await requirePermission({ permission: Permission.CONTRACT_READ, projectId });
    return;
  }
  if (type === "INVOICE") {
    await requirePermission({ permission: Permission.INVOICE_READ, projectId });
    return;
  }
  if (type === "VARIATION_ORDER") {
    await requirePermission({ permission: Permission.QUOTE_READ, projectId });
    return;
  }
  if (type === "PURCHASE_ORDER" || type === "SUPPLIER_BILL") {
    await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });
    return;
  }
  if (type === "SUBCONTRACT") {
    await requirePermission({ permission: Permission.SUBCONTRACT_READ, projectId });
    return;
  }
  if (type === "COLLECTION_REMINDER") {
    await requirePermission({ permission: Permission.INVOICE_READ, projectId });
    return;
  }
}

async function requireSendPermission(params: { projectId?: string; relatedType: string }) {
  // Communication is a finance-grade operation; gate with COMMS_WRITE globally + tighter module
  // permission where available.
  await requirePermission({ permission: Permission.COMMS_WRITE, projectId: params.projectId });

  if (params.relatedType === "INVOICE") {
    await requirePermission({ permission: Permission.INVOICE_SEND, projectId: params.projectId });
  }
  if (params.relatedType === "VARIATION_ORDER") {
    await requirePermission({ permission: Permission.QUOTE_READ, projectId: params.projectId });
  }
  if (params.relatedType === "COLLECTION_REMINDER") {
    await requirePermission({ permission: Permission.PAYMENT_RECORD, projectId: params.projectId });
  }
}

export async function sendOutboundMessageAction(formData: FormData) {
  const parsed = sendSchema.safeParse({
    returnTo: formData.get("returnTo"),
    projectId: formData.get("projectId"),
    relatedType: formData.get("relatedType"),
    relatedId: formData.get("relatedId"),
    documentType: formData.get("documentType"),
    documentId: formData.get("documentId"),
    channel: formData.get("channel"),
    recipientName: formData.get("recipientName"),
    recipientAddress: formData.get("recipientAddress"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    includeSecureLink: formData.get("includeSecureLink"),
    includePdfAttachment: formData.get("includePdfAttachment"),
    linkExpiresInDays: formData.get("linkExpiresInDays"),
    collectionActionId: formData.get("collectionActionId"),
  });
  if (!parsed.success) throw new Error("Invalid send request.");

  const projectId = parsed.data.projectId || undefined;

  await requireDocumentRead({ projectId, relatedType: parsed.data.relatedType });
  await requireSendPermission({ projectId, relatedType: parsed.data.relatedType });

  const includeSecureLink =
    parsed.data.channel === "LINK"
      ? true
      : Boolean(parsed.data.includeSecureLink) || Boolean(parsed.data.includePdfAttachment);
  const includePdfAttachment = Boolean(parsed.data.includePdfAttachment);
  const linkExpiresInDays = parseDays(parsed.data.linkExpiresInDays);

  const rawRecipientAddress = parsed.data.recipientAddress?.trim() || "";
  if (parsed.data.channel !== "LINK" && !rawRecipientAddress) {
    throw new Error("Recipient address is required for Email/WhatsApp.");
  }
  const recipientAddress = parsed.data.channel === "LINK" ? (rawRecipientAddress || "-") : rawRecipientAddress;

  const result = await sendOutboundMessage({
    projectId: projectId ?? null,
    relatedType: parsed.data.relatedType,
    relatedId: parsed.data.relatedId,
    channel: parsed.data.channel,
    recipientName: parsed.data.recipientName,
    recipientAddress,
    subject: parsed.data.subject || null,
    body: parsed.data.body,
    includeSecureLink,
    includePdfAttachment,
    linkExpiresInDays,
    documentType: parsed.data.documentType,
    documentId: parsed.data.documentId,
  });

  // Only mark collection actions/cases if the send actually succeeded.
  if (result.status === "SENT") {
    if (parsed.data.relatedType === "COLLECTION_REMINDER" && parsed.data.collectionActionId) {
      // Mark the specific pending collection action completed once the reminder is sent.
      await completeCollectionAction({
        caseId: parsed.data.relatedId,
        actionId: parsed.data.collectionActionId,
      });
    }

    // Best-effort: mark the most recent pending action as "REMINDER_SENT" if no actionId supplied.
    if (parsed.data.relatedType === "COLLECTION_REMINDER" && !parsed.data.collectionActionId) {
      const caseRow = await prisma.collectionCase.findUnique({
        where: { id: parsed.data.relatedId },
        select: { id: true, status: true },
      });
      if (caseRow && ["OPEN"].includes(caseRow.status)) {
        await prisma.collectionCase.update({ where: { id: caseRow.id }, data: { status: "REMINDER_SENT" } });
      }
    }
  }

  revalidatePath(parsed.data.returnTo);
  if (projectId) revalidatePath(`/projects/${projectId}/comms`);
  revalidatePath("/collections");
  if (result.status !== "SENT") {
    redirect(withQueryParam(parsed.data.returnTo, "send", "failed"));
  }
  redirect(parsed.data.returnTo);
}

const linkSchema = z.object({
  returnTo: z.string().min(1),
  projectId: z.string().optional().or(z.literal("")).default(""),
  documentType: z.enum([
    "DESIGN_PRESENTATION",
    "QUOTATION",
    "CONTRACT",
    "INVOICE",
    "VARIATION_ORDER",
    "PURCHASE_ORDER",
    "SUBCONTRACT",
    "SUPPLIER_BILL",
    "COLLECTION_REMINDER",
  ]),
  documentId: z.string().min(1),
  expiresInDays: z.string().optional().or(z.literal("")).default(""),
});

function withQueryParam(href: string, key: string, value: string): string {
  const u = new URL(href, "http://localhost");
  u.searchParams.set(key, value);
  return `${u.pathname}${u.search}${u.hash}`;
}

export async function generatePublicDocumentLinkAction(formData: FormData) {
  const parsed = linkSchema.safeParse({
    returnTo: formData.get("returnTo"),
    projectId: formData.get("projectId"),
    documentType: formData.get("documentType"),
    documentId: formData.get("documentId"),
    expiresInDays: formData.get("expiresInDays"),
  });
  if (!parsed.success) throw new Error("Invalid link request.");

  const projectId = parsed.data.projectId || undefined;
  await requirePermission({ permission: Permission.COMMS_WRITE, projectId });
  await requireDocumentRead({ projectId, relatedType: parsed.data.documentType });

  const expiresInDays = parseDays(parsed.data.expiresInDays);

  // Reuse the messaging engine: create a link-only outbound message so link creation is audited.
  await sendOutboundMessage({
    projectId: projectId ?? null,
    relatedType: parsed.data.documentType,
    relatedId: parsed.data.documentId,
    channel: "LINK",
    recipientName: "Link generated",
    recipientAddress: "-",
    subject: null,
    body: "Secure link generated for client delivery.",
    includeSecureLink: true,
    includePdfAttachment: false,
    linkExpiresInDays: expiresInDays,
    documentType: parsed.data.documentType,
    documentId: parsed.data.documentId,
  });

  // Fetch the latest active link created for this document and return it as a one-time query param.
  const latest = await prisma.publicDocumentLink.findFirst({
    where: {
      documentType: parsed.data.documentType,
      documentId: parsed.data.documentId,
      isActive: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });
  if (!latest) throw new Error("Link generation failed.");

  redirect(withQueryParam(parsed.data.returnTo, "deliveryToken", latest.token));
}

const revokeLinkSchema = z.object({
  returnTo: z.string().min(1),
  projectId: z.string().optional().or(z.literal("")).default(""),
  documentType: z.enum([
    "DESIGN_PRESENTATION",
    "QUOTATION",
    "CONTRACT",
    "INVOICE",
    "VARIATION_ORDER",
    "PURCHASE_ORDER",
    "SUBCONTRACT",
    "SUPPLIER_BILL",
    "COLLECTION_REMINDER",
  ]),
  documentId: z.string().min(1),
});

const sendDraftSchema = z.object({
  returnTo: z.string().min(1),
  messageId: z.string().min(1),
});

export async function sendOutboundMessageDraftAction(formData: FormData) {
  const parsed = sendDraftSchema.safeParse({
    returnTo: formData.get("returnTo"),
    messageId: formData.get("messageId"),
  });
  if (!parsed.success) throw new Error("Invalid send draft request.");

  const msg = await prisma.outboundMessage.findUnique({
    where: { id: parsed.data.messageId },
    select: { id: true, projectId: true, relatedType: true, channel: true, status: true },
  });
  if (!msg) throw new Error("Outbound message not found.");

  if (msg.channel === "LINK") throw new Error("Link-only messages do not require sending.");
  if (!["DRAFT", "FAILED"].includes(msg.status)) {
    redirect(parsed.data.returnTo);
  }

  const projectId = msg.projectId ?? undefined;
  await requireDocumentRead({ projectId, relatedType: msg.relatedType });
  await requireSendPermission({ projectId, relatedType: msg.relatedType });

  const result = await sendExistingOutboundMessage({ messageId: msg.id });

  revalidatePath(parsed.data.returnTo);
  if (projectId) revalidatePath(`/projects/${projectId}/comms`);
  revalidatePath("/collections");
  if (result.status !== "SENT") {
    redirect(withQueryParam(parsed.data.returnTo, "send", "failed"));
  }
  redirect(parsed.data.returnTo);
}

export async function revokePublicDocumentLinksAction(formData: FormData) {
  const parsed = revokeLinkSchema.safeParse({
    returnTo: formData.get("returnTo"),
    projectId: formData.get("projectId"),
    documentType: formData.get("documentType"),
    documentId: formData.get("documentId"),
  });
  if (!parsed.success) throw new Error("Invalid revoke request.");

  const projectId = parsed.data.projectId || undefined;
  await requirePermission({ permission: Permission.COMMS_WRITE, projectId });
  await requireDocumentRead({ projectId, relatedType: parsed.data.documentType });

  await prisma.publicDocumentLink.updateMany({
    where: {
      documentType: parsed.data.documentType,
      documentId: parsed.data.documentId,
      isActive: true,
    },
    data: { isActive: false, updatedAt: new Date() },
  });

  revalidatePath(parsed.data.returnTo);
  redirect(parsed.data.returnTo);
}
