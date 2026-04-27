"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createOrUpdateProjectPortalAccount, createPortalToken } from "@/lib/client-portal/service";
import { renderTemplateByCode } from "@/lib/messaging/templates";
import { sendEmail } from "@/lib/messaging/email";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";

const upsertSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(140),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertClientPortalAccountAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const parsed = upsertSchema.safeParse({
    projectId,
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) throw new Error("Invalid portal account.");

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, clientId: true },
  });
  if (!project) throw new Error("Project not found.");

  await createOrUpdateProjectPortalAccount({
    projectId: project.id,
    clientId: project.clientId,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
  });

  redirect(`/projects/${project.id}?portal=1`);
}

const inviteSchema = z.object({
  projectId: z.string().min(1),
  email: z.string().email(),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  sendNow: z.string().optional().or(z.literal("")).default(""),
});

export async function generateClientPortalInviteAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  await requirePermission({ permission: Permission.COMMS_WRITE, projectId });

  const parsed = inviteSchema.safeParse({
    projectId,
    email: formData.get("email"),
    channel: formData.get("channel"),
    sendNow: formData.get("sendNow"),
  });
  if (!parsed.success) throw new Error("Invalid invite request.");

  const account = await prisma.clientPortalAccount.findFirst({
    where: {
      email: parsed.data.email.trim().toLowerCase(),
      projectId: parsed.data.projectId,
    },
  });
  if (!account || !account.isActive) throw new Error("Portal account not found or inactive.");

  const token = await createPortalToken({ accountId: account.id, expiresInMinutes: 60 * 24 * 7 });

  const sendNow = parsed.data.sendNow === "on";

  const templateCode = parsed.data.channel === "EMAIL" ? "EMAIL_PORTAL_INVITE" : "WHATSAPP_PORTAL_INVITE";
  const rendered = await renderTemplateByCode(templateCode, {
    recipientName: account.name,
    portalLink: token.url,
  });

  const recipientAddress = parsed.data.channel === "EMAIL" ? account.email : (account.phone ?? "");
  if (parsed.data.channel === "WHATSAPP" && !recipientAddress.trim()) {
    throw new Error("Portal account phone is required to send WhatsApp invite.");
  }

  // Never persist the raw portal token URL in audit logs or message records.
  const auditBody = rendered.body.replaceAll(token.url, "[portal_link]");

  const message = await prisma.outboundMessage.create({
    data: {
      projectId: parsed.data.projectId,
      relatedType: "CLIENT_PORTAL_INVITE",
      relatedId: account.id,
      channel: parsed.data.channel,
      recipientName: account.name,
      recipientAddress,
      subject: rendered.subject,
      body: auditBody,
      status: sendNow ? "QUEUED" : "DRAFT",
    },
  });

  if (sendNow) {
    try {
      const providerMessageId =
        parsed.data.channel === "EMAIL"
          ? (
              await sendEmail({
                to: recipientAddress,
                toName: account.name,
                subject: rendered.subject ?? "Client portal access",
                text: rendered.body,
                html: null,
              })
            ).providerMessageId
          : (
              await sendWhatsApp({
                to: recipientAddress,
                toName: account.name,
                body: rendered.body,
              })
            ).providerMessageId;

      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId, errorMessage: null },
      });

      await prisma.projectCommunicationLog.create({
        data: {
          projectId: parsed.data.projectId,
          channel: parsed.data.channel,
          direction: "OUTBOUND",
          subject: rendered.subject,
          body: auditBody,
          participants: recipientAddress,
          occurredAt: new Date(),
          metadata: {
            outboundMessageId: message.id,
            relatedType: "CLIENT_PORTAL_INVITE",
            accountId: account.id,
            providerMessageId,
          },
        },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Send failed";
      await prisma.outboundMessage.update({
        where: { id: message.id },
        data: { status: "FAILED", failedAt: new Date(), errorMessage },
      });
    }
  }

  const redirectUrl = `/projects/${parsed.data.projectId}?portal=1&inviteLink=${encodeURIComponent(token.url)}`;
  redirect(redirectUrl);
}

const markSchema = z.object({
  projectId: z.string().min(1),
  messageId: z.string().min(1),
  status: z.enum(["NEW", "READ", "RESOLVED", "ARCHIVED"]),
});

export async function setClientPortalMessageStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const parsed = markSchema.safeParse({
    projectId,
    messageId: formData.get("messageId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await prisma.clientPortalMessage.update({
    where: { id: parsed.data.messageId },
    data: { status: parsed.data.status },
  });

  redirect(`/projects/${parsed.data.projectId}?portal=1`);
}
