"use server";

import { z } from "zod";
import { AISalesStatus, MessageChannel, Permission } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUserId } from "@/lib/rbac";
import { auditLog } from "@/lib/audit";
import { generateQuotationPitch, generateUpsellPitch } from "@/lib/ai/sales-assistant";

function assertAISalesEnabled() {
  const prismaAny = prisma as unknown as Record<string, any>;
  if (typeof prismaAny.aISalesInsight?.create !== "function") {
    throw new Error(
      "AI Sales Assistant tables are not available in the running server. If you just updated Prisma, run prisma generate and restart the server.",
    );
  }
  if (typeof prismaAny.aISalesMessageDraft?.create !== "function") {
    throw new Error(
      "AI Sales Assistant tables are not available in the running server. If you just updated Prisma, run prisma generate and restart the server.",
    );
  }
}

const pitchSchema = z.object({
  projectId: z.string().min(1),
  quotationId: z.string().optional().or(z.literal("")).default(""),
  channel: z.nativeEnum(MessageChannel).optional().default(MessageChannel.EMAIL),
  returnTo: z.string().optional().or(z.literal("")).default(""),
});

export async function generateQuotationPitchAction(formData: FormData) {
  assertAISalesEnabled();
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = pitchSchema.safeParse({
    projectId,
    quotationId: formData.get("quotationId"),
    channel: formData.get("channel"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const quotation = parsed.data.quotationId
    ? await prisma.quotation.findUnique({
        where: { id: parsed.data.quotationId },
        include: { project: { include: { client: true } } },
      })
    : await prisma.quotation.findFirst({
        where: { projectId: parsed.data.projectId, isLatest: true },
        include: { project: { include: { client: true } } },
        orderBy: [{ createdAt: "desc" }],
      });
  if (!quotation || quotation.projectId !== parsed.data.projectId) throw new Error("Quotation not found.");

  const lead = await prisma.lead.findFirst({
    where: { convertedProjectId: parsed.data.projectId },
    orderBy: [{ convertedAt: "desc" }, { createdAt: "desc" }],
    select: { preferredDesignStyle: true },
  });

  const pitch = await generateQuotationPitch({
    clientName: quotation.clientNameSnapshot ?? quotation.project.client?.name ?? null,
    projectName: quotation.projectNameSnapshot,
    siteAddress: quotation.projectAddress1,
    quotationNumber: quotation.quotationNumber,
    version: quotation.version,
    subtotal: Number(quotation.subtotal),
    gstAmount: Number(quotation.gstAmount),
    totalAmount: Number(quotation.totalAmount),
    designStyle: lead?.preferredDesignStyle ?? null,
  });

  const recipientName =
    quotation.contactPersonSnapshot ||
    quotation.clientNameSnapshot ||
    quotation.project.clientName ||
    quotation.project.client?.name ||
    null;

  const recipientContact =
    parsed.data.channel === "EMAIL"
      ? quotation.contactEmailSnapshot || quotation.project.clientEmail || quotation.project.client?.email || null
      : quotation.contactPhoneSnapshot || quotation.project.clientPhone || quotation.project.client?.phone || null;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.aISalesInsight.create({
      data: {
        leadId: null,
        projectId: parsed.data.projectId,
        insightType: "PRICING",
        title: `Quotation pitch: ${quotation.quotationNumber} (V${quotation.version})`,
        summary: pitch.budgetJustification,
        recommendation: pitch.closingStrategy,
        confidenceScore: 0.75,
        status: AISalesStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.aISalesMessageDraft.create({
      data: {
        leadId: null,
        projectId: parsed.data.projectId,
        channel: parsed.data.channel,
        recipientName,
        recipientContact,
        purpose: "QUOTATION_PITCH",
        messageBody: pitch.messageBody,
        status: AISalesStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "generate_quotation_pitch",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "Quotation",
    entityId: quotation.id,
    metadata: { channel: parsed.data.channel, quotationNumber: quotation.quotationNumber, version: quotation.version },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/quotations/${quotation.id}`);
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
  redirect(`/projects/${parsed.data.projectId}/quotations/${quotation.id}#ai-sales`);
}

const upsellSchema = z.object({
  projectId: z.string().min(1),
  designBriefId: z.string().optional().or(z.literal("")).default(""),
  channel: z.nativeEnum(MessageChannel).optional().default(MessageChannel.WHATSAPP),
  returnTo: z.string().optional().or(z.literal("")).default(""),
});

export async function generateUpsellPitchAction(formData: FormData) {
  assertAISalesEnabled();
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = upsellSchema.safeParse({
    projectId,
    designBriefId: formData.get("designBriefId"),
    channel: formData.get("channel"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    include: { client: true },
  });
  if (!project) throw new Error("Project not found.");

  const upsells = await prisma.upsellRecommendation.findMany({
    where: {
      projectId: parsed.data.projectId,
      ...(parsed.data.designBriefId ? { designBriefId: parsed.data.designBriefId } : {}),
      status: { not: "REJECTED" },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 10,
  });

  const pitch = await generateUpsellPitch({
    clientName: project.clientName || project.client?.name || null,
    projectName: project.name,
    upsellTitles: upsells.map((u) => u.title),
  });

  const recipientName = project.clientName || project.client?.name || null;
  const recipientContact =
    parsed.data.channel === "EMAIL"
      ? project.clientEmail || project.client?.email || null
      : project.clientPhone || project.client?.phone || null;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.aISalesInsight.create({
      data: {
        leadId: null,
        projectId: parsed.data.projectId,
        insightType: "UPSELL",
        title: "Upsell pitch",
        summary: pitch.recommendedUpsells.length
          ? `Recommended: ${pitch.recommendedUpsells.join(", ")}`
          : "No upsells available yet.",
        recommendation:
          "Offer 2-3 options with clear add-on price and timeline impact; ask for preferred priority and confirm before inserting into quotation.",
        confidenceScore: upsells.length > 0 ? 0.7 : 0.45,
        status: AISalesStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      },
    });

    await tx.aISalesMessageDraft.create({
      data: {
        leadId: null,
        projectId: parsed.data.projectId,
        channel: parsed.data.channel,
        recipientName,
        recipientContact,
        purpose: "UPSELL_PITCH",
        messageBody: pitch.messageBody,
        status: AISalesStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "generate_upsell_pitch",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "Project",
    entityId: parsed.data.projectId,
    metadata: { channel: parsed.data.channel, upsellCount: upsells.length },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
  redirect(`/projects/${parsed.data.projectId}#ai-sales`);
}

const statusUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(AISalesStatus),
  returnTo: z.string().optional().or(z.literal("")).default(""),
});

export async function updateAISalesInsightStatusAction(formData: FormData) {
  assertAISalesEnabled();
  const parsed = statusUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const userId = await requireUserId();
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  await prisma.aISalesInsight.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "update_insight_status",
    actorUserId: userId,
    projectId: null,
    entityType: "AISalesInsight",
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
  redirect("/sales/assistant");
}

export async function updateAISalesMessageDraftStatusAction(formData: FormData) {
  assertAISalesEnabled();
  const parsed = statusUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const userId = await requireUserId();
  await requirePermission({ permission: Permission.PROJECT_WRITE });

  await prisma.aISalesMessageDraft.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  });

  await auditLog({
    module: "ai_sales_assistant",
    action: "update_message_draft_status",
    actorUserId: userId,
    projectId: null,
    entityType: "AISalesMessageDraft",
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
  redirect("/sales/assistant");
}
