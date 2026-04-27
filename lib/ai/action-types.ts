import "server-only";

export type AIEntityType =
  | "LEAD"
  | "PROJECT"
  | "DESIGN_BRIEF"
  | "DESIGN_AREA"
  | "QUOTATION"
  | "INVOICE"
  | "COLLECTION_CASE"
  | "PLATFORM";

export type AIActionName =
  | "SEND_FIRST_CONTACT_MESSAGE"
  | "SEND_FOLLOW_UP_MESSAGE"
  | "ESCALATE_TO_SENIOR_DESIGNER"
  | "SCHEDULE_SITE_VISIT"
  | "MARK_COLD_LEAD"
  | "GENERATE_LAYOUT_PLAN"
  | "GENERATE_3D_VISUAL"
  | "GENERATE_DESIGN_VARIATIONS"
  | "GENERATE_SALES_PACKAGE"
  | "SEND_QUOTATION"
  | "FOLLOW_UP_QUOTATION"
  | "PROPOSE_UPSELL"
  | "GENERATE_UPSELL_RECOMMENDATION"
  | "GENERATE_CONTRACT"
  | "FLAG_PROJECT_DELAY"
  | "REQUEST_PROGRESS_UPDATE"
  | "SEND_PAYMENT_REMINDER"
  | "ESCALATE_COLLECTION"
  | "CLOSE_COLLECTION_CASE"
  | "FLAG_CASHFLOW_RISK"
  | "SEND_CONTRACT"
  | "CREATE_INVOICE"
  | "CHANGE_PRICING"
  | "APPROVE_VARIATION";

export type AIDecisionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RunAIActionInput = {
  action: AIActionName;
  entityType: AIEntityType;
  entityId: string;
  priority: AIDecisionPriority;
  confidence: number; // 0..1
  reason: string;
  metadata?: Record<string, unknown> | null;
};
