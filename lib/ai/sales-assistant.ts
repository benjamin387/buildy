import "server-only";

import type {
  AISalesInsightType,
  DesignStyle,
  LeadStatus,
  MessageChannel,
  PropertyCategory,
  ProjectType,
} from "@prisma/client";

export type LeadContext = {
  leadNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  source: string | null;
  status: LeadStatus;
  projectType: ProjectType;
  propertyCategory: PropertyCategory;
  projectAddress: string;
  preferredDesignStyle: DesignStyle | null;
  requirementSummary: string | null;
  notes: string | null;
  nextFollowUpAt: Date | null;
  lastActivityAt: Date | null;
  hasSiteVisitScheduled: boolean;
};

export type LeadQualityAnalysis = {
  qualityScore: number; // 0-100
  budgetReadiness: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";
  highValueFlag: boolean;
  reasons: string[];
  missingInfo: string[];
  confidenceScore: number; // 0-1
};

export type SalesNextAction = {
  title: string;
  recommendation: string;
  suggestedChannel: MessageChannel;
  dueLabel: string;
};

export type CustomerFollowUpDraft = {
  channel: MessageChannel;
  purpose: string;
  recipientName: string | null;
  recipientContact: string | null;
  messageBody: string;
};

export type QuotationPitchDraft = {
  title: string;
  messageBody: string;
  closingStrategy: string;
  budgetJustification: string;
};

export type UpsellPitchDraft = {
  messageBody: string;
  recommendedUpsells: string[];
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function detectBudgetMention(text: string): boolean {
  const t = normalizeText(text).toLowerCase();
  if (!t) return false;
  if (t.includes("budget")) return true;
  if (t.includes("$")) return true;
  if (/\b\d{2,3}\s?k\b/.test(t)) return true; // 30k, 80k
  if (/\b\d{2,3}\s?000\b/.test(t)) return true; // 30000
  return false;
}

function inferBudgetReadiness(text: string): LeadQualityAnalysis["budgetReadiness"] {
  const t = normalizeText(text).toLowerCase();
  if (!t) return "UNKNOWN";
  if (detectBudgetMention(t)) return "HIGH";
  if (t.includes("affordable") || t.includes("cheaper") || t.includes("low budget") || t.includes("tight budget")) {
    return "LOW";
  }
  if (t.includes("mid") || t.includes("reasonable")) return "MEDIUM";
  return "UNKNOWN";
}

export async function summarizeClientRequirement(input: {
  requirementSummary: string | null;
  notes: string | null;
  preferredDesignStyle: string | null;
  address: string;
}): Promise<string> {
  const raw = [input.requirementSummary ?? "", input.notes ?? ""].join("\n").trim();
  const style = input.preferredDesignStyle ? `Style: ${input.preferredDesignStyle.replaceAll("_", " ")}` : null;

  if (!raw) {
    return [
      "No requirement details captured yet.",
      style,
      `Site: ${input.address}`,
      "Next: confirm scope, rooms, timeline, and budget range.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const cleaned = raw.replaceAll(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 6);
  const first = sentences.join(" ").slice(0, 420);

  const keywords: string[] = [];
  const lower = cleaned.toLowerCase();
  if (lower.includes("kitchen")) keywords.push("Kitchen");
  if (lower.includes("toilet") || lower.includes("bathroom")) keywords.push("Bathrooms");
  if (lower.includes("carpentry")) keywords.push("Carpentry");
  if (lower.includes("hacking") || lower.includes("demolition")) keywords.push("Hacking/Demolition");
  if (lower.includes("electrical")) keywords.push("Electrical");
  if (lower.includes("plumbing")) keywords.push("Plumbing");
  if (lower.includes("timeline") || lower.includes("date") || lower.includes("handover")) keywords.push("Timeline");
  if (detectBudgetMention(cleaned)) keywords.push("Budget mentioned");

  return [
    style,
    `Site: ${input.address}`,
    keywords.length ? `Keywords: ${keywords.join(", ")}` : null,
    "",
    first,
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n");
}

export async function analyzeLeadQuality(input: LeadContext): Promise<LeadQualityAnalysis> {
  const reasons: string[] = [];
  const missingInfo: string[] = [];

  let score = 0;

  if (input.customerEmail) {
    score += 15;
    reasons.push("Email provided.");
  } else {
    missingInfo.push("Customer email");
  }

  if (input.customerPhone) {
    score += 15;
    reasons.push("Phone provided.");
  } else {
    missingInfo.push("Customer phone");
  }

  if (input.projectAddress) {
    score += 10;
    reasons.push("Project address captured.");
  } else {
    missingInfo.push("Project address");
  }

  const requirementsText = [input.requirementSummary ?? "", input.notes ?? ""].join("\n").trim();
  if (requirementsText.length >= 20) {
    score += 12;
    reasons.push("Requirement details captured.");
  } else {
    missingInfo.push("Requirements / scope summary");
  }

  const budgetReady = inferBudgetReadiness(requirementsText);
  if (budgetReady === "HIGH") {
    score += 12;
    reasons.push("Budget mentioned (high readiness).");
  } else if (budgetReady === "MEDIUM") {
    score += 6;
    reasons.push("Budget intent indicated (medium readiness).");
  } else if (budgetReady === "LOW") {
    score += 2;
    reasons.push("Budget sensitivity indicated (low readiness).");
  }

  if (input.preferredDesignStyle) {
    score += 6;
    reasons.push("Preferred design style captured.");
  }

  if (input.hasSiteVisitScheduled) {
    score += 12;
    reasons.push("Site visit scheduled.");
  }

  if (input.status === "CONTACTED" || input.status === "QUALIFYING") score += 6;
  if (input.status === "SITE_VISIT_SCHEDULED") score += 8;
  if (input.status === "QUOTATION_PENDING") score += 10;
  if (input.status === "CONVERTED") score += 12;

  const isCommercial = input.projectType === "COMMERCIAL" || input.propertyCategory === "COMMERCIAL";
  const highValueFlag = isCommercial;
  if (isCommercial) {
    score += 8;
    reasons.push("Commercial project (higher value potential).");
  }

  if (input.lastActivityAt) {
    const noTouchDays = daysBetween(new Date(), input.lastActivityAt);
    if (noTouchDays >= 7 && input.status !== "CONVERTED" && input.status !== "LOST") {
      score -= 10;
      reasons.push(`No activity in ${noTouchDays} days (follow-up risk).`);
    }
  } else if (input.status !== "NEW") {
    score -= 6;
    reasons.push("No recorded activities yet (low signal).");
  }

  if (!input.nextFollowUpAt && input.status !== "CONVERTED" && input.status !== "LOST") {
    score -= 3;
    reasons.push("No follow-up date set.");
  }

  const completenessSignals = [
    Boolean(input.customerEmail),
    Boolean(input.customerPhone),
    Boolean(input.projectAddress),
    Boolean(requirementsText.length >= 20),
    Boolean(input.preferredDesignStyle),
  ];
  const confidenceScore = clamp01(completenessSignals.filter(Boolean).length / completenessSignals.length);

  return {
    qualityScore: clampScore(score),
    budgetReadiness: budgetReady,
    highValueFlag,
    reasons,
    missingInfo,
    confidenceScore,
  };
}

export async function suggestSalesNextAction(input: LeadContext): Promise<SalesNextAction> {
  const now = new Date();
  const followUpDue =
    input.nextFollowUpAt ? input.nextFollowUpAt.getTime() <= now.getTime() : false;
  const stale =
    input.lastActivityAt ? daysBetween(now, input.lastActivityAt) >= 7 : input.status !== "NEW";

  const channel: MessageChannel = input.customerPhone ? "WHATSAPP" : "EMAIL";
  const dueLabel = followUpDue ? "Due now" : stale ? "Due soon" : "On track";

  if (input.status === "NEW") {
    return {
      title: "First contact and qualification",
      recommendation:
        "Introduce your team, confirm property type, timeline, and budget range. Offer site visit slots.",
      suggestedChannel: channel,
      dueLabel,
    };
  }

  if (input.status === "CONTACTED" || input.status === "QUALIFYING") {
    return {
      title: "Schedule site visit",
      recommendation:
        "Propose 2-3 site visit slots. Confirm key requirements (rooms, hacking needs, carpentry, M&E) and budget range.",
      suggestedChannel: channel,
      dueLabel,
    };
  }

  if (input.status === "SITE_VISIT_SCHEDULED") {
    return {
      title: "Confirm site visit & prepare checklist",
      recommendation:
        "Send a confirmation message with visit time, what to prepare (keys, measurement access), and a short checklist of decisions to capture.",
      suggestedChannel: channel,
      dueLabel,
    };
  }

  if (input.status === "QUOTATION_PENDING") {
    return {
      title: "Lock scope and quote expectations",
      recommendation:
        "Confirm must-haves vs optional items. Align on budget and timeline so the quotation fits expectations before sending.",
      suggestedChannel: channel,
      dueLabel,
    };
  }

  if (input.status === "CONVERTED") {
    return {
      title: "Move to project workflow",
      recommendation:
        "Open the project, start design brief, generate sales package, and send presentation + quotation for approval.",
      suggestedChannel: channel,
      dueLabel: "In progress",
    };
  }

  return {
    title: "Follow up",
    recommendation: "Follow up politely and propose next step (site visit or quotation).",
    suggestedChannel: channel,
    dueLabel,
  };
}

function greeting(name: string | null): string {
  return name ? `Hi ${name},` : "Hi there,";
}

export async function generateCustomerFollowUp(input: {
  lead: LeadContext;
  channel: MessageChannel;
  purpose:
    | "FIRST_CONTACT"
    | "SITE_VISIT_BOOKING"
    | "QUOTATION_FOLLOW_UP"
    | "PRESENTATION_FOLLOW_UP"
    | "PAYMENT_REMINDER"
    | "UPSELL_PROPOSAL";
}): Promise<CustomerFollowUpDraft> {
  const name = input.lead.customerName || null;
  const base = [input.lead.requirementSummary ?? "", input.lead.notes ?? ""].join(" ").trim();
  const hasBudget = detectBudgetMention(base);

  const nextStepsLine = hasBudget
    ? "If you’re comfortable with the budget range, we can proceed to the next step."
    : "If you can share a rough budget range, we’ll tailor the proposal to match expectations.";

  let body = "";
  if (input.purpose === "FIRST_CONTACT") {
    body = [
      greeting(name),
      "",
      "Thanks for reaching out. I’m with the design & renovation team.",
      `I’d like to understand your scope for ${input.lead.projectAddress}.`,
      "",
      "Quick questions:",
      "1) Property type and key areas to renovate (kitchen, toilets, carpentry, etc.)",
      "2) Preferred design style and timeline",
      "3) Budget range (so we can propose the right scope)",
      "",
      "We can also arrange a site visit. Are you available this week?",
    ].join("\n");
  } else if (input.purpose === "SITE_VISIT_BOOKING") {
    body = [
      greeting(name),
      "",
      "We can schedule a site visit to take measurements and confirm scope.",
      "Proposed slots:",
      "- Option 1: [Day/Time]",
      "- Option 2: [Day/Time]",
      "- Option 3: [Day/Time]",
      "",
      "During the visit we’ll confirm:",
      "- hacking/carpentry scope",
      "- electrical/plumbing needs",
      "- preferred materials and layout",
      "",
      nextStepsLine,
    ].join("\n");
  } else if (input.purpose === "QUOTATION_FOLLOW_UP") {
    body = [
      greeting(name),
      "",
      "Just checking in on the quotation. Happy to walk you through the scope and options.",
      "If you’d like, we can also value-engineer to match your budget while keeping the key design intent.",
      "",
      "Would you prefer a quick call or WhatsApp discussion today?",
    ].join("\n");
  } else if (input.purpose === "PRESENTATION_FOLLOW_UP") {
    body = [
      greeting(name),
      "",
      "Following up on the presentation and proposed design options.",
      "If you share which option you prefer (A/B/C), we can finalize the quotation and timeline.",
      "",
      "Would you like us to include any optional upgrades (smart home, lighting, feature wall, storage optimization)?",
    ].join("\n");
  } else if (input.purpose === "PAYMENT_REMINDER") {
    body = [
      greeting(name),
      "",
      "A quick reminder on the outstanding payment. If you’ve already arranged payment, please ignore this message.",
      "If you need a copy of the invoice or payment details, I can resend immediately.",
      "",
      "Thank you.",
    ].join("\n");
  } else {
    body = [
      greeting(name),
      "",
      "We have a few optional upgrades that can significantly improve daily comfort and value (without changing the main scope).",
      "If you’re interested, I can propose 2-3 options with clear pricing and timeline impact.",
      "",
      nextStepsLine,
    ].join("\n");
  }

  const recipientContact = input.channel === "EMAIL" ? input.lead.customerEmail : input.lead.customerPhone;

  return {
    channel: input.channel,
    purpose: input.purpose,
    recipientName: name,
    recipientContact: recipientContact ?? null,
    messageBody: body,
  };
}

export async function generateQuotationPitch(input: {
  clientName: string | null;
  projectName: string;
  siteAddress: string;
  quotationNumber: string;
  version: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  designStyle: string | null;
}): Promise<QuotationPitchDraft> {
  const name = input.clientName;
  const whyChooseUs = [
    "Why choose us:",
    "- Clear BOQ-style scope with transparent pricing",
    "- Structured design workflow with selected options",
    "- Progressive billing controls and documented communication",
  ].join("\n");

  const closingStrategy = [
    "Closing strategy:",
    "1) Confirm preferred option and any adjustments",
    "2) Confirm timeline and budget alignment",
    "3) Approve quotation to proceed to contract and scheduling",
  ].join("\n");

  const budgetJustification = [
    "Budget justification (client-friendly):",
    `This quotation covers the agreed scope for ${input.siteAddress}. We can value-engineer optional finishes if you need to align to a target budget, while keeping the key design intent.`,
  ].join("\n");

  const body = [
    greeting(name),
    "",
    `Here is our quotation ${input.quotationNumber} (V${input.version}) for ${input.projectName}.`,
    `Site: ${input.siteAddress}`,
    input.designStyle ? `Style direction: ${input.designStyle}` : null,
    "",
    `Subtotal: SGD ${input.subtotal.toFixed(2)}`,
    `GST: SGD ${input.gstAmount.toFixed(2)}`,
    `Total: SGD ${input.totalAmount.toFixed(2)}`,
    "",
    "Next steps:",
    "- Let us know if you’d like any scope adjustments or optional upgrades",
    "- If all looks good, we’ll proceed to contract and scheduling",
    "",
    whyChooseUs,
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n");

  return {
    title: "Quotation pitch",
    messageBody: body,
    closingStrategy,
    budgetJustification,
  };
}

export async function generateUpsellPitch(input: {
  clientName: string | null;
  projectName: string;
  upsellTitles: string[];
}): Promise<UpsellPitchDraft> {
  const tops = input.upsellTitles.slice(0, 5);
  const recommendedUpsells = tops.length ? tops : ["Smart home starter package", "Premium lighting upgrade", "Storage optimization add-on"];

  const body = [
    greeting(input.clientName),
    "",
    `For ${input.projectName}, here are a few optional upgrades that many clients find high-impact:`,
    ...recommendedUpsells.map((u) => `- ${u}`),
    "",
    "If you tell me which ones you like, I’ll propose a simple add-on price and any timeline impact (so you can decide clearly).",
  ].join("\n");

  return { messageBody: body, recommendedUpsells };
}

export async function generateObjectionHandlingReply(input: {
  clientName: string | null;
  objectionText: string;
  channel: MessageChannel;
}): Promise<{ messageBody: string; keyPoints: string[] }> {
  const objection = normalizeText(input.objectionText);
  const lower = objection.toLowerCase();

  const points: string[] = [];
  const reply: string[] = [greeting(input.clientName), ""];

  if (lower.includes("too expensive") || lower.includes("price") || lower.includes("budget")) {
    points.push("Acknowledge budget concern and offer value engineering.");
    reply.push("Totally understand on budget.");
    reply.push("We can value-engineer the scope (e.g. adjust finishes, optional items) while keeping the key layout and functional requirements.");
    reply.push("If you share your target budget range, I’ll revise the proposal so it matches expectations.");
  } else if (lower.includes("timeline") || lower.includes("time") || lower.includes("handover")) {
    points.push("Confirm target dates and explain timeline drivers.");
    reply.push("Understood on timeline.");
    reply.push("To confirm feasibility, can you share your target start date and desired handover date?");
    reply.push("We’ll align scope and procurement lead times to meet the deadline where possible.");
  } else if (lower.includes("compare") || lower.includes("competitor") || lower.includes("other quote")) {
    points.push("Differentiate on scope clarity and controls.");
    reply.push("Thanks for comparing options.");
    reply.push("When you compare, please ensure the scope is like-for-like. Our quotation is BOQ-structured so you can see exactly what is included.");
    reply.push("If you share the key differences you’re seeing, I can explain and adjust if needed.");
  } else {
    points.push("Clarify concerns and propose a quick call.");
    reply.push("Thanks for sharing.");
    reply.push("To address this properly, can you tell me the top 1-2 concerns you want solved?");
    reply.push("If you’re free, we can do a quick 10-minute call and I’ll adjust the proposal accordingly.");
  }

  reply.push("");
  reply.push("Thank you.");

  return { messageBody: reply.join("\n"), keyPoints: points };
}

export function toInsightTitle(type: AISalesInsightType): string {
  switch (type) {
    case "LEAD_QUALITY":
      return "Lead quality";
    case "NEXT_ACTION":
      return "Recommended next action";
    case "PRICING":
      return "Pricing / positioning";
    case "UPSELL":
      return "Upsell strategy";
    case "OBJECTION_HANDLING":
      return "Objection handling";
    case "REQUIREMENT_SUMMARY":
      return "Requirement summary";
    default:
      return "Sales insight";
  }
}
