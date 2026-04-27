"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireExecutive } from "@/lib/rbac/executive";
import { auditLog } from "@/lib/audit";
import { updateAIAutomationSetting } from "@/lib/ai/automation-settings";

const AI_AUTOMATION_MODES = ["MANUAL", "ASSISTED", "AUTO_SAFE", "AUTO_FULL"] as const;

const schema = z.object({
  automationMode: z.enum(AI_AUTOMATION_MODES),
  isActive: z.enum(["on"]).optional(),

  allowLeadFollowUp: z.enum(["on"]).optional(),
  allowDesignGeneration: z.enum(["on"]).optional(),
  allowQuotationDrafting: z.enum(["on"]).optional(),
  allowPaymentReminder: z.enum(["on"]).optional(),
  allowCollectionsEscalation: z.enum(["on"]).optional(),
  allowSalesPackageGeneration: z.enum(["on"]).optional(),

  requireApprovalForQuotations: z.enum(["on"]).optional(),
  requireApprovalForContracts: z.enum(["on"]).optional(),
  requireApprovalForInvoices: z.enum(["on"]).optional(),
  requireApprovalForPricingChanges: z.enum(["on"]).optional(),
  requireApprovalForLegalEscalation: z.enum(["on"]).optional(),
});

function toBool(v: "on" | undefined): boolean {
  return Boolean(v);
}

export async function updateAIControlCenterAction(formData: FormData) {
  const user = await requireExecutive();

  const parsed = schema.parse({
    automationMode: formData.get("automationMode"),
    isActive: formData.get("isActive") ? "on" : undefined,

    allowLeadFollowUp: formData.get("allowLeadFollowUp") ? "on" : undefined,
    allowDesignGeneration: formData.get("allowDesignGeneration") ? "on" : undefined,
    allowQuotationDrafting: formData.get("allowQuotationDrafting") ? "on" : undefined,
    allowPaymentReminder: formData.get("allowPaymentReminder") ? "on" : undefined,
    allowCollectionsEscalation: formData.get("allowCollectionsEscalation") ? "on" : undefined,
    allowSalesPackageGeneration: formData.get("allowSalesPackageGeneration") ? "on" : undefined,

    requireApprovalForQuotations: formData.get("requireApprovalForQuotations") ? "on" : undefined,
    requireApprovalForContracts: formData.get("requireApprovalForContracts") ? "on" : undefined,
    requireApprovalForInvoices: formData.get("requireApprovalForInvoices") ? "on" : undefined,
    requireApprovalForPricingChanges: formData.get("requireApprovalForPricingChanges") ? "on" : undefined,
    requireApprovalForLegalEscalation: formData.get("requireApprovalForLegalEscalation") ? "on" : undefined,
  });

  await updateAIAutomationSetting({
    automationMode: parsed.automationMode,
    isActive: toBool(parsed.isActive),
    allowLeadFollowUp: toBool(parsed.allowLeadFollowUp),
    allowDesignGeneration: toBool(parsed.allowDesignGeneration),
    allowQuotationDrafting: toBool(parsed.allowQuotationDrafting),
    allowPaymentReminder: toBool(parsed.allowPaymentReminder),
    allowCollectionsEscalation: toBool(parsed.allowCollectionsEscalation),
    allowSalesPackageGeneration: toBool(parsed.allowSalesPackageGeneration),
    requireApprovalForQuotations: toBool(parsed.requireApprovalForQuotations),
    requireApprovalForContracts: toBool(parsed.requireApprovalForContracts),
    requireApprovalForInvoices: toBool(parsed.requireApprovalForInvoices),
    requireApprovalForPricingChanges: toBool(parsed.requireApprovalForPricingChanges),
    requireApprovalForLegalEscalation: toBool(parsed.requireApprovalForLegalEscalation),
    updatedBy: user.id,
  });

  await auditLog({
    module: "ai_control_center",
    action: "update_setting",
    actorUserId: user.id,
    projectId: null,
    entityType: "AIAutomationSetting",
    entityId: "GLOBAL",
    metadata: parsed,
  });

  revalidatePath("/ai-control-center");
  revalidatePath("/ai-actions");
  revalidatePath("/ai-actions/orchestrator");
  revalidatePath("/dashboard");
  revalidatePath("/command-center");
  redirect("/ai-control-center");
}
