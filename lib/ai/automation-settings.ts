import "server-only";

import { prisma } from "@/lib/prisma";
import type { AIAutomationModeKey } from "@/lib/ai/action-permissions";

export const GLOBAL_AI_AUTOMATION_SETTING_ID = "GLOBAL" as const;

export const AI_AUTOMATION_MODES = ["MANUAL", "ASSISTED", "AUTO_SAFE", "AUTO_FULL"] as const;

export type AIAutomationSettingRow = {
  id: string;
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

  updatedBy: string | null;
  lastRunAt: Date | null;
  lastRunSummary: unknown | null;
  createdAt: Date;
  updatedAt: Date;
};

const prismaAny = prisma as unknown as Record<string, any>;

function getDelegate() {
  return prismaAny.aIAutomationSetting ?? prismaAny.aiAutomationSetting ?? null;
}

export async function getOrCreateAIAutomationSetting(): Promise<AIAutomationSettingRow> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma delegate for AIAutomationSetting not found. Run prisma generate.");
  }

  // Singleton row.
  return (await delegate.upsert({
    where: { id: GLOBAL_AI_AUTOMATION_SETTING_ID },
    update: {},
    create: { id: GLOBAL_AI_AUTOMATION_SETTING_ID, automationMode: "ASSISTED", isActive: true },
  })) as AIAutomationSettingRow;
}

export async function updateAIAutomationSetting(params: {
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
  updatedBy: string | null;
}): Promise<AIAutomationSettingRow> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma delegate for AIAutomationSetting not found. Run prisma generate.");
  }

  return (await delegate.upsert({
    where: { id: GLOBAL_AI_AUTOMATION_SETTING_ID },
    create: { id: GLOBAL_AI_AUTOMATION_SETTING_ID, ...params },
    update: { ...params },
  })) as AIAutomationSettingRow;
}

export async function updateAIAutomationLastRun(params: {
  summary: unknown;
}): Promise<AIAutomationSettingRow> {
  const delegate = getDelegate();
  if (!delegate) {
    throw new Error("Prisma delegate for AIAutomationSetting not found. Run prisma generate.");
  }

  return (await delegate.update({
    where: { id: GLOBAL_AI_AUTOMATION_SETTING_ID },
    data: {
      lastRunAt: new Date(),
      lastRunSummary: params.summary as any,
    },
  })) as AIAutomationSettingRow;
}
