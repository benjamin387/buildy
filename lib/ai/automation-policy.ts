import "server-only";

import type { AIActionName } from "@/lib/ai/action-types";
import { canAutoExecute as canAutoExecuteByMode, requiresApproval as requiresApprovalByMode } from "@/lib/ai/action-permissions";
import type { AIAutomationModeKey } from "@/lib/ai/action-permissions";

export type AIAutomationSettingLike = {
  automationMode: AIAutomationModeKey;
  isActive: boolean;
  allowLeadFollowUp: boolean;
  allowDesignGeneration: boolean;
  allowQuotationDrafting: boolean;
  allowPaymentReminder: boolean;
  allowCollectionsEscalation: boolean;
  allowSalesPackageGeneration: boolean;
  requireApprovalForQuotations: boolean;
  requireApprovalForContracts: boolean;
  requireApprovalForInvoices: boolean;
  requireApprovalForPricingChanges: boolean;
  requireApprovalForLegalEscalation: boolean;
};

export type ActionPolicy = {
  allowed: boolean;
  requiresApproval: boolean;
  canAutoExecute: boolean;
  blockedReason?: string;
};

export const DEFAULT_AI_AUTOMATION_SETTING: AIAutomationSettingLike = {
  automationMode: "ASSISTED",
  isActive: true,
  allowLeadFollowUp: true,
  allowDesignGeneration: true,
  allowQuotationDrafting: true,
  allowPaymentReminder: true,
  allowCollectionsEscalation: true,
  allowSalesPackageGeneration: true,
  requireApprovalForQuotations: true,
  requireApprovalForContracts: true,
  requireApprovalForInvoices: true,
  requireApprovalForPricingChanges: true,
  requireApprovalForLegalEscalation: true,
};

export function normalizeAIAutomationSetting(input: Partial<AIAutomationSettingLike> | null | undefined): AIAutomationSettingLike {
  const x = input ?? {};
  return {
    automationMode: (x.automationMode ?? DEFAULT_AI_AUTOMATION_SETTING.automationMode) as AIAutomationModeKey,
    isActive: typeof x.isActive === "boolean" ? x.isActive : DEFAULT_AI_AUTOMATION_SETTING.isActive,
    allowLeadFollowUp: typeof x.allowLeadFollowUp === "boolean" ? x.allowLeadFollowUp : DEFAULT_AI_AUTOMATION_SETTING.allowLeadFollowUp,
    allowDesignGeneration: typeof x.allowDesignGeneration === "boolean" ? x.allowDesignGeneration : DEFAULT_AI_AUTOMATION_SETTING.allowDesignGeneration,
    allowQuotationDrafting: typeof x.allowQuotationDrafting === "boolean" ? x.allowQuotationDrafting : DEFAULT_AI_AUTOMATION_SETTING.allowQuotationDrafting,
    allowPaymentReminder: typeof x.allowPaymentReminder === "boolean" ? x.allowPaymentReminder : DEFAULT_AI_AUTOMATION_SETTING.allowPaymentReminder,
    allowCollectionsEscalation: typeof x.allowCollectionsEscalation === "boolean" ? x.allowCollectionsEscalation : DEFAULT_AI_AUTOMATION_SETTING.allowCollectionsEscalation,
    allowSalesPackageGeneration: typeof x.allowSalesPackageGeneration === "boolean" ? x.allowSalesPackageGeneration : DEFAULT_AI_AUTOMATION_SETTING.allowSalesPackageGeneration,
    requireApprovalForQuotations: typeof x.requireApprovalForQuotations === "boolean" ? x.requireApprovalForQuotations : DEFAULT_AI_AUTOMATION_SETTING.requireApprovalForQuotations,
    requireApprovalForContracts: typeof x.requireApprovalForContracts === "boolean" ? x.requireApprovalForContracts : DEFAULT_AI_AUTOMATION_SETTING.requireApprovalForContracts,
    requireApprovalForInvoices: typeof x.requireApprovalForInvoices === "boolean" ? x.requireApprovalForInvoices : DEFAULT_AI_AUTOMATION_SETTING.requireApprovalForInvoices,
    requireApprovalForPricingChanges: typeof x.requireApprovalForPricingChanges === "boolean" ? x.requireApprovalForPricingChanges : DEFAULT_AI_AUTOMATION_SETTING.requireApprovalForPricingChanges,
    requireApprovalForLegalEscalation: typeof x.requireApprovalForLegalEscalation === "boolean" ? x.requireApprovalForLegalEscalation : DEFAULT_AI_AUTOMATION_SETTING.requireApprovalForLegalEscalation,
  };
}

const HARD_APPROVAL: ReadonlySet<AIActionName> = new Set([
  "SEND_CONTRACT",
  "CREATE_INVOICE",
  "CHANGE_PRICING",
  "APPROVE_VARIATION",
  "ESCALATE_COLLECTION",
  "GENERATE_CONTRACT",
  "SEND_QUOTATION",
]);

function categoryAllowed(setting: AIAutomationSettingLike, action: AIActionName): { ok: boolean; reason?: string } {
  // Leads
  if (action === "SEND_FIRST_CONTACT_MESSAGE" || action === "SEND_FOLLOW_UP_MESSAGE") {
    return setting.allowLeadFollowUp ? { ok: true } : { ok: false, reason: "Lead follow-up is disabled in AI Control Center." };
  }

  // Design generation
  if (action === "GENERATE_LAYOUT_PLAN" || action === "GENERATE_3D_VISUAL" || action === "GENERATE_DESIGN_VARIATIONS") {
    return setting.allowDesignGeneration ? { ok: true } : { ok: false, reason: "Design generation is disabled in AI Control Center." };
  }

  // Quotation / sales follow-ups
  if (action === "SEND_QUOTATION" || action === "FOLLOW_UP_QUOTATION") {
    return setting.allowQuotationDrafting ? { ok: true } : { ok: false, reason: "Quotation drafting/follow-up is disabled in AI Control Center." };
  }

  // Sales package generation (quotation draft + presentation)
  if (action === "GENERATE_SALES_PACKAGE") {
    return setting.allowSalesPackageGeneration ? { ok: true } : { ok: false, reason: "Sales package generation is disabled in AI Control Center." };
  }

  // Payment reminders (draft only)
  if (action === "SEND_PAYMENT_REMINDER") {
    return setting.allowPaymentReminder ? { ok: true } : { ok: false, reason: "Payment reminders are disabled in AI Control Center." };
  }

  // Collections escalation
  if (action === "ESCALATE_COLLECTION") {
    return setting.allowCollectionsEscalation ? { ok: true } : { ok: false, reason: "Collections escalation is disabled in AI Control Center." };
  }

  // Upsell / project updates are treated as part of sales/design tooling.
  if (action === "GENERATE_UPSELL_RECOMMENDATION" || action === "PROPOSE_UPSELL") {
    return setting.allowSalesPackageGeneration ? { ok: true } : { ok: false, reason: "Sales/upsell tooling is disabled in AI Control Center." };
  }

  // Everything else defaults to allowed (still may be approval-gated).
  return { ok: true };
}

function requiresApprovalBySetting(setting: AIAutomationSettingLike, action: AIActionName): boolean {
  if (setting.requireApprovalForPricingChanges && action === "CHANGE_PRICING") return true;
  if (setting.requireApprovalForLegalEscalation && action === "ESCALATE_COLLECTION") return true;

  if (setting.requireApprovalForQuotations && (action === "SEND_QUOTATION" || action === "FOLLOW_UP_QUOTATION")) return true;
  if (setting.requireApprovalForContracts && (action === "GENERATE_CONTRACT" || action === "SEND_CONTRACT")) return true;
  if (setting.requireApprovalForInvoices && action === "CREATE_INVOICE") return true;

  return false;
}

export function buildActionPolicy(params: { setting: Partial<AIAutomationSettingLike> | null | undefined; action: AIActionName }) : ActionPolicy {
  const setting = normalizeAIAutomationSetting(params.setting);
  const action = params.action;

  const cat = categoryAllowed(setting, action);
  if (!cat.ok) {
    return { allowed: false, requiresApproval: true, canAutoExecute: false, blockedReason: cat.reason };
  }

  const mode = setting.automationMode ?? "ASSISTED";
  const approval = HARD_APPROVAL.has(action) || requiresApprovalByMode({ action, mode }) || requiresApprovalBySetting(setting, action);
  const autoExec = !approval && setting.isActive && canAutoExecuteByMode({ action, mode });

  return { allowed: true, requiresApproval: approval, canAutoExecute: autoExec };
}
