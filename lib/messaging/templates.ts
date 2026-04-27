import { prisma } from "@/lib/prisma";
import { MessageChannel } from "@prisma/client";
import { TemplateCategory } from "@prisma/client";
import { getActiveTemplateLibraryItemByCode, guessTemplateCategoryFromCode } from "@/lib/templates/service";

export type TemplateContext = Record<string, string | number | null | undefined>;

export function renderTemplateString(template: string, context: TemplateContext): string {
  return template.replaceAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = context[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

type DefaultTemplate = {
  code: string;
  name: string;
  channel: MessageChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
};

const defaults: DefaultTemplate[] = [
  {
    code: "EMAIL_PORTAL_INVITE",
    name: "Client Portal Invite (Email)",
    channel: "EMAIL",
    subjectTemplate: "Your secure project portal access",
    bodyTemplate:
      "Dear {{recipientName}},\n\nUse the secure link below to access your project portal:\n{{portalLink}}\n\nIf you did not request this, please ignore this message.\n",
  },
  {
    code: "WHATSAPP_PORTAL_INVITE",
    name: "Client Portal Invite (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, here is your secure project portal access link:\n{{portalLink}}\n",
  },
  {
    code: "EMAIL_PRESENTATION_SENT",
    name: "Presentation Sent (Email)",
    channel: "EMAIL",
    subjectTemplate: "Design presentation for {{projectName}}",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease find our design presentation for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\n{{senderName}}",
  },
  {
    code: "WHATSAPP_PRESENTATION_SENT",
    name: "Presentation Sent (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, here is the design presentation for {{projectName}}.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_QUOTATION_SENT",
    name: "Quotation Sent (Email)",
    channel: "EMAIL",
    subjectTemplate: "Quotation {{quotationNumber}} for {{projectName}}",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease find our quotation {{quotationNumber}} for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\n{{senderName}}",
  },
  {
    code: "WHATSAPP_QUOTATION_SENT",
    name: "Quotation Sent (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, here is our quotation {{quotationNumber}} for {{projectName}}.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_CONTRACT_SIGNATURE",
    name: "Contract For Signature (Email)",
    channel: "EMAIL",
    subjectTemplate: "Contract {{contractNumber}} for signature ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease review and sign contract {{contractNumber}} for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\n{{senderName}}",
  },
  {
    code: "WHATSAPP_CONTRACT_SIGNATURE",
    name: "Contract For Signature (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, please review and sign contract {{contractNumber}} for {{projectName}}.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_INVOICE_SENT",
    name: "Invoice Sent (Email)",
    channel: "EMAIL",
    subjectTemplate: "Invoice {{invoiceNumber}} for {{projectName}}",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease find invoice {{invoiceNumber}} for {{projectName}}.\nAmount due: {{amountDue}} · Due date: {{dueDate}}\n\nSecure link: {{documentLink}}\n\nRegards,\nAccounts",
  },
  {
    code: "EMAIL_VARIATION_APPROVAL",
    name: "Variation Order For Approval (Email)",
    channel: "EMAIL",
    subjectTemplate: "Variation Order {{variationNumber}} for approval ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease review and approve Variation Order {{variationNumber}} for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\n{{senderName}}",
  },
  {
    code: "WHATSAPP_VARIATION_APPROVAL",
    name: "Variation Order For Approval (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, please review and approve Variation Order {{variationNumber}} for {{projectName}}.\nSecure link: {{documentLink}}",
  },
  {
    code: "WHATSAPP_INVOICE_SENT",
    name: "Invoice Sent (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, invoice {{invoiceNumber}} for {{projectName}} is ready.\nAmount due: {{amountDue}} · Due: {{dueDate}}\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_PAYMENT_REMINDER_7",
    name: "Payment Reminder 7 DPD (Email)",
    channel: "EMAIL",
    subjectTemplate: "Payment reminder: {{invoiceNumber}} ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nFriendly reminder that invoice {{invoiceNumber}} is overdue.\nOutstanding: {{amountDue}}.\n\nSecure link: {{documentLink}}\n\nRegards,\nAccounts",
  },
  {
    code: "WHATSAPP_PAYMENT_REMINDER_7",
    name: "Payment Reminder 7 DPD (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, friendly reminder invoice {{invoiceNumber}} is overdue. Outstanding: {{amountDue}}.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_PAYMENT_REMINDER_14",
    name: "Payment Reminder 14 DPD (Email)",
    channel: "EMAIL",
    subjectTemplate: "Overdue payment reminder: {{invoiceNumber}} ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nInvoice {{invoiceNumber}} remains unpaid.\nOutstanding: {{amountDue}}.\nPlease arrange payment within 3 days or advise your payment date.\n\nSecure link: {{documentLink}}\n\nRegards,\nAccounts",
  },
  {
    code: "WHATSAPP_PAYMENT_REMINDER_14",
    name: "Payment Reminder 14 DPD (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, invoice {{invoiceNumber}} is still unpaid. Outstanding: {{amountDue}}.\nPlease advise payment date.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_LETTER_OF_DEMAND",
    name: "Letter of Demand Notice (Email)",
    channel: "EMAIL",
    subjectTemplate: "Letter of Demand: {{invoiceNumber}} ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nDespite previous reminders, invoice {{invoiceNumber}} remains unpaid.\nOutstanding: {{amountDue}}.\n\nPlease settle immediately, failing which we may suspend further work and proceed with recovery actions.\n\nSecure link: {{documentLink}}\n\nRegards,\nAccounts",
  },
  {
    code: "WHATSAPP_LETTER_OF_DEMAND",
    name: "Letter of Demand Notice (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, invoice {{invoiceNumber}} remains unpaid. Outstanding: {{amountDue}}.\nPlease settle immediately to avoid escalation.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_PURCHASE_ORDER_SENT",
    name: "Purchase Order Sent (Email)",
    channel: "EMAIL",
    subjectTemplate: "Purchase Order {{poNumber}} ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease find purchase order {{poNumber}} for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\nProcurement",
  },
  {
    code: "WHATSAPP_PURCHASE_ORDER_SENT",
    name: "Purchase Order Sent (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, purchase order {{poNumber}} for {{projectName}}.\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_SUBCONTRACT_SENT",
    name: "Subcontract Sent (Email)",
    channel: "EMAIL",
    subjectTemplate: "Subcontract {{subcontractTitle}} ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease find the subcontract for {{projectName}}.\nScope: {{subcontractTitle}}\n\nSecure link: {{documentLink}}\n\nRegards,\nProject Team",
  },
  {
    code: "WHATSAPP_SUBCONTRACT_SENT",
    name: "Subcontract Sent (WhatsApp)",
    channel: "WHATSAPP",
    subjectTemplate: null,
    bodyTemplate:
      "Hi {{recipientName}}, subcontract for {{projectName}} ({{subcontractTitle}}).\nSecure link: {{documentLink}}",
  },
  {
    code: "EMAIL_SUPPLIER_BILL_SENT",
    name: "Supplier Bill Sent (Email)",
    channel: "EMAIL",
    subjectTemplate: "Supplier bill {{billNumber}} ({{projectName}})",
    bodyTemplate:
      "Dear {{recipientName}},\n\nPlease find supplier bill {{billNumber}} for {{projectName}}.\n\nSecure link: {{documentLink}}\n\nRegards,\nAccounts Payable",
  },
];

export async function ensureDefaultMessageTemplates() {
  await prisma.messageTemplate.createMany({
    data: defaults.map((t) => ({
      code: t.code,
      name: t.name,
      channel: t.channel,
      subjectTemplate: t.subjectTemplate,
      bodyTemplate: t.bodyTemplate,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}

export async function getActiveTemplateByCode(code: string) {
  await ensureDefaultMessageTemplates();
  const existing = await prisma.messageTemplate.findFirst({
    where: { code, isActive: true },
  });
  if (existing) return existing;

  const cat = guessTemplateCategoryFromCode(code);
  if (!cat || (cat !== TemplateCategory.EMAIL && cat !== TemplateCategory.WHATSAPP)) return null;

  const fallback = await getActiveTemplateLibraryItemByCode({ category: cat, code });
  if (!fallback) return null;

  // Represent TemplateLibraryItem as a MessageTemplate-like object for rendering.
  // EMAIL templates may store JSON with { subjectTemplate, bodyTemplate } in content.
  if (cat === TemplateCategory.EMAIL) {
    const parsed = safeParseEmailJson(fallback.content);
    return {
      code: fallback.code,
      name: fallback.title,
      channel: "EMAIL" as MessageChannel,
      subjectTemplate: parsed?.subjectTemplate ?? null,
      bodyTemplate: parsed?.bodyTemplate ?? fallback.content,
      isActive: fallback.isActive,
    } as any;
  }

  return {
    code: fallback.code,
    name: fallback.title,
    channel: "WHATSAPP" as MessageChannel,
    subjectTemplate: null,
    bodyTemplate: fallback.content,
    isActive: fallback.isActive,
  } as any;
}

export async function renderTemplateByCode(code: string, context: TemplateContext) {
  const tpl = await getActiveTemplateByCode(code);
  if (!tpl) {
    return { subject: null, body: "" };
  }

  const subject = tpl.subjectTemplate ? renderTemplateString(tpl.subjectTemplate, context) : null;
  const body = renderTemplateString(tpl.bodyTemplate, context);
  return { subject, body };
}

function safeParseEmailJson(input: string): { subjectTemplate: string | null; bodyTemplate: string } | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("{")) return null;
  try {
    const v = JSON.parse(raw) as any;
    if (!v || typeof v !== "object") return null;
    const subjectTemplate = typeof v.subjectTemplate === "string" ? v.subjectTemplate : null;
    const bodyTemplate = typeof v.bodyTemplate === "string" ? v.bodyTemplate : null;
    if (!bodyTemplate) return null;
    return { subjectTemplate, bodyTemplate };
  } catch {
    return null;
  }
}
