import "server-only";

import { LeadBotChannel, ProjectType, PropertyType } from "@prisma/client";
import { normalizePhoneNumber } from "@/lib/validation/phone";

export type LeadBotCommand = "START" | "CANCEL" | "SKIP" | "CONFIRM" | null;

export type LeadBotStepKey =
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  | "projectType"
  | "propertyType"
  | "propertyAddress"
  | "estimatedBudget"
  | "preferredStartDate"
  | "remarks"
  | "attachments"
  | "confirm";

export type LeadBotAttachment = {
  fileUrl: string;
  fileType: string;
  originalFileName?: string | null;
};

export type LeadBotAnswers = {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string | null;
  projectType?: ProjectType;
  propertyType?: PropertyType | null;
  propertyAddress?: string;
  estimatedBudget?: number | null;
  preferredStartDate?: string | null; // YYYY-MM-DD
  remarks?: string | null;
};

export type LeadBotPayload = {
  answers: LeadBotAnswers;
  attachments: LeadBotAttachment[];
  leadId?: string;
  startedAtIso?: string;
  channel?: LeadBotChannel;
};

const REQUIRED_STEPS: ReadonlySet<LeadBotStepKey> = new Set([
  "customerName",
  "customerPhone",
  "projectType",
  "propertyAddress",
]);

export const LEAD_BOT_STEPS: ReadonlyArray<LeadBotStepKey> = [
  "customerName",
  "customerPhone",
  "customerEmail",
  "projectType",
  "propertyType",
  "propertyAddress",
  "estimatedBudget",
  "preferredStartDate",
  "remarks",
  "attachments",
  "confirm",
];

export function parseLeadBotCommand(text: string | null | undefined): LeadBotCommand {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "/start" || normalized === "start" || normalized === "start lead" || normalized === "new lead") {
    return "START";
  }
  if (normalized === "/cancel" || normalized === "cancel") return "CANCEL";
  if (normalized === "skip" || normalized === "/skip") return "SKIP";
  if (normalized === "confirm" || normalized === "/confirm" || normalized === "yes") return "CONFIRM";
  return null;
}

export function isRequiredStep(step: LeadBotStepKey): boolean {
  return REQUIRED_STEPS.has(step);
}

export function isValidStep(step: string): step is LeadBotStepKey {
  return (LEAD_BOT_STEPS as ReadonlyArray<string>).includes(step);
}

export function getNextStep(step: LeadBotStepKey): LeadBotStepKey {
  const idx = LEAD_BOT_STEPS.indexOf(step);
  if (idx < 0) return "customerName";
  return LEAD_BOT_STEPS[Math.min(idx + 1, LEAD_BOT_STEPS.length - 1)];
}

export function getWelcomeMessage(): string {
  return "Hi, I can help you submit a new customer lead. Please reply with the customer name.\n\nCommands: start lead, skip, cancel, confirm";
}

export function getCancelMessage(): string {
  return "Lead submission cancelled.";
}

export function getUnknownUserMessage(): string {
  return "Your number is not registered. Please ask admin to register your mobile number in Lead Channels.";
}

export function getCompletionMessage(): string {
  return "Lead submitted successfully. Your team can now see it in the Leads dashboard.";
}

export function getPromptForStep(step: LeadBotStepKey): string {
  switch (step) {
    case "customerName":
      return "Customer name?";
    case "customerPhone":
      return "Customer phone (E.164). Example: +6581234567";
    case "customerEmail":
      return "Customer email (optional). Reply `skip` if none.";
    case "projectType":
      return "Project type? Reply: RESIDENTIAL or COMMERCIAL";
    case "propertyType":
      return "Property type (optional). Reply: HDB / CONDO / LANDED / COMMERCIAL / OTHER, or `skip`.";
    case "propertyAddress":
      return "Property / site address?";
    case "estimatedBudget":
      return "Estimated budget (optional). Reply a number like 80000, or `skip`.";
    case "preferredStartDate":
      return "Preferred start date (optional). Reply YYYY-MM-DD, or `skip`.";
    case "remarks":
      return "Remarks (optional). Reply text, or `skip`.";
    case "attachments":
      return "You can send photos/documents now (optional). Send attachments, or reply `skip` to continue.";
    case "confirm":
      return "Reply `confirm` to submit this lead, or `cancel` to stop.";
    default:
      return "Please reply with the next detail.";
  }
}

export function applyTextAnswer(params: {
  step: LeadBotStepKey;
  payload: LeadBotPayload;
  text: string;
}): { ok: true; payload: LeadBotPayload } | { ok: false; error: string } {
  const trimmed = params.text.trim();
  if (!trimmed) return { ok: false, error: "Please reply with a value." };

  const answers = { ...params.payload.answers };

  switch (params.step) {
    case "customerName": {
      if (trimmed.length < 2) return { ok: false, error: "Please provide a valid customer name." };
      answers.customerName = trimmed.slice(0, 140);
      break;
    }
    case "customerPhone": {
      const normalized = normalizePhoneNumber(trimmed);
      if (!normalized) return { ok: false, error: "Invalid phone. Use +65… format." };
      answers.customerPhone = normalized;
      break;
    }
    case "customerEmail": {
      const email = trimmed.toLowerCase();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!isEmail) return { ok: false, error: "Invalid email. Reply a valid email or `skip`." };
      answers.customerEmail = email;
      break;
    }
    case "projectType": {
      const t = trimmed.toUpperCase();
      if (t !== "RESIDENTIAL" && t !== "COMMERCIAL") {
        return { ok: false, error: "Invalid project type. Reply RESIDENTIAL or COMMERCIAL." };
      }
      answers.projectType = t as ProjectType;
      break;
    }
    case "propertyType": {
      const t = trimmed.toUpperCase();
      const allowed = ["HDB", "CONDO", "LANDED", "COMMERCIAL", "OTHER"];
      if (!allowed.includes(t)) {
        return { ok: false, error: "Invalid property type. Reply HDB / CONDO / LANDED / COMMERCIAL / OTHER, or `skip`." };
      }
      answers.propertyType = t as PropertyType;
      break;
    }
    case "propertyAddress": {
      if (trimmed.length < 6) return { ok: false, error: "Please provide a valid address." };
      answers.propertyAddress = trimmed.slice(0, 280);
      break;
    }
    case "estimatedBudget": {
      const n = Number(trimmed.replaceAll(/[, ]/g, ""));
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Invalid budget. Reply a number like 80000, or `skip`." };
      answers.estimatedBudget = Math.round(n * 100) / 100;
      break;
    }
    case "preferredStartDate": {
      const iso = trimmed;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return { ok: false, error: "Invalid date. Reply YYYY-MM-DD, or `skip`." };
      }
      const d = new Date(`${iso}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date. Reply YYYY-MM-DD, or `skip`." };
      answers.preferredStartDate = iso;
      break;
    }
    case "remarks": {
      answers.remarks = trimmed.slice(0, 2000);
      break;
    }
    case "attachments":
    case "confirm":
      return { ok: false, error: "Please use `skip` or send attachments for this step." };
    default:
      return { ok: false, error: "Unknown step." };
  }

  return { ok: true, payload: { ...params.payload, answers } };
}

export function applySkip(params: { step: LeadBotStepKey; payload: LeadBotPayload }): { ok: true; payload: LeadBotPayload } | { ok: false; error: string } {
  if (isRequiredStep(params.step)) {
    return { ok: false, error: "This field is required and cannot be skipped." };
  }

  const answers = { ...params.payload.answers };
  if (params.step === "customerEmail") answers.customerEmail = null;
  if (params.step === "propertyType") answers.propertyType = null;
  if (params.step === "estimatedBudget") answers.estimatedBudget = null;
  if (params.step === "preferredStartDate") answers.preferredStartDate = null;
  if (params.step === "remarks") answers.remarks = null;

  return { ok: true, payload: { ...params.payload, answers } };
}

export function applyAttachment(params: { payload: LeadBotPayload; attachment: LeadBotAttachment }): LeadBotPayload {
  return {
    ...params.payload,
    attachments: [...(params.payload.attachments ?? []), params.attachment],
  };
}

export function renderConfirmSummary(payload: LeadBotPayload): string {
  const a = payload.answers ?? {};

  const lines: string[] = [
    "Please confirm the lead details:",
    `Name: ${a.customerName ?? "-"}`,
    `Phone: ${a.customerPhone ?? "-"}`,
    `Email: ${a.customerEmail ?? "-"}`,
    `Project Type: ${a.projectType ?? "-"}`,
    `Property Type: ${a.propertyType ?? "-"}`,
    `Address: ${a.propertyAddress ?? "-"}`,
    `Budget: ${a.estimatedBudget ?? "-"}`,
    `Start Date: ${a.preferredStartDate ?? "-"}`,
    `Remarks: ${a.remarks ?? "-"}`,
    `Attachments: ${payload.attachments?.length ?? 0}`,
  ];

  return `${lines.join("\n")}\n\nReply \`confirm\` to submit, or \`cancel\` to stop.`;
}

