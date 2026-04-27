import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { TemplateCategory, type TemplateLibraryItem } from "@prisma/client";

type DefaultTemplateSeed = {
  category: TemplateCategory;
  code: string;
  title: string;
  description: string;
  content: string;
  variablesJson?: any;
};

const DEFAULT_TEMPLATES: DefaultTemplateSeed[] = [
  {
    category: TemplateCategory.QUOTATION_TERMS,
    code: "STD_QUOTATION_TERMS",
    title: "Standard Quotation Terms",
    description: "Typical quotation terms for interior renovation (SG). Edit per your legal review.",
    content:
      "1. Validity: This quotation is valid for {{validityDays}} days from the issue date.\n" +
      "2. Payment: Payments are due according to the agreed schedule. Work may be suspended for overdue payments.\n" +
      "3. Variations: Any change in scope requires written instruction and a signed variation order before execution.\n" +
      "4. Materials: Where specified materials are unavailable, alternatives of similar grade will be proposed for approval.\n" +
      "5. Site Conditions: Unforeseen site conditions (e.g., concealed services) may require adjustment via variation.\n" +
      "6. Warranty: Defects liability period applies as stated in the contract.\n" +
      "7. Exclusions: Items not expressly stated are excluded.\n",
    variablesJson: ["validityDays"],
  },
  {
    category: TemplateCategory.CONTRACT_CLAUSE,
    code: "CLAUSE_VARIATION_STANDARD",
    title: "Standard Variation Clause",
    description: "Written instruction, quotation before execution, approval required; includes cost/time impact.",
    content:
      "Variations\n" +
      "a) Any change to the Scope of Works must be instructed in writing by the Client or the Client’s authorised representative.\n" +
      "b) The Contractor shall, where practicable, provide a written quotation detailing the cost and time impact of the proposed variation prior to execution.\n" +
      "c) No variation shall be carried out unless and until the Client approves the variation in writing (including via email or WhatsApp acknowledgement) and the variation order is recorded.\n" +
      "d) Approved variations form part of the Contract Sum and may extend the completion timeline accordingly.\n",
    variablesJson: [],
  },
  {
    category: TemplateCategory.CONTRACT_CLAUSE,
    code: "CLAUSE_DEFECTS_LIABILITY_STANDARD",
    title: "Standard Defects Liability Clause",
    description: "Defects liability / warranty obligations and rectification timeline.",
    content:
      "Defects Liability / Warranty\n" +
      "a) The Contractor warrants the Works for {{warrantyMonths}} months from practical completion, subject to fair wear and tear and misuse.\n" +
      "b) The Client shall notify defects in writing. The Contractor shall attend and rectify within a reasonable timeframe, and in any event within {{rectifyDays}} days where practicable.\n" +
      "c) Defects caused by third-party works, client-supplied items, or subsequent alterations are excluded.\n",
    variablesJson: ["warrantyMonths", "rectifyDays"],
  },
  {
    category: TemplateCategory.PAYMENT_TERM,
    code: "PAY_50_50_START_HANDOVER",
    title: "Payment 50/50 (Start / Handover)",
    description: "Two-stage schedule: 50% at project start, 50% on handover.",
    content: JSON.stringify(
      {
        stages: [
          { label: "50% Project start", percentage: 50, triggerType: "PROJECT_START", dueDays: 0, sortOrder: 1 },
          { label: "50% Project handover", percentage: 50, triggerType: "HANDOVER", dueDays: 0, sortOrder: 2 },
        ],
      },
      null,
      2,
    ),
    variablesJson: { format: "json", schema: "stages[{label,percentage,triggerType,dueDays,sortOrder}]" },
  },
  {
    category: TemplateCategory.PAYMENT_TERM,
    code: "PAY_40_40_20",
    title: "Payment 40/40/20",
    description: "Three-stage schedule: 40% start, 40% mid, 20% handover.",
    content: JSON.stringify(
      {
        stages: [
          { label: "40% Project start", percentage: 40, triggerType: "PROJECT_START", dueDays: 0, sortOrder: 1 },
          { label: "40% Mid milestone", percentage: 40, triggerType: "MIDPOINT", dueDays: 0, sortOrder: 2 },
          { label: "20% Project handover", percentage: 20, triggerType: "HANDOVER", dueDays: 0, sortOrder: 3 },
        ],
      },
      null,
      2,
    ),
    variablesJson: { format: "json", schema: "stages[{label,percentage,triggerType,dueDays,sortOrder}]" },
  },
  {
    category: TemplateCategory.WHATSAPP,
    code: "WHATSAPP_QUOTATION_SENT",
    title: "WhatsApp: Quotation Sent",
    description: "Short WhatsApp delivery message for quotation.",
    content:
      "Hi {{recipientName}}, here is our quotation {{quotationNumber}} for {{projectName}}.\nSecure link: {{documentLink}}",
    variablesJson: ["recipientName", "quotationNumber", "projectName", "documentLink"],
  },
  {
    category: TemplateCategory.WHATSAPP,
    code: "WHATSAPP_PAYMENT_REMINDER_7",
    title: "WhatsApp: Invoice Reminder (7 DPD)",
    description: "Friendly reminder for overdue invoice.",
    content:
      "Hi {{recipientName}}, friendly reminder invoice {{invoiceNumber}} is overdue. Outstanding: {{amountDue}}.\nSecure link: {{documentLink}}",
    variablesJson: ["recipientName", "invoiceNumber", "amountDue", "documentLink"],
  },
  {
    category: TemplateCategory.EMAIL,
    code: "EMAIL_PRESENTATION_SENT",
    title: "Email: Proposal / Presentation Sent",
    description: "Client email for sending design presentation link.",
    content: JSON.stringify(
      {
        subjectTemplate: "Design presentation for {{projectName}}",
        bodyTemplate:
          "Dear {{recipientName}},\n\nPlease find our design presentation for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\n{{senderName}}",
      },
      null,
      2,
    ),
    variablesJson: ["recipientName", "projectName", "documentLink", "senderName"],
  },
  {
    category: TemplateCategory.PROPOSAL_SECTION,
    code: "PROPOSAL_WHY_CHOOSE_US",
    title: "Proposal: Why Choose Us",
    description: "Premium client-facing positioning block for proposals.",
    content:
      "Why choose us\n" +
      "- Design-led planning with disciplined scope control\n" +
      "- Transparent costing and structured documentation\n" +
      "- Dedicated project coordination and quality checks\n" +
      "- Aftercare mindset: defects and warranty handling with clear timelines\n",
    variablesJson: [],
  },
  {
    category: TemplateCategory.BOQ_ITEM,
    code: "BOQ_HDB_STARTER",
    title: "HDB Renovation BOQ Starter",
    description: "Starter list of common trade headings for HDB renovation. Use as a starting point, not final pricing.",
    content: JSON.stringify(
      {
        trades: [
          "Preliminaries / Protection",
          "Hacking / Demolition",
          "Masonry",
          "Carpentry",
          "Electrical",
          "Plumbing",
          "Ceiling / Partition",
          "Flooring",
          "Painting",
          "Glass / Aluminium",
          "Cleaning / Disposal",
        ],
      },
      null,
      2,
    ),
    variablesJson: { format: "json", schema: "trades[string]" },
  },
  {
    category: TemplateCategory.BOQ_ITEM,
    code: "BOQ_CONDO_STARTER",
    title: "Condo Renovation BOQ Starter",
    description: "Starter list of common trade headings for condo renovation.",
    content: JSON.stringify(
      {
        trades: [
          "Preliminaries / Protection",
          "Hacking / Demolition",
          "Masonry",
          "Carpentry",
          "Electrical",
          "Plumbing",
          "Ceiling / Partition",
          "Flooring",
          "Painting",
          "Glass / Aluminium",
          "Aircon (Allowances)",
          "Cleaning / Disposal",
        ],
      },
      null,
      2,
    ),
    variablesJson: { format: "json", schema: "trades[string]" },
  },
];

export async function ensureDefaultTemplateLibraryItems() {
  await prisma.templateLibraryItem.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({
      category: t.category,
      code: t.code,
      title: t.title,
      description: t.description,
      content: t.content,
      variablesJson: t.variablesJson ?? null,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}

export const getTemplateLibraryItemById = cache(async (id: string) => {
  await ensureDefaultTemplateLibraryItems();
  return prisma.templateLibraryItem.findUnique({ where: { id } });
});

export async function listTemplateLibraryItems(params: {
  category?: TemplateCategory | null;
  q?: string | null;
  isActive?: boolean | null;
  take?: number;
}) {
  await ensureDefaultTemplateLibraryItems();

  const take = params.take ?? 200;
  const q = params.q?.trim() || null;

  const where: any = {};
  if (params.category) where.category = params.category;
  if (typeof params.isActive === "boolean") where.isActive = params.isActive;
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.templateLibraryItem.findMany({
    where,
    orderBy: [{ category: "asc" }, { title: "asc" }],
    take,
  });
}

export async function upsertTemplateLibraryItem(input: {
  id?: string | null;
  category: TemplateCategory;
  code: string;
  title: string;
  description?: string | null;
  content: string;
  variablesJson?: any;
  isActive: boolean;
}): Promise<TemplateLibraryItem> {
  await ensureDefaultTemplateLibraryItems();

  const data = {
    category: input.category,
    code: input.code.trim(),
    title: input.title.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    content: input.content,
    variablesJson: input.variablesJson ?? null,
    isActive: input.isActive,
  };

  if (input.id) {
    return prisma.templateLibraryItem.update({ where: { id: input.id }, data });
  }

  return prisma.templateLibraryItem.create({ data });
}

export async function setTemplateLibraryItemActive(params: { id: string; isActive: boolean }) {
  await ensureDefaultTemplateLibraryItems();
  return prisma.templateLibraryItem.update({
    where: { id: params.id },
    data: { isActive: params.isActive },
  });
}

export function guessTemplateCategoryFromCode(code: string): TemplateCategory | null {
  const c = code.trim().toUpperCase();
  if (c.startsWith("EMAIL_")) return TemplateCategory.EMAIL;
  if (c.startsWith("WHATSAPP_")) return TemplateCategory.WHATSAPP;
  return null;
}

export async function getActiveTemplateLibraryItemByCode(params: {
  category: TemplateCategory;
  code: string;
}) {
  await ensureDefaultTemplateLibraryItems();
  return prisma.templateLibraryItem.findFirst({
    where: { category: params.category, code: params.code, isActive: true },
  });
}

