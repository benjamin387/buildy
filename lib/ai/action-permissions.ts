import "server-only";

import type { AIActionName } from "@/lib/ai/action-types";

export type ActionRisk = "LOW" | "MEDIUM" | "HIGH";
export type AIAutomationModeKey = "MANUAL" | "ASSISTED" | "AUTO_SAFE" | "AUTO_FULL";

// Allowlist of actions that can be executed automatically per mode.
// Anything not on the list is treated as approval-gated (even in AUTO_FULL).
const AUTO_SAFE_ALLOWED: ReadonlySet<AIActionName> = new Set([
  "SEND_FIRST_CONTACT_MESSAGE",
  "SEND_FOLLOW_UP_MESSAGE",
  "REQUEST_PROGRESS_UPDATE",
  "GENERATE_LAYOUT_PLAN",
  "GENERATE_3D_VISUAL",
  "GENERATE_DESIGN_VARIATIONS",
  "GENERATE_UPSELL_RECOMMENDATION",
  "CLOSE_COLLECTION_CASE",
]);

const AUTO_FULL_ALLOWED: ReadonlySet<AIActionName> = new Set([
  ...AUTO_SAFE_ALLOWED,
  // Medium-risk but still safe because it only creates drafts or internal records.
  "GENERATE_SALES_PACKAGE",
  "SEND_PAYMENT_REMINDER",
]);

const LOW_RISK: ReadonlySet<AIActionName> = new Set([
  "SEND_FIRST_CONTACT_MESSAGE",
  "SEND_FOLLOW_UP_MESSAGE",
  "REQUEST_PROGRESS_UPDATE",
  "GENERATE_LAYOUT_PLAN",
  "GENERATE_3D_VISUAL",
  "GENERATE_DESIGN_VARIATIONS",
  "GENERATE_UPSELL_RECOMMENDATION",
  "CLOSE_COLLECTION_CASE",
]);

const MEDIUM_RISK: ReadonlySet<AIActionName> = new Set([
  "SEND_PAYMENT_REMINDER",
  "PROPOSE_UPSELL",
  "GENERATE_SALES_PACKAGE",
  "SCHEDULE_SITE_VISIT",
]);

const HIGH_RISK: ReadonlySet<AIActionName> = new Set([
  "SEND_QUOTATION",
  "GENERATE_CONTRACT",
  "SEND_CONTRACT",
  "CREATE_INVOICE",
  "ESCALATE_COLLECTION",
  "CHANGE_PRICING",
  "APPROVE_VARIATION",
]);

export function classifyActionRisk(action: AIActionName): ActionRisk {
  if (HIGH_RISK.has(action)) return "HIGH";
  if (MEDIUM_RISK.has(action)) return "MEDIUM";
  if (LOW_RISK.has(action)) return "LOW";
  // Default to MEDIUM if unknown (safe).
  return "MEDIUM";
}

export function requiresApproval(params: { action: AIActionName; mode: AIAutomationModeKey }): boolean {
  const risk = classifyActionRisk(params.action);
  if (risk === "HIGH") return true;

  // Medium risk: only allow AUTO_FULL execution for a safe subset.
  if (risk === "MEDIUM") return !AUTO_FULL_ALLOWED.has(params.action);

  // Low risk never requires approval; it can still be queued in MANUAL mode.
  return false;
}

export function canAutoExecute(params: { action: AIActionName; mode: AIAutomationModeKey }): boolean {
  if (params.mode === "MANUAL") return false;

  if (params.mode === "ASSISTED") return AUTO_SAFE_ALLOWED.has(params.action);
  if (params.mode === "AUTO_SAFE") return AUTO_SAFE_ALLOWED.has(params.action);
  if (params.mode === "AUTO_FULL") return AUTO_FULL_ALLOWED.has(params.action);
  return false;
}
