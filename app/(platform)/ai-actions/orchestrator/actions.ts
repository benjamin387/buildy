"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireExecutive } from "@/lib/rbac/executive";
import { runAIOrchestration } from "@/lib/ai/orchestrator";
import { auditLog } from "@/lib/audit";
import { getOrCreateAIAutomationSetting, updateAIAutomationSetting } from "@/lib/ai/automation-settings";

const AI_AUTOMATION_MODES = ["MANUAL", "ASSISTED", "AUTO_SAFE", "AUTO_FULL"] as const;

const runSchema = z.object({
  dryRun: z.enum(["on"]).optional(),
});

export async function runAIOrchestratorAction(formData: FormData) {
  const user = await requireExecutive();
  const parsed = runSchema.parse({ dryRun: formData.get("dryRun") ? "on" : undefined });

  const summary = await runAIOrchestration({ dryRun: Boolean(parsed.dryRun), actorUserId: user.id });

  await auditLog({
    module: "ai_orchestrator",
    action: "run",
    actorUserId: user.id,
    projectId: null,
    entityType: "AIAutomationSetting",
    entityId: "GLOBAL",
    metadata: summary,
  });

  revalidatePath("/ai-actions/orchestrator");
  revalidatePath("/ai-actions");
  revalidatePath("/command-center");
  redirect("/ai-actions/orchestrator");
}

const updateSchema = z.object({
  mode: z.enum(AI_AUTOMATION_MODES),
  isActive: z.enum(["on"]).optional(),
});

export async function updateAIOrchestratorSettingAction(formData: FormData) {
  const user = await requireExecutive();
  const parsed = updateSchema.parse({
    mode: formData.get("mode"),
    isActive: formData.get("isActive") ? "on" : undefined,
  });

  const current = await getOrCreateAIAutomationSetting();

  await updateAIAutomationSetting({
    automationMode: parsed.mode,
    isActive: Boolean(parsed.isActive),
    allowLeadFollowUp: current.allowLeadFollowUp,
    allowDesignGeneration: current.allowDesignGeneration,
    allowQuotationDrafting: current.allowQuotationDrafting,
    allowPaymentReminder: current.allowPaymentReminder,
    allowCollectionsEscalation: current.allowCollectionsEscalation,
    allowSalesPackageGeneration: current.allowSalesPackageGeneration,
    requireApprovalForQuotations: current.requireApprovalForQuotations,
    requireApprovalForContracts: current.requireApprovalForContracts,
    requireApprovalForInvoices: current.requireApprovalForInvoices,
    requireApprovalForPricingChanges: current.requireApprovalForPricingChanges,
    requireApprovalForLegalEscalation: current.requireApprovalForLegalEscalation,
    updatedBy: user.id,
  });

  await auditLog({
    module: "ai_orchestrator",
    action: "update_setting",
    actorUserId: user.id,
    projectId: null,
    entityType: "AIAutomationSetting",
    entityId: "GLOBAL",
    metadata: { automationMode: parsed.mode, isActive: Boolean(parsed.isActive) },
  });

  revalidatePath("/ai-actions/orchestrator");
  redirect("/ai-actions/orchestrator");
}
