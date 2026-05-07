import "server-only";

import { DesignBriefStatus, LeadBotChannel, LeadBotSessionStatus, Prisma, PropertyType } from "@prisma/client";
import { generateBriefSummaryAi } from "@/lib/design-ai/engine";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/validation/phone";

const SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000;
const FLOW_NAME = "WHATSAPP_DESIGN_BRIEF";

type SessionStep = "propertyType" | "budget" | "timeline" | "floorPlan";

export type WhatsAppLeadBotAttachment = {
  fileUrl: string;
  fileType: string;
  originalFileName?: string | null;
};

export type WhatsAppLeadBotInboundMessage = {
  externalUserId: string;
  phoneNumber?: string | null;
  contactName?: string | null;
  text?: string | null;
  attachment?: WhatsAppLeadBotAttachment | null;
};

type SessionPayload = {
  flow: typeof FLOW_NAME;
  startedAtIso: string;
  contactName: string | null;
  propertyType: PropertyType | null;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  floorPlan: WhatsAppLeadBotAttachment | null;
  designBriefId: string | null;
};

type LeadBotCommand = "START" | "CANCEL" | null;

function isSessionStep(value: string | null | undefined): value is SessionStep {
  return value === "propertyType" || value === "budget" || value === "timeline" || value === "floorPlan";
}

function getSessionExternalUserId(phoneNumber: string, externalUserId: string): string {
  return `whatsapp-design-brief:${phoneNumber || externalUserId}`;
}

function toJsonValue(payload: SessionPayload): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function createInitialPayload(contactName: string | null): SessionPayload {
  return {
    flow: FLOW_NAME,
    startedAtIso: new Date().toISOString(),
    contactName: contactName?.trim() || null,
    propertyType: null,
    budgetMin: null,
    budgetMax: null,
    timeline: null,
    floorPlan: null,
    designBriefId: null,
  };
}

function parseCommand(text: string | null | undefined): LeadBotCommand {
  const normalized = (text ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "start" || normalized === "/start" || normalized === "restart" || normalized === "new") {
    return "START";
  }
  if (normalized === "cancel" || normalized === "/cancel" || normalized === "stop") {
    return "CANCEL";
  }
  return null;
}

function propertyTypePrompt(): string {
  return "Hi, I'm Buildy's WhatsApp lead bot. I'll collect a few details, then ask for your floor plan.\n\nWhat type of property is this? Reply: HDB / CONDO / LANDED / COMMERCIAL / OTHER";
}

function budgetPrompt(): string {
  return "What is your renovation budget? You can reply with a range like `50000-80000` or a single amount like `80000`.";
}

function timelinePrompt(): string {
  return "What timeline are you targeting? Examples: `ASAP`, `within 3 months`, `Q3 2026`.";
}

function floorPlanPrompt(): string {
  return "Please upload your floor plan as an image or PDF.";
}

function cancellationMessage(): string {
  return "No problem. Reply `start` anytime to begin again.";
}

function normalizePropertyType(text: string): PropertyType | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "hdb" || normalized.includes("bto") || normalized.includes("flat")) return PropertyType.HDB;
  if (normalized === "condo" || normalized === "condominium" || normalized.includes("apartment")) return PropertyType.CONDO;
  if (normalized === "landed" || normalized.includes("terrace") || normalized.includes("house") || normalized.includes("bungalow")) {
    return PropertyType.LANDED;
  }
  if (normalized === "commercial" || normalized.includes("office") || normalized.includes("retail") || normalized.includes("shop")) {
    return PropertyType.COMMERCIAL;
  }
  if (normalized === "other") return PropertyType.OTHER;
  return null;
}

function parseBudgetAmount(raw: string): number {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)([km]?)$/i);
  if (!match) return Number.NaN;

  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return Number.NaN;

  const suffix = match[2]?.toLowerCase() ?? "";
  const factor = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round((base * factor + Number.EPSILON) * 100) / 100;
}

function parseBudgetRange(text: string): { min: number | null; max: number | null } | null {
  const normalized = text.toLowerCase().replaceAll(/[\$,]/g, " ").replaceAll(/\s+/g, " ").trim();
  if (!normalized) return null;

  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?\s*[km]?)/g)];
  const values = matches
    .map((match) => parseBudgetAmount(match[1]!.replaceAll(/\s+/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (values.length === 0) return null;

  if (values.length >= 2) {
    const ordered = values.slice(0, 2).sort((a, b) => a - b);
    return { min: ordered[0] ?? null, max: ordered[1] ?? null };
  }

  const value = values[0] ?? null;
  if (value === null) return null;

  if (/\b(under|below|less than|up to|max)\b/.test(normalized)) {
    return { min: null, max: value };
  }
  if (/\b(above|over|from|starting|min)\b/.test(normalized)) {
    return { min: value, max: null };
  }

  return { min: value, max: value };
}

function isAllowedFloorPlanAttachment(attachment: WhatsAppLeadBotAttachment): boolean {
  const fileType = attachment.fileType.toLowerCase();
  return fileType.startsWith("image/") || fileType.includes("pdf") || fileType === "image" || fileType === "document";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBudgetRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    if (min === max) return formatCurrency(min);
    return `${formatCurrency(min)} to ${formatCurrency(max)}`;
  }
  if (max !== null) return `up to ${formatCurrency(max)}`;
  if (min !== null) return `from ${formatCurrency(min)}`;
  return "Not provided";
}

function safePayload(raw: unknown, contactName: string | null): SessionPayload {
  const base = createInitialPayload(contactName);
  if (!raw || typeof raw !== "object") return base;

  const value = raw as Partial<SessionPayload>;
  if (value.flow !== FLOW_NAME) return base;

  return {
    flow: FLOW_NAME,
    startedAtIso: typeof value.startedAtIso === "string" ? value.startedAtIso : base.startedAtIso,
    contactName: typeof value.contactName === "string" ? value.contactName : contactName?.trim() || null,
    propertyType:
      value.propertyType === PropertyType.HDB ||
      value.propertyType === PropertyType.CONDO ||
      value.propertyType === PropertyType.LANDED ||
      value.propertyType === PropertyType.COMMERCIAL ||
      value.propertyType === PropertyType.OTHER
        ? value.propertyType
        : null,
    budgetMin: typeof value.budgetMin === "number" && Number.isFinite(value.budgetMin) ? value.budgetMin : null,
    budgetMax: typeof value.budgetMax === "number" && Number.isFinite(value.budgetMax) ? value.budgetMax : null,
    timeline: typeof value.timeline === "string" ? value.timeline : null,
    floorPlan:
      value.floorPlan &&
      typeof value.floorPlan === "object" &&
      typeof (value.floorPlan as WhatsAppLeadBotAttachment).fileUrl === "string" &&
      typeof (value.floorPlan as WhatsAppLeadBotAttachment).fileType === "string"
        ? {
            fileUrl: (value.floorPlan as WhatsAppLeadBotAttachment).fileUrl,
            fileType: (value.floorPlan as WhatsAppLeadBotAttachment).fileType,
            originalFileName:
              typeof (value.floorPlan as WhatsAppLeadBotAttachment).originalFileName === "string"
                ? (value.floorPlan as WhatsAppLeadBotAttachment).originalFileName
                : null,
          }
        : null,
    designBriefId: typeof value.designBriefId === "string" ? value.designBriefId : null,
  };
}

function buildBriefTitle(params: { contactName: string | null; phoneNumber: string }): string {
  const label = params.contactName?.trim() || params.phoneNumber;
  return `WhatsApp Lead Brief - ${label}`;
}

function buildClientNeeds(params: { propertyType: PropertyType; budgetMin: number | null; budgetMax: number | null; timeline: string | null }): string {
  return [
    `Inbound WhatsApp lead for a ${params.propertyType.toLowerCase()} project.`,
    `Budget: ${formatBudgetRange(params.budgetMin, params.budgetMax)}.`,
    `Timeline: ${params.timeline ?? "Not provided"}.`,
    "Client has uploaded a floor plan for review.",
  ].join("\n");
}

function buildRequirements(params: {
  propertyType: PropertyType;
  budgetMin: number | null;
  budgetMax: number | null;
  timeline: string | null;
  attachment: WhatsAppLeadBotAttachment;
}): string {
  return [
    `Property type: ${params.propertyType}`,
    `Budget: ${formatBudgetRange(params.budgetMin, params.budgetMax)}`,
    `Timeline: ${params.timeline ?? "Not provided"}`,
    `Floor plan file: ${params.attachment.originalFileName || params.attachment.fileType}`,
    `Floor plan reference: ${params.attachment.fileUrl}`,
  ].join("\n");
}

async function createSession(input: {
  externalUserId: string;
  phoneNumber: string;
  contactName: string | null;
}) {
  const payload = createInitialPayload(input.contactName);
  return prisma.leadBotSession.create({
    data: {
      channel: LeadBotChannel.WHATSAPP,
      externalUserId: input.externalUserId,
      phoneNumber: input.phoneNumber,
      telegramChatId: null,
      submittedByUserId: null,
      currentStep: "propertyType",
      payload: toJsonValue(payload),
      status: LeadBotSessionStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createDesignBriefFromPayload(params: {
  phoneNumber: string;
  contactName: string | null;
  payload: SessionPayload;
  attachment: WhatsAppLeadBotAttachment;
}) {
  if (!params.payload.propertyType) {
    throw new Error("Property type is required before creating a design brief.");
  }

  const clientName = params.contactName?.trim() || params.phoneNumber;
  const clientNeeds = buildClientNeeds({
    propertyType: params.payload.propertyType,
    budgetMin: params.payload.budgetMin,
    budgetMax: params.payload.budgetMax,
    timeline: params.payload.timeline,
  });
  const requirements = buildRequirements({
    propertyType: params.payload.propertyType,
    budgetMin: params.payload.budgetMin,
    budgetMax: params.payload.budgetMax,
    timeline: params.payload.timeline,
    attachment: params.attachment,
  });

  const created = await prisma.designBrief.create({
    data: {
      title: buildBriefTitle({ contactName: params.contactName, phoneNumber: params.phoneNumber }),
      clientNeeds,
      propertyType: params.payload.propertyType,
      clientName,
      clientPhone: params.phoneNumber,
      budgetMin: params.payload.budgetMin,
      budgetMax: params.payload.budgetMax,
      timeline: params.payload.timeline,
      requirements,
      status: DesignBriefStatus.DRAFT,
    },
    select: {
      id: true,
      clientName: true,
      propertyType: true,
      budgetMin: true,
      budgetMax: true,
      timeline: true,
      requirements: true,
    },
  });

  const ai = await generateBriefSummaryAi({
    clientName: created.clientName || clientName,
    propertyType: created.propertyType,
    floorArea: null,
    rooms: null,
    budgetMin: created.budgetMin ? Number(created.budgetMin.toString()) : null,
    budgetMax: created.budgetMax ? Number(created.budgetMax.toString()) : null,
    preferredStyle: null,
    timeline: created.timeline,
    requirements: created.requirements,
  });

  return prisma.designBrief.update({
    where: { id: created.id },
    data: {
      aiSummary: ai.aiSummary,
      aiRecommendedStyle: ai.aiRecommendedStyle,
      aiBudgetRisk: ai.aiBudgetRisk,
      aiNextAction: ai.aiNextAction,
      status: DesignBriefStatus.DESIGN_IN_PROGRESS,
    },
    select: {
      id: true,
      aiSummary: true,
      aiNextAction: true,
    },
  });
}

export async function processWhatsAppDesignBriefLead(message: WhatsAppLeadBotInboundMessage): Promise<{ reply: string }> {
  const phoneNumber = normalizePhoneNumber(message.phoneNumber ?? message.externalUserId);
  if (!phoneNumber) {
    return { reply: "I couldn't read your phone number from WhatsApp. Please try again." };
  }

  const sessionExternalUserId = getSessionExternalUserId(phoneNumber, message.externalUserId);
  const active = await prisma.leadBotSession.findFirst({
    where: {
      channel: LeadBotChannel.WHATSAPP,
      externalUserId: sessionExternalUserId,
      status: LeadBotSessionStatus.ACTIVE,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const command = parseCommand(message.text);
  const isExpired = active ? Date.now() - active.updatedAt.getTime() > SESSION_EXPIRE_MS : false;

  if (active && isExpired) {
    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: { status: LeadBotSessionStatus.EXPIRED },
    });
  }

  if (command === "CANCEL") {
    if (active && !isExpired) {
      await prisma.leadBotSession.update({
        where: { id: active.id },
        data: { status: LeadBotSessionStatus.CANCELLED },
      });
    }
    return { reply: cancellationMessage() };
  }

  if (command === "START" || !active || isExpired) {
    if (active && !isExpired && command === "START") {
      await prisma.leadBotSession.update({
        where: { id: active.id },
        data: { status: LeadBotSessionStatus.CANCELLED },
      });
    }

    await createSession({
      externalUserId: sessionExternalUserId,
      phoneNumber,
      contactName: message.contactName?.trim() || null,
    });
    return { reply: propertyTypePrompt() };
  }

  const payload = safePayload(active.payload, message.contactName?.trim() || null);
  const currentStep = isSessionStep(active.currentStep) ? active.currentStep : "propertyType";
  const incomingText = (message.text ?? "").trim();

  if (currentStep === "propertyType") {
    if (!incomingText) return { reply: propertyTypePrompt() };

    const propertyType = normalizePropertyType(incomingText);
    if (!propertyType) {
      return { reply: "Please reply with one of: HDB / CONDO / LANDED / COMMERCIAL / OTHER." };
    }

    const nextPayload: SessionPayload = {
      ...payload,
      contactName: payload.contactName ?? (message.contactName?.trim() || null),
      propertyType,
    };

    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: {
        currentStep: "budget",
        payload: toJsonValue(nextPayload),
      },
    });

    return { reply: budgetPrompt() };
  }

  if (currentStep === "budget") {
    if (!incomingText) return { reply: budgetPrompt() };

    const budget = parseBudgetRange(incomingText);
    if (!budget) {
      return { reply: "Please reply with a budget like `50000-80000`, `up to 80000`, or `80000`." };
    }

    const nextPayload: SessionPayload = {
      ...payload,
      budgetMin: budget.min,
      budgetMax: budget.max,
    };

    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: {
        currentStep: "timeline",
        payload: toJsonValue(nextPayload),
      },
    });

    return { reply: timelinePrompt() };
  }

  if (currentStep === "timeline") {
    if (!incomingText) return { reply: timelinePrompt() };

    const timeline = incomingText.slice(0, 140);
    const nextPayload: SessionPayload = {
      ...payload,
      timeline,
    };

    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: {
        currentStep: "floorPlan",
        payload: toJsonValue(nextPayload),
      },
    });

    return { reply: floorPlanPrompt() };
  }

  if (currentStep === "floorPlan") {
    if (!message.attachment) {
      return { reply: floorPlanPrompt() };
    }

    if (!isAllowedFloorPlanAttachment(message.attachment)) {
      return { reply: "Please upload the floor plan as an image or PDF." };
    }

    const nextPayload: SessionPayload = {
      ...payload,
      floorPlan: message.attachment,
    };

    const brief = await createDesignBriefFromPayload({
      phoneNumber,
      contactName: nextPayload.contactName ?? (message.contactName?.trim() || null),
      payload: nextPayload,
      attachment: message.attachment,
    });

    nextPayload.designBriefId = brief.id;

    await prisma.leadBotSession.update({
      where: { id: active.id },
      data: {
        currentStep: "floorPlan",
        payload: toJsonValue(nextPayload),
        status: LeadBotSessionStatus.COMPLETED,
      },
    });

    const summary = brief.aiSummary?.trim() || "Your design brief has been created.";
    const nextAction = brief.aiNextAction?.trim() || "Our team will review the brief and follow up.";

    return {
      reply: `Thanks, I've received your floor plan and created your design brief.\n\nSummary: ${summary}\nNext step: ${nextAction}`,
    };
  }

  return { reply: propertyTypePrompt() };
}
