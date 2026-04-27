import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requirePermission as requireModulePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { auditLog, createRevision } from "@/lib/audit";
import { renderTemplateByCode } from "@/lib/messaging/templates";
import { createOutboundMessageDraft } from "@/lib/messaging/service";
import { getCompanySetting, getNotificationSetting } from "@/lib/settings/service";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "PREPARED", "CALCULATED", "SENT", "APPROVED", "REJECTED"]),
});

function canTransition(from: string, to: string): boolean {
  if (to === "SENT") {
    return from === "DRAFT" || from === "PREPARED" || from === "CALCULATED";
  }
  if (to === "APPROVED" || to === "REJECTED") {
    return from === "SENT";
  }
  return false;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string }> },
) {
  try {
    const { projectId, quotationId } = await context.params;

    const body = await request.json();
    const input = updateSchema.parse(body);

    const requiredPermission =
      input.status === "APPROVED" || input.status === "REJECTED"
        ? Permission.QUOTE_APPROVE
        : Permission.QUOTE_WRITE;

    const { userId } = await requirePermission({
      permission: requiredPermission,
      projectId,
    });

    // Role-permission matrix enforcement:
    // - SENT => requires "send"
    // - APPROVED/REJECTED => requires "approve"
    // - other transitions => requires "edit"
    if (input.status === "SENT") {
      await requireModulePermission({ moduleKey: "QUOTATIONS" satisfies PermissionModuleKey, action: "send" });
    } else if (input.status === "APPROVED" || input.status === "REJECTED") {
      await requireModulePermission({ moduleKey: "QUOTATIONS" satisfies PermissionModuleKey, action: "approve" });
    } else {
      await requireModulePermission({ moduleKey: "QUOTATIONS" satisfies PermissionModuleKey, action: "edit" });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        projectId: true,
        quotationNumber: true,
        version: true,
        status: true,
        isLatest: true,
      },
    });
    if (!quotation || quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    if (!quotation.isLatest) {
      return NextResponse.json(
        { success: false, error: "Only the latest quotation can change status." },
        { status: 409 },
      );
    }

    if (!canTransition(quotation.status, input.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status transition: ${quotation.status} → ${input.status}`,
        },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: input.status },
      });

      await tx.project.update({
        where: { id: projectId },
        data: { quotationStatus: input.status },
      });

      await tx.projectTimelineItem.create({
        data: {
          projectId,
          type: "QUOTATION",
          title: `Quotation status: ${quotation.quotationNumber} V${quotation.version} → ${input.status}`,
          createdById: userId,
          metadata: { quotationId, from: quotation.status, to: input.status },
        },
      });
    });

    await auditLog({
      module: "quotation",
      action: "status_update",
      actorUserId: userId,
      projectId,
      entityType: "Quotation",
      entityId: quotationId,
      metadata: { from: quotation.status, to: input.status },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Status updated",
      data: { quotationId, from: quotation.status, to: input.status },
    });

    // When a quotation is marked SENT, prepare a WhatsApp-first delivery draft with a secure link.
    // This does not auto-send; the user can review and send from the Messaging panel.
    if (input.status === "SENT") {
      try {
        const q = await prisma.quotation.findUnique({
          where: { id: quotationId },
          select: {
            id: true,
            quotationNumber: true,
            version: true,
            contactPersonSnapshot: true,
            contactPhoneSnapshot: true,
            contactEmailSnapshot: true,
            clientNameSnapshot: true,
            projectNameSnapshot: true,
            project: {
              select: {
                id: true,
                clientName: true,
                clientPhone: true,
                clientEmail: true,
                client: { select: { name: true, phone: true, email: true } },
              },
            },
          },
        });

        const recipientName =
          q?.contactPersonSnapshot ||
          q?.clientNameSnapshot ||
          q?.project.clientName ||
          q?.project.client?.name ||
          "Client";
        const phone =
          q?.contactPhoneSnapshot ||
          q?.project.clientPhone ||
          q?.project.client?.phone ||
          "";
        const email =
          q?.contactEmailSnapshot ||
          q?.project.clientEmail ||
          q?.project.client?.email ||
          "";

        const useWhatsApp = Boolean(phone.trim());
        const channel = useWhatsApp ? ("WHATSAPP" as const) : ("EMAIL" as const);
        const recipientAddress = (useWhatsApp ? phone : email).trim();

        if (q && recipientAddress) {
          const [company, notification] = await Promise.all([
            getCompanySetting(),
            getNotificationSetting(),
          ]);
          const senderName =
            notification.emailFromName?.trim() ||
            company.companyName ||
            "Buildy";

          const templateCode = useWhatsApp ? "WHATSAPP_QUOTATION_SENT" : "EMAIL_QUOTATION_SENT";
          const rendered = await renderTemplateByCode(templateCode, {
            recipientName,
            quotationNumber: q.quotationNumber,
            projectName: q.projectNameSnapshot,
            senderName,
            documentLink: "[generated]",
          });

          await createOutboundMessageDraft({
            projectId,
            relatedType: "QUOTATION",
            relatedId: quotationId,
            channel,
            recipientName,
            recipientAddress,
            subject: rendered.subject,
            body: rendered.body,
            includeSecureLink: true,
            includePdfAttachment: false,
            linkExpiresInDays: 14,
            documentType: "QUOTATION",
            documentId: quotationId,
          });
        }
      } catch {
        // Best-effort draft creation; never block status update.
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
