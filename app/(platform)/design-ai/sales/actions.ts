"use server";

import { MessageChannel } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { generateSalesAdviceAi, whatsappCredentialsConfigured } from "@/lib/design-ai/sales-engine";
import { sendWhatsApp } from "@/lib/messaging/whatsapp";
import { SALES_STAGES } from "@/lib/design-ai/sales-constants";

const createSchema = z.object({
  designBriefId: z.string().optional().or(z.literal("")),
  quotationId: z.string().optional().or(z.literal("")),
  proposalId: z.string().optional().or(z.literal("")),
  clientName: z.string().trim().min(2).max(140),
  clientPhone: z.string().trim().min(6).max(40),
  stage: z.string().trim().min(1).max(80),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  clientConcern: z.string().trim().max(1500).optional(),
  nextFollowUpAt: z.string().optional().or(z.literal("")),
});

const salesAdviceSchema = z.object({
  followUpId: z.string().min(1),
});

const replySchema = z.object({
  followUpId: z.string().min(1),
  sendNow: z.enum(["yes", "no"]).optional().default("no"),
});

const doneSchema = z.object({
  followUpId: z.string().min(1),
});

const scheduleSchema = z.object({
  followUpId: z.string().min(1),
  nextFollowUpAt: z.string().min(1),
});

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function createClientFollowUp(formData: FormData) {
  await requireUser();

  const parsed = createSchema.safeParse({
    designBriefId: formData.get("designBriefId")?.toString() ?? "",
    quotationId: formData.get("quotationId")?.toString() ?? "",
    proposalId: formData.get("proposalId")?.toString() ?? "",
    clientName: formData.get("clientName"),
    clientPhone: formData.get("clientPhone"),
    stage: formData.get("stage"),
    priority: formData.get("priority") || "MEDIUM",
    clientConcern: formData.get("clientConcern")?.toString() ?? "",
    nextFollowUpAt: formData.get("nextFollowUpAt")?.toString() ?? "",
  });

  if (!parsed.success) throw new Error("Invalid follow-up input.");

  const created = await prisma.clientFollowUp.create({
    data: {
      designBriefId: parsed.data.designBriefId || null,
      quotationId: parsed.data.quotationId || null,
      proposalId: parsed.data.proposalId || null,
      clientName: parsed.data.clientName,
      clientPhone: parsed.data.clientPhone,
      stage: parsed.data.stage,
      priority: parsed.data.priority,
      clientConcern: parsed.data.clientConcern || null,
      nextFollowUpAt: parseDate(parsed.data.nextFollowUpAt),
      status: "OPEN",
    },
  });

  revalidatePath("/design-ai/sales");
  revalidatePath(`/design-ai/sales/${created.id}`);
}

export async function generateAISalesAdvice(formData: FormData) {
  await requireUser();

  const parsed = salesAdviceSchema.safeParse({ followUpId: formData.get("followUpId") });
  if (!parsed.success) throw new Error("Missing follow-up id.");

  const followUp = await prisma.clientFollowUp.findUnique({
    where: { id: parsed.data.followUpId },
    include: {
      designBrief: true,
      quotation: true,
    },
  });
  if (!followUp) throw new Error("Follow-up not found.");

  const projectContext = [
    followUp.designBrief?.title ?? "",
    followUp.designBrief?.requirements ?? followUp.designBrief?.clientNeeds ?? "",
    followUp.quotation ? `Quotation ${followUp.quotation.quotationNumber} total ${followUp.quotation.totalAmount.toString()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await generateSalesAdviceAi({
    clientName: followUp.clientName,
    stage: followUp.stage,
    priority: followUp.priority,
    concern: followUp.clientConcern,
    projectContext,
  });

  await prisma.clientFollowUp.update({
    where: { id: followUp.id },
    data: {
      aiSuggestedReply: ai.whatsappFollowUpMessage,
      aiObjectionHandling: ai.objectionHandling,
      aiUpsellSuggestion: ai.upsellSuggestion,
      aiDiscountLimit: ai.discountRecommendation,
    },
  });

  revalidatePath("/design-ai/sales");
  revalidatePath(`/design-ai/sales/${followUp.id}`);
}

export async function generateWhatsAppReply(formData: FormData) {
  await requireUser();

  const parsed = replySchema.safeParse({
    followUpId: formData.get("followUpId"),
    sendNow: formData.get("sendNow")?.toString() === "yes" ? "yes" : "no",
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const followUp = await prisma.clientFollowUp.findUnique({ where: { id: parsed.data.followUpId } });
  if (!followUp) throw new Error("Follow-up not found.");

  if (!followUp.aiSuggestedReply) {
    const ai = await generateSalesAdviceAi({
      clientName: followUp.clientName,
      stage: followUp.stage,
      priority: followUp.priority,
      concern: followUp.clientConcern,
      projectContext: "General renovation follow-up context",
    });

    await prisma.clientFollowUp.update({
      where: { id: followUp.id },
      data: { aiSuggestedReply: ai.whatsappFollowUpMessage },
    });
    followUp.aiSuggestedReply = ai.whatsappFollowUpMessage;
  }

  if (parsed.data.sendNow === "yes" && whatsappCredentialsConfigured()) {
    await sendWhatsApp({
      to: followUp.clientPhone,
      toName: followUp.clientName,
      body: followUp.aiSuggestedReply || "",
    }).catch(() => undefined);

    await prisma.clientFollowUp.update({
      where: { id: followUp.id },
      data: { lastContactedAt: new Date() },
    });
  }

  revalidatePath("/design-ai/sales");
  revalidatePath(`/design-ai/sales/${followUp.id}`);
}

export async function markFollowUpDone(formData: FormData) {
  await requireUser();

  const parsed = doneSchema.safeParse({ followUpId: formData.get("followUpId") });
  if (!parsed.success) throw new Error("Missing follow-up id.");

  await prisma.clientFollowUp.update({
    where: { id: parsed.data.followUpId },
    data: {
      status: "DONE",
      lastContactedAt: new Date(),
    },
  });

  revalidatePath("/design-ai/sales");
  revalidatePath(`/design-ai/sales/${parsed.data.followUpId}`);
}

export async function scheduleNextFollowUp(formData: FormData) {
  await requireUser();

  const parsed = scheduleSchema.safeParse({
    followUpId: formData.get("followUpId"),
    nextFollowUpAt: formData.get("nextFollowUpAt"),
  });
  if (!parsed.success) throw new Error("Invalid schedule data.");

  const nextFollowUpAt = parseDate(parsed.data.nextFollowUpAt);
  if (!nextFollowUpAt) throw new Error("Invalid next follow-up date.");

  await prisma.clientFollowUp.update({
    where: { id: parsed.data.followUpId },
    data: { nextFollowUpAt, status: "OPEN" },
  });

  revalidatePath("/design-ai/sales");
  revalidatePath(`/design-ai/sales/${parsed.data.followUpId}`);
}

export async function seedDefaultClientMessageTemplates() {
  await requireUser();

  const existing = await prisma.clientMessageTemplate.count();
  if (existing > 0) return;

  await prisma.clientMessageTemplate.createMany({
    data: [
      {
        name: "Proposal Follow-up (Warm)",
        channel: MessageChannel.WHATSAPP,
        stage: "Proposal Sent",
        tone: "Warm",
        content: "Hi {{clientName}}, sharing a quick check-in on the proposal. Happy to walk through options and value points before we finalize.",
        isActive: true,
      },
      {
        name: "Negotiation Clarifier",
        channel: MessageChannel.WHATSAPP,
        stage: "Negotiation",
        tone: "Professional",
        content: "Hi {{clientName}}, we can refine scope and sequencing to meet budget while preserving quality in key areas. Shall we review revised options today?",
        isActive: true,
      },
    ],
  });

  revalidatePath("/design-ai/sales");
}
