import "server-only";

import { prisma } from "@/lib/prisma";
import {
  Prisma,
  LeadBotChannel,
  LeadBotSessionStatus,
  LeadSource,
  LeadStatus,
  ProjectType,
  PropertyCategory,
  ResidentialPropertyType,
  type PropertyType,
} from "@prisma/client";
import {
  applyAttachment,
  applySkip,
  applyTextAnswer,
  getCancelMessage,
  getCompletionMessage,
  getNextStep,
  getPromptForStep,
  getUnknownUserMessage,
  getWelcomeMessage,
  isValidStep,
  parseLeadBotCommand,
  renderConfirmSummary,
  type LeadBotAttachment,
  type LeadBotPayload,
  type LeadBotStepKey,
} from "@/lib/leads/bot-flow";
import { generateLeadNumber } from "@/lib/leads/lead-number";
import { normalizePhoneNumber } from "@/lib/validation/phone";

const SESSION_EXPIRE_MS = 2 * 60 * 60 * 1000; // 2 hours

export type InboundLeadBotMessage = {
  channel: LeadBotChannel;
  externalUserId: string;
  phoneNumber?: string | null; // E.164
  telegramChatId?: string | null;
  text?: string | null;
  attachment?: LeadBotAttachment | null;
};

export type LeadBotProcessResult =
  | {
      ok: true;
      reply: string;
      status: "IGNORED" | "CONTINUED" | "COMPLETED" | "CANCELLED";
      sessionId?: string;
      leadId?: string;
    }
  | {
      ok: false;
      reply: string;
      status: "ERROR" | "UNREGISTERED";
    };

async function findRegisteredUserIdForInbound(input: {
  channel: LeadBotChannel;
  phoneNumber?: string | null;
  telegramChatId?: string | null;
}): Promise<string | null> {
  if (input.channel === "TELEGRAM") {
    const chatId = (input.telegramChatId ?? "").trim();
    if (!chatId) return null;
    const rows =
      (await prisma
        .$queryRaw<Array<{ id: string; canSubmitLeads: boolean | null }>>(
          Prisma.sql`
            SELECT "id", "canSubmitLeads"
            FROM "User"
            WHERE "telegramChatId" = ${chatId}
            LIMIT 1
          `,
        )
        .catch(() => [])) ?? [];
    const row = rows[0];
    if (!row?.id) return null;
    if (row.canSubmitLeads === false) return null;
    return row.id;
  }

  const e164 = input.phoneNumber ? normalizePhoneNumber(input.phoneNumber) : null;
  if (!e164) return null;
  const compact = e164.replaceAll("+", "");

  const rows =
    (await prisma
      .$queryRaw<Array<{ id: string; canSubmitLeads: boolean | null }>>(
        Prisma.sql`
          SELECT "id", "canSubmitLeads"
          FROM "User"
          WHERE
            "whatsappNumber" = ${e164}
            OR "mobileNumber" = ${e164}
            OR "whatsappNumber" = ${compact}
            OR "mobileNumber" = ${compact}
          LIMIT 1
        `,
      )
      .catch(() => [])) ?? [];

  const row = rows[0];
  if (!row?.id) return null;
  if (row.canSubmitLeads === false) return null;
  return row.id;
}

function safePayload(json: unknown, channel: LeadBotChannel): LeadBotPayload {
  const base: LeadBotPayload = {
    answers: {},
    attachments: [],
    startedAtIso: new Date().toISOString(),
    channel,
  };
  if (!json || typeof json !== "object") return base;
  const p = json as Partial<LeadBotPayload>;
  return {
    ...base,
    answers: typeof p.answers === "object" && p.answers ? (p.answers as any) : {},
    attachments: Array.isArray(p.attachments) ? (p.attachments as any) : [],
    leadId: typeof p.leadId === "string" ? p.leadId : undefined,
    startedAtIso: typeof p.startedAtIso === "string" ? p.startedAtIso : base.startedAtIso,
    channel,
  };
}

function safeStep(step: string | null | undefined): LeadBotStepKey {
  if (step && isValidStep(step)) return step;
  return "customerName";
}

function mapChannelToLeadSource(channel: LeadBotChannel): LeadSource {
  return channel === "WHATSAPP" ? LeadSource.WHATSAPP : LeadSource.TELEGRAM;
}

function derivePropertyCategory(projectType: ProjectType): PropertyCategory {
  return projectType === "COMMERCIAL" ? PropertyCategory.COMMERCIAL : PropertyCategory.RESIDENTIAL;
}

function deriveResidentialPropertyType(propertyType: PropertyType | null | undefined) {
  if (!propertyType) return null;
  if (propertyType === "HDB") return ResidentialPropertyType.HDB;
  if (propertyType === "CONDO") return ResidentialPropertyType.CONDO;
  if (propertyType === "LANDED") return ResidentialPropertyType.LANDED;
  return null;
}

async function createNewSession(input: {
  channel: LeadBotChannel;
  externalUserId: string;
  phoneNumber?: string | null;
  telegramChatId?: string | null;
  submittedByUserId: string;
}): Promise<{ sessionId: string; currentStep: LeadBotStepKey; payload: LeadBotPayload }> {
  const payload: LeadBotPayload = {
    answers: {},
    attachments: [],
    startedAtIso: new Date().toISOString(),
    channel: input.channel,
  };

  const created = await prisma.leadBotSession.create({
    data: {
      channel: input.channel,
      externalUserId: input.externalUserId,
      phoneNumber: input.phoneNumber ?? null,
      telegramChatId: input.telegramChatId ?? null,
      submittedByUserId: input.submittedByUserId,
      currentStep: "customerName",
      payload,
      status: LeadBotSessionStatus.ACTIVE,
    },
    select: { id: true, currentStep: true, payload: true },
  });

  return {
    sessionId: created.id,
    currentStep: "customerName",
    payload,
  };
}

export async function processLeadBotInbound(message: InboundLeadBotMessage): Promise<LeadBotProcessResult> {
  const registeredUserId = await findRegisteredUserIdForInbound({
    channel: message.channel,
    phoneNumber: message.phoneNumber ?? null,
    telegramChatId: message.telegramChatId ?? null,
  });

  if (!registeredUserId) {
    return { ok: false, status: "UNREGISTERED", reply: getUnknownUserMessage() };
  }

  const incomingText = (message.text ?? "").trim();
  const command = parseLeadBotCommand(incomingText);

  const active = await prisma.leadBotSession.findFirst({
    where: {
      channel: message.channel,
      externalUserId: message.externalUserId,
      status: LeadBotSessionStatus.ACTIVE,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const now = Date.now();
  const isExpired = active ? now - active.updatedAt.getTime() > SESSION_EXPIRE_MS : false;

  if (command === "START" || !active || isExpired) {
    if (active && isExpired) {
      await prisma.leadBotSession.update({
        where: { id: active.id },
        data: { status: LeadBotSessionStatus.EXPIRED },
      });
    }

    const session = await createNewSession({
      channel: message.channel,
      externalUserId: message.externalUserId,
      phoneNumber: message.phoneNumber ?? null,
      telegramChatId: message.telegramChatId ?? null,
      submittedByUserId: registeredUserId,
    });

    return {
      ok: true,
      status: "CONTINUED",
      sessionId: session.sessionId,
      reply: getWelcomeMessage(),
    };
  }

  if (command === "CANCEL") {
    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: { status: LeadBotSessionStatus.CANCELLED },
    });
    return { ok: true, status: "CANCELLED", sessionId: active.id, reply: getCancelMessage() };
  }

  const currentStep = safeStep(active.currentStep);
  let payload = safePayload(active.payload, message.channel);

  if (currentStep === "attachments") {
    if (message.attachment) {
      payload = applyAttachment({ payload, attachment: message.attachment });
      await prisma.leadBotSession.update({
        where: { id: active.id },
        data: { payload },
      });
      return {
        ok: true,
        status: "CONTINUED",
        sessionId: active.id,
        reply: `Attachment saved (${payload.attachments.length}). Send more, or reply \`skip\` to continue.`,
      };
    }

    if (command === "SKIP") {
      const nextStep = "confirm";
      await prisma.leadBotSession.update({
        where: { id: active.id },
        data: { currentStep: nextStep, payload },
      });
      return { ok: true, status: "CONTINUED", sessionId: active.id, reply: renderConfirmSummary(payload) };
    }

    return {
      ok: true,
      status: "CONTINUED",
      sessionId: active.id,
      reply: getPromptForStep("attachments"),
    };
  }

  if (currentStep === "confirm") {
    if (command !== "CONFIRM") {
      return { ok: true, status: "CONTINUED", sessionId: active.id, reply: renderConfirmSummary(payload) };
    }

    const a = payload.answers ?? {};
    const missing: string[] = [];
    if (!a.customerName) missing.push("customerName");
    if (!a.customerPhone) missing.push("customerPhone");
    if (!a.projectType) missing.push("projectType");
    if (!a.propertyAddress) missing.push("propertyAddress");

    if (missing.length > 0) {
      const resetStep = missing[0] as LeadBotStepKey;
      await prisma.leadBotSession.update({
        where: { id: active.id },
        data: { currentStep: resetStep, payload },
      });
      return {
        ok: true,
        status: "CONTINUED",
        sessionId: active.id,
        reply: `Missing required fields: ${missing.join(", ")}.\n\n${getPromptForStep(resetStep)}`,
      };
    }

    const leadNumber = generateLeadNumber();
    const leadSource = mapChannelToLeadSource(message.channel);

    const projectType = a.projectType ?? ProjectType.RESIDENTIAL;
    const propertyCategory = derivePropertyCategory(projectType);
    const residentialPropertyType = deriveResidentialPropertyType(a.propertyType);

    const created = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          leadNumber,
          customerName: a.customerName ?? "Unknown",
          customerEmail: a.customerEmail ?? null,
          customerPhone: a.customerPhone ?? null,
          source: leadSource,
          marketingSource: null,
          status: LeadStatus.NEW,
          submittedByUserId: registeredUserId,
          assignedToUserId: null,
          assignedSalesName: null,
          assignedSalesEmail: null,
          projectAddress: a.propertyAddress ?? "Unknown address",
          projectType,
          propertyType: a.propertyType ?? null,
          propertyAddress: a.propertyAddress ?? null,
          estimatedBudget:
            a.estimatedBudget === null || a.estimatedBudget === undefined
              ? null
              : new Prisma.Decimal(a.estimatedBudget),
          preferredStartDate: a.preferredStartDate ? new Date(`${a.preferredStartDate}T00:00:00.000Z`) : null,
          remarks: a.remarks ?? null,
          propertyCategory,
          residentialPropertyType,
          hdbType: null,
          condoType: null,
          landedType: null,
          preferredDesignStyle: null,
          requirementSummary: null,
          notes: null,
          nextFollowUpAt: null,
          convertedProjectId: null,
          convertedAt: null,
        },
        select: { id: true, leadNumber: true },
      });

      if (payload.attachments.length > 0) {
        await tx.leadAttachment.createMany({
          data: payload.attachments.map((att) => ({
            leadId: lead.id,
            channel: message.channel,
            fileUrl: att.fileUrl,
            fileType: att.fileType,
            originalFileName: att.originalFileName ?? null,
          })),
        });
      }

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          activityType: "NOTE",
          channel: "OTHER",
          summary: `Lead submitted via ${message.channel}`,
          notes: `Bot session: ${active.id}`,
          followUpAt: null,
          createdBy: `bot:${message.channel.toLowerCase()}`,
        },
      });

      return lead;
    });

    payload = { ...payload, leadId: created.id };

    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: {
        status: LeadBotSessionStatus.COMPLETED,
        currentStep: "confirm",
        payload,
      },
    });

    return { ok: true, status: "COMPLETED", sessionId: active.id, leadId: created.id, reply: getCompletionMessage() };
  }

  if (command === "SKIP") {
    const skipped = applySkip({ step: currentStep, payload });
    if (!skipped.ok) {
      return { ok: true, status: "CONTINUED", sessionId: active.id, reply: `${skipped.error}\n\n${getPromptForStep(currentStep)}` };
    }
    payload = skipped.payload;
    const nextStep = getNextStep(currentStep);
    const nextReply = nextStep === "confirm" ? renderConfirmSummary(payload) : getPromptForStep(nextStep);
    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: { currentStep: nextStep, payload },
    });
    return { ok: true, status: "CONTINUED", sessionId: active.id, reply: nextReply };
  }

  if (message.attachment) {
    return { ok: true, status: "CONTINUED", sessionId: active.id, reply: `Attachment received. I'll ask for attachments near the end.\n\n${getPromptForStep(currentStep)}` };
  }

  const applied = applyTextAnswer({ step: currentStep, payload, text: incomingText });
  if (!applied.ok) {
    return { ok: true, status: "CONTINUED", sessionId: active.id, reply: `${applied.error}\n\n${getPromptForStep(currentStep)}` };
  }

  payload = applied.payload;
  const nextStep = getNextStep(currentStep);
  const nextReply = nextStep === "confirm" ? renderConfirmSummary(payload) : getPromptForStep(nextStep);

  await prisma.leadBotSession.update({
    where: { id: active.id },
    data: { currentStep: nextStep, payload },
  });

  return { ok: true, status: "CONTINUED", sessionId: active.id, reply: nextReply };
}
