import "server-only";

/**
 * Decision Rules Library
 * ----------------------
 * Deterministic, production-grade business rules that return suggested next actions.
 * No execution, no Prisma access, no UI.
 *
 * Each rule returns:
 * { action, priority, confidence, reason }
 */

export type DecisionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DecisionAction = {
  action: string;
  priority: DecisionPriority;
  confidence: number; // 0..1
  reason: string;
};

export type LeadDecisionContext = {
  status: "NEW" | "CONTACTED" | "QUALIFYING" | "SITE_VISIT_SCHEDULED" | "QUOTATION_PENDING" | "CONVERTED" | "LOST";
  createdAt: Date;
  projectAddress?: string | null;
  projectType?: "RESIDENTIAL" | "COMMERCIAL" | null;
  propertyCategory?: "RESIDENTIAL" | "COMMERCIAL" | null;
  residentialPropertyType?: "HDB" | "CONDO" | "LANDED" | null;
  requirementSummary?: string | null;
  notes?: string | null;
  lastActivityAt?: Date | null;
  noActivityDays?: number | null;
  clientResponded?: boolean | null;
};

export type DesignWorkflowDecisionContext = {
  designBriefId: string;
  status:
    | "DRAFT"
    | "DESIGN_IN_PROGRESS"
    | "QS_IN_PROGRESS"
    | "READY_FOR_QUOTATION"
    | "SALES_PACKAGE_READY"
    | "PRESENTATION_READY"
    | "SENT_TO_CLIENT"
    | "APPROVED"
    | "REJECTED";
  areas: Array<{
    areaId: string;
    name: string;
    hasLayoutPlan: boolean;
    visualRenderCount: number;
    hasAnyVisualRender: boolean;
    hasQsBoqDraftItems: boolean;
  }>;
};

export type QuotationDecisionContext = {
  status:
    | "DRAFT"
    | "CALCULATED"
    | "PREPARED"
    | "SENT"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED"
    | "CANCELLED";
  createdAt: Date;
  sentAt?: Date | null;
  clientViewedQuotation?: boolean | null;
  clientTimeSpentSeconds?: number | null;
  clientRespondedPositively?: boolean | null;
  projectType?: "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER" | null;
  designStyle?: "MODERN" | "MINIMALIST" | "INDUSTRIAL" | "SCANDINAVIAN" | "CONTEMPORARY" | "OTHERS" | null;
};

export type ProjectExecutionDecisionContext = {
  status: "LEAD" | "QUOTING" | "CONTRACTED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
  targetCompletionDate?: Date | null;
  actualCompletionDate?: Date | null;
  lastProgressLogAt?: Date | null;
};

export type InvoiceCollectionsDecisionContext = {
  status:
    | "DRAFT"
    | "ISSUED"
    | "SENT"
    | "VIEWED"
    | "PARTIALLY_PAID"
    | "PAID"
    | "OVERDUE"
    | "VOID";
  dueDate?: Date | null;
  outstandingAmount: number;
  overdueDays?: number | null;
};

export type CashflowDecisionContext = {
  expectedInflow: number;
  expectedOutflow: number;
};

export type DecisionRulesInput = {
  now?: Date;
  lead?: LeadDecisionContext;
  design?: DesignWorkflowDecisionContext;
  quotation?: QuotationDecisionContext;
  project?: ProjectExecutionDecisionContext;
  invoice?: InvoiceCollectionsDecisionContext;
  cashflow?: CashflowDecisionContext;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function action(action: string, priority: DecisionPriority, confidence: number, reason: string): DecisionAction {
  return {
    action,
    priority,
    confidence: clamp01(confidence),
    reason: reason.trim(),
  };
}

function diffDays(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function olderThanDays(date: Date, days: number, now: Date): boolean {
  return diffDays(now, date) > days;
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Singapore-centric heuristic budget extraction (SGD).
 * - Supports "$80k", "80k", "80000", "$80,000"
 * - Returns the maximum detected numeric value (SGD).
 */
export function extractBudgetSgd(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  const matches: number[] = [];

  // 80k / $80k / 80 k
  for (const m of t.matchAll(/(?:S?\$)?\s*(\d{1,3}(?:\.\d+)?)\s*k\b/gi)) {
    const base = safeNumber(m[1]);
    if (base !== null) matches.push(base * 1000);
  }

  // 80,000 / $80,000 / 80000
  for (const m of t.matchAll(/(?:S?\$)?\s*(\d{2,3}(?:,\d{3})+|\d{5,6})\b/g)) {
    const raw = m[1].replaceAll(",", "");
    const n = safeNumber(raw);
    if (n !== null) matches.push(n);
  }

  if (matches.length === 0) return null;
  return Math.max(...matches.map((x) => Math.round(x)));
}

export function evaluateLeadRules(ctx: LeadDecisionContext, now = new Date()): DecisionAction[] {
  const out: DecisionAction[] = [];

  const createdOlderThan1Day = olderThanDays(ctx.createdAt, 1, now);
  const lastActivityAt = ctx.lastActivityAt ?? null;
  const noActivityDays =
    ctx.noActivityDays ??
    (lastActivityAt ? Math.max(0, diffDays(now, lastActivityAt)) : Math.max(0, diffDays(now, ctx.createdAt)));

  const hasAddress = Boolean((ctx.projectAddress ?? "").trim());
  const clientResponded = Boolean(ctx.clientResponded);

  const text = [ctx.requirementSummary ?? "", ctx.notes ?? ""].join("\n").trim();
  const budget = extractBudgetSgd(text);

  const isCommercial = ctx.projectType === "COMMERCIAL" || ctx.propertyCategory === "COMMERCIAL";
  const isLanded = ctx.residentialPropertyType === "LANDED";

  // Rule: New Lead Not Contacted
  if (ctx.status === "NEW" && createdOlderThan1Day) {
    out.push(
      action(
        "SEND_FIRST_CONTACT_MESSAGE",
        "HIGH",
        0.85,
        "Lead is NEW and was not contacted within 24 hours.",
      ),
    );
  }

  // Rule: No Reply After Contact
  if (ctx.status === "CONTACTED" && noActivityDays > 3) {
    out.push(
      action(
        "SEND_FOLLOW_UP_MESSAGE",
        "HIGH",
        0.82,
        `Lead is CONTACTED but has no activity for ${noActivityDays} days.`,
      ),
    );
  }

  // Rule: High Value Lead
  if ((isCommercial || isLanded) && (budget ?? 0) > 80000) {
    out.push(
      action(
        "ESCALATE_TO_SENIOR_DESIGNER",
        "HIGH",
        0.76,
        `High value lead detected: ${(isCommercial ? "COMMERCIAL" : "LANDED")} with budget ${budget?.toLocaleString?.("en-SG") ?? ">"}.`,
      ),
    );
  }

  // Rule: Ready for Site Visit
  if (hasAddress && clientResponded && ctx.status !== "CONVERTED" && ctx.status !== "LOST") {
    out.push(
      action(
        "SCHEDULE_SITE_VISIT",
        "HIGH",
        0.78,
        "Client responded and project address is available; schedule a site visit to confirm scope and measurements.",
      ),
    );
  }

  // Rule: Cold Lead
  if (noActivityDays > 7 && ctx.status !== "CONVERTED" && ctx.status !== "LOST") {
    out.push(
      action(
        "MARK_COLD_LEAD",
        "LOW",
        0.7,
        `No lead activity for ${noActivityDays} days; mark as cold and move to low-touch follow-up.`,
      ),
    );
  }

  return out;
}

export function evaluateDesignWorkflowRules(ctx: DesignWorkflowDecisionContext): DecisionAction[] {
  const out: DecisionAction[] = [];

  const areas = ctx.areas ?? [];
  const anyAreaMissingLayout = areas.some((a) => !a.hasLayoutPlan);
  const anyAreaMissingVisual = areas.some((a) => a.hasLayoutPlan && !a.hasAnyVisualRender);
  const anyAreaVisualsUnder3 = areas.some((a) => a.hasAnyVisualRender && a.visualRenderCount < 3);
  const allAreasReady =
    areas.length > 0 &&
    areas.every((a) => a.hasLayoutPlan && a.hasAnyVisualRender && a.hasQsBoqDraftItems);

  // Rule: Missing Layout
  if (areas.length > 0 && anyAreaMissingLayout) {
    out.push(
      action(
        "GENERATE_LAYOUT_PLAN",
        "HIGH",
        0.82,
        "Design brief has areas missing a layout plan; drafter should generate/select layout to unblock 3D and QS.",
      ),
    );
  }

  // Rule: Missing Visual
  if (areas.length > 0 && anyAreaMissingVisual) {
    out.push(
      action(
        "GENERATE_3D_VISUAL",
        "HIGH",
        0.8,
        "Layout plan exists but 3D visuals are missing for one or more areas; generate visuals to support presentation and BOQ.",
      ),
    );
  }

  // Rule: Generate Multiple Options
  if (areas.length > 0 && anyAreaVisualsUnder3) {
    out.push(
      action(
        "GENERATE_DESIGN_VARIATIONS",
        "MEDIUM",
        0.72,
        "Fewer than 3 visual options exist for one or more areas; generate variations (Option A/B/C) for better client selection.",
      ),
    );
  }

  // Rule: Design Ready
  if (allAreasReady && (ctx.status === "READY_FOR_QUOTATION" || ctx.status === "QS_IN_PROGRESS" || ctx.status === "DESIGN_IN_PROGRESS")) {
    out.push(
      action(
        "GENERATE_SALES_PACKAGE",
        "HIGH",
        0.84,
        "Layout, visuals, and QS BOQ drafts exist across areas; generate sales package (quotation draft + presentation).",
      ),
    );
  }

  return out;
}

export function evaluateQuotationRules(ctx: QuotationDecisionContext, now = new Date()): DecisionAction[] {
  const out: DecisionAction[] = [];

  // Rule: Quotation Not Sent
  if (ctx.status === "DRAFT" && olderThanDays(ctx.createdAt, 2, now)) {
    out.push(
      action(
        "SEND_QUOTATION",
        "HIGH",
        0.82,
        "Quotation is still DRAFT more than 2 days after creation; send to client to progress the sale.",
      ),
    );
  }

  // Rule: No Response After Quotation
  const sentAt = ctx.sentAt ?? null;
  if (ctx.status === "SENT" && sentAt && olderThanDays(sentAt, 3, now)) {
    out.push(
      action(
        "FOLLOW_UP_QUOTATION",
        "HIGH",
        0.8,
        "Quotation was sent more than 3 days ago with no recorded response; follow up to close gaps and secure acceptance.",
      ),
    );
  }

  // Rule: Strong Interest
  const viewed = Boolean(ctx.clientViewedQuotation);
  const timeSpent = Math.max(0, ctx.clientTimeSpentSeconds ?? 0);
  const interestThreshold = 90; // seconds
  if (viewed && timeSpent >= interestThreshold) {
    out.push(
      action(
        "PROPOSE_UPSELL",
        "HIGH",
        0.73,
        `Client viewed quotation and spent ~${Math.round(timeSpent)}s; propose upsell options while engagement is high.`,
      ),
    );
  }

  // Rule: Upsell Opportunity
  const projectType = ctx.projectType ?? null;
  const style = ctx.designStyle ?? null;
  const isUpsellProject = projectType === "CONDO" || projectType === "LANDED";
  const isUpsellStyle = style === "MODERN" || style === "SCANDINAVIAN";
  if (isUpsellProject && isUpsellStyle) {
    out.push(
      action(
        "GENERATE_UPSELL_RECOMMENDATION",
        "MEDIUM",
        0.7,
        "Project type and design style indicate strong upsell potential (smart home, lighting, feature walls, carpentry upgrades).",
      ),
    );
  }

  // Rule: Ready to Close
  if (ctx.status === "SENT" && ctx.clientRespondedPositively) {
    out.push(
      action(
        "GENERATE_CONTRACT",
        "CRITICAL",
        0.86,
        "Client responded positively to a sent quotation; generate contract immediately to secure commitment and timeline.",
      ),
    );
  }

  return out;
}

export function evaluateProjectExecutionRules(ctx: ProjectExecutionDecisionContext, now = new Date()): DecisionAction[] {
  const out: DecisionAction[] = [];

  const isCompleted = ctx.status === "COMPLETED" || Boolean(ctx.actualCompletionDate);
  const target = ctx.targetCompletionDate ?? null;

  // Rule: Project Delay
  if (!isCompleted && target && now > target) {
    out.push(
      action(
        "FLAG_PROJECT_DELAY",
        "HIGH",
        0.86,
        "Current date is past target completion date and project is not completed; flag as delayed for corrective action.",
      ),
    );
  }

  // Rule: Missing Progress Update
  const lastLogAt = ctx.lastProgressLogAt ?? null;
  if (!isCompleted && lastLogAt && olderThanDays(lastLogAt, 3, now)) {
    out.push(
      action(
        "REQUEST_PROGRESS_UPDATE",
        "MEDIUM",
        0.78,
        "No project progress log in the last 3 days; request an update to maintain delivery control.",
      ),
    );
  }

  return out;
}

export function evaluateFinancialCollectionRules(ctx: InvoiceCollectionsDecisionContext, now = new Date()): DecisionAction[] {
  const out: DecisionAction[] = [];

  const dueDate = ctx.dueDate ?? null;
  const outstanding = Math.max(0, ctx.outstandingAmount);
  const overdueDays =
    ctx.overdueDays ??
    (dueDate && dueDate < now ? Math.max(0, diffDays(now, dueDate)) : 0);

  // Rule: Invoice Overdue
  if (outstanding > 0.01 && dueDate && dueDate < now) {
    out.push(
      action(
        "SEND_PAYMENT_REMINDER",
        "HIGH",
        0.84,
        `Invoice is overdue by ${overdueDays} days with outstanding amount > 0.`,
      ),
    );
  }

  // Rule: Severe Overdue
  if (outstanding > 0.01 && overdueDays > 30) {
    out.push(
      action(
        "ESCALATE_COLLECTION",
        "CRITICAL",
        0.88,
        `Invoice is severely overdue (> 30 days, DPD=${overdueDays}); escalate collections (LOD/legal review).`,
      ),
    );
  }

  // Rule: Payment Received
  if (outstanding <= 0.01 && ctx.status !== "VOID") {
    out.push(
      action(
        "CLOSE_COLLECTION_CASE",
        "LOW",
        0.9,
        "Invoice outstanding amount is 0; close/mark paid any open collection case.",
      ),
    );
  }

  return out;
}

export function evaluateCashflowRules(ctx: CashflowDecisionContext): DecisionAction[] {
  const out: DecisionAction[] = [];
  const inflow = Math.max(0, ctx.expectedInflow);
  const outflow = Math.max(0, ctx.expectedOutflow);

  // Rule: Cashflow Risk
  if (inflow > 0 && outflow > inflow * 1.3) {
    out.push(
      action(
        "FLAG_CASHFLOW_RISK",
        "HIGH",
        0.8,
        "Expected outflows exceed expected inflows by more than 30%; flag cashflow risk and prioritize collections/cost control.",
      ),
    );
  }

  return out;
}

/**
 * Evaluate all supplied contexts and return a flattened list of actions.
 * Caller is responsible for de-duplication, throttling, and execution governance.
 */
export function evaluateDecisionRules(input: DecisionRulesInput): DecisionAction[] {
  const now = input.now ?? new Date();
  const out: DecisionAction[] = [];

  if (input.lead) out.push(...evaluateLeadRules(input.lead, now));
  if (input.design) out.push(...evaluateDesignWorkflowRules(input.design));
  if (input.quotation) out.push(...evaluateQuotationRules(input.quotation, now));
  if (input.project) out.push(...evaluateProjectExecutionRules(input.project, now));
  if (input.invoice) out.push(...evaluateFinancialCollectionRules(input.invoice, now));
  if (input.cashflow) out.push(...evaluateCashflowRules(input.cashflow));

  return out;
}

