import "server-only";

type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type BidIntelligenceAlert = {
  severity: Exclude<Severity, "NONE">;
  title: string;
  description?: string;
};

export type BidIntelligence = {
  tenderFitScore: number; // 0-100
  bidNoBidScore: number; // 0-100 (higher = stronger case to bid)
  readinessScore: number; // 0-100 (documents + approvals readiness)
  closingRisk: {
    severity: Severity;
    daysLeft: number | null;
    message: string;
  };
  alerts: BidIntelligenceAlert[];
  summary: {
    headline: string;
    bullets: string[];
    nextActions: string[];
  };
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export type TenderFitLabel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export function deriveTenderFitLabel(score: number): TenderFitLabel {
  if (!Number.isFinite(score)) return "UNKNOWN";
  if (score >= 75) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

function toNumber(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function safePct(m: unknown): number | null {
  const x = toNumber(m);
  if (!Number.isFinite(x)) return null;
  return x * 100;
}

function normalizeText(...parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function computeClosingRisk(closingDate: Date | null | undefined, now = new Date()): BidIntelligence["closingRisk"] {
  if (!closingDate) {
    return { severity: "MEDIUM", daysLeft: null, message: "Closing date missing. Verify GeBIZ timeline." };
  }
  const ms = closingDate.getTime() - now.getTime();
  const daysLeft = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { severity: "CRITICAL", daysLeft, message: "Closing date has passed." };
  if (daysLeft <= 1) return { severity: "CRITICAL", daysLeft, message: "Closing within 48 hours. Submission risk is critical." };
  if (daysLeft <= 3) return { severity: "HIGH", daysLeft, message: "Closing within 3 days. Escalate approvals and checklist." };
  if (daysLeft <= 7) return { severity: "MEDIUM", daysLeft, message: "Closing within 7 days. Tighten bid readiness." };
  if (daysLeft <= 14) return { severity: "LOW", daysLeft, message: "Closing within 14 days. Plan submission timeline." };
  return { severity: "NONE", daysLeft, message: "Closing date is not imminent." };
}

function computeTenderFitScore(input: {
  title: string;
  category?: string | null;
  procurementType: string;
  agency: string;
  estimatedValue?: number | null;
  closingDate?: Date | null;
}): number {
  let score = 50;
  const text = normalizeText(input.title, input.category, input.agency);

  const positive = [
    "renovation",
    "fit-out",
    "fit out",
    "interior",
    "refurbish",
    "upgrade",
    "carpentry",
    "electrical",
    "m&e",
    "plumbing",
    "toilet",
    "office",
    "school",
    "clinic",
  ];
  const negative = ["road", "drain", "sewer", "earthwork", "civil", "viaduct", "rail", "marine", "shipyard"];

  if (positive.some((k) => text.includes(k))) score += 20;
  if (negative.some((k) => text.includes(k))) score -= 25;

  if (input.procurementType === "TENDER") score += 3;
  if (input.procurementType === "FRAMEWORK") score += 5;

  const value = input.estimatedValue ?? null;
  if (value != null) {
    if (value >= 20_000 && value <= 500_000) score += 10;
    if (value > 1_000_000) score -= 8;
    if (value < 10_000) score -= 5;
  }

  const risk = computeClosingRisk(input.closingDate, new Date());
  if (risk.severity === "CRITICAL") score -= 12;
  if (risk.severity === "HIGH") score -= 8;
  if (risk.severity === "MEDIUM") score -= 4;

  return clamp(score);
}

export function computeTenderFitScoreLight(input: {
  title: string;
  category?: string | null;
  procurementType: string;
  agency: string;
  estimatedValue?: unknown;
  closingDate?: Date | null;
}): number {
  return computeTenderFitScore({
    title: input.title,
    category: input.category ?? null,
    procurementType: input.procurementType,
    agency: input.agency,
    estimatedValue: input.estimatedValue != null ? toNumber(input.estimatedValue) : null,
    closingDate: input.closingDate ?? null,
  });
}

function computeReadinessScore(params: {
  submissionDone: number;
  submissionTotal: number;
  complianceDone: number;
  complianceTotal: number;
  approvalsPending: number;
  approvalsRejected: number;
}): number {
  const submissionRatio = params.submissionTotal > 0 ? params.submissionDone / params.submissionTotal : 0;
  const complianceRatio = params.complianceTotal > 0 ? params.complianceDone / params.complianceTotal : 0;

  let score = 0;
  score += submissionRatio * 45;
  score += complianceRatio * 45;
  if (params.approvalsRejected > 0) score -= 20;
  if (params.approvalsPending > 0) score -= 10;

  return clamp(score);
}

function computeBidNoBidScore(params: {
  tenderFitScore: number;
  readinessScore: number;
  marginPercent: number | null;
  targetMarginPercent: number | null;
  closingRisk: Severity;
  supplierQuoteCount: number;
}): number {
  let score = 30;

  score += (params.tenderFitScore - 50) * 0.35;
  score += (params.readinessScore - 50) * 0.25;

  const margin = params.marginPercent;
  const target = params.targetMarginPercent;
  const effective = margin != null && margin > 0 ? margin : target;

  if (effective != null) {
    if (effective >= 18) score += 25;
    else if (effective >= 12) score += 15;
    else if (effective >= 8) score += 5;
    else score -= 20;
  } else {
    score -= 5;
  }

  if (params.closingRisk === "CRITICAL") score -= 18;
  else if (params.closingRisk === "HIGH") score -= 12;
  else if (params.closingRisk === "MEDIUM") score -= 6;

  if (params.supplierQuoteCount >= 3) score += 6;
  else if (params.supplierQuoteCount >= 1) score += 3;
  else score -= 4;

  return clamp(score);
}

export function computeBidIntelligence(input: {
  id: string;
  opportunityNo: string;
  title: string;
  agency: string;
  procurementType: string;
  category?: string | null;
  status: string;
  closingDate?: Date | null;
  estimatedValue?: unknown;
  finalMargin?: unknown;
  targetMargin?: unknown;
  submissionChecklist?: Array<{ status: string; isRequired: boolean }>;
  complianceChecklist?: Array<{ status: string; isRequired: boolean }>;
  approvals?: Array<{ status: string }>;
  supplierQuotes?: Array<unknown>;
}): BidIntelligence {
  const closingRisk = computeClosingRisk(input.closingDate ?? null, new Date());
  const estimatedValue = input.estimatedValue != null ? toNumber(input.estimatedValue) : null;

  const tenderFitScore = computeTenderFitScore({
    title: input.title,
    category: input.category ?? null,
    procurementType: input.procurementType,
    agency: input.agency,
    estimatedValue,
    closingDate: input.closingDate ?? null,
  });

  const submission = input.submissionChecklist ?? [];
  const submissionTotal = submission.filter((i) => i.isRequired).length || submission.length;
  const submissionDone = submission.filter((i) => i.status === "COMPLETED" && i.isRequired).length || submission.filter((i) => i.status === "COMPLETED").length;

  const compliance = input.complianceChecklist ?? [];
  const complianceTotal = compliance.filter((i) => i.isRequired).length || compliance.length;
  const complianceDone = compliance.filter((i) => i.status === "COMPLETED" && i.isRequired).length || compliance.filter((i) => i.status === "COMPLETED").length;

  const approvals = input.approvals ?? [];
  const approvalsPending = approvals.filter((a) => a.status === "PENDING").length;
  const approvalsRejected = approvals.filter((a) => a.status === "REJECTED").length;

  const readinessScore = computeReadinessScore({
    submissionDone,
    submissionTotal,
    complianceDone,
    complianceTotal,
    approvalsPending,
    approvalsRejected,
  });

  const marginPercent = safePct(input.finalMargin);
  const targetMarginPercent = safePct(input.targetMargin);

  const bidNoBidScore = computeBidNoBidScore({
    tenderFitScore,
    readinessScore,
    marginPercent,
    targetMarginPercent,
    closingRisk: closingRisk.severity,
    supplierQuoteCount: input.supplierQuotes?.length ?? 0,
  });

  const alerts: BidIntelligenceAlert[] = [];
  if (closingRisk.severity !== "NONE") {
    alerts.push({
      severity: closingRisk.severity === "LOW" ? "LOW" : closingRisk.severity,
      title: "Closing date risk",
      description: closingRisk.message,
    });
  }
  if (marginPercent != null && marginPercent < 8) {
    alerts.push({
      severity: "HIGH",
      title: "Margin below 8%",
      description: "Margin is low for interior / fit-out risk profile. Revisit scope and supplier quotes.",
    });
  } else if (marginPercent != null && marginPercent < 12) {
    alerts.push({
      severity: "MEDIUM",
      title: "Margin below 12%",
      description: "Consider value engineering or pricing review to protect gross profit.",
    });
  }
  if (complianceTotal > 0 && complianceDone < complianceTotal) {
    alerts.push({
      severity: closingRisk.severity === "CRITICAL" || closingRisk.severity === "HIGH" ? "HIGH" : "MEDIUM",
      title: "Compliance incomplete",
      description: `${complianceDone}/${complianceTotal} required compliance items completed.`,
    });
  }
  if (submissionTotal > 0 && submissionDone < submissionTotal) {
    alerts.push({
      severity: closingRisk.severity === "CRITICAL" || closingRisk.severity === "HIGH" ? "HIGH" : "MEDIUM",
      title: "Submission checklist incomplete",
      description: `${submissionDone}/${submissionTotal} required submission items completed.`,
    });
  }
  if (approvalsRejected > 0) {
    alerts.push({
      severity: "HIGH",
      title: "Approval rejected",
      description: "At least one approver rejected. Resolve before submission.",
    });
  } else if (approvalsPending > 0 && (closingRisk.severity === "CRITICAL" || closingRisk.severity === "HIGH")) {
    alerts.push({
      severity: "HIGH",
      title: "Approvals pending near closing",
      description: "Escalate approvals due to tight closing timeline.",
    });
  }

  const headline =
    bidNoBidScore >= 75
      ? "Strong bid candidate"
      : bidNoBidScore >= 55
        ? "Bid candidate, tighten readiness"
        : bidNoBidScore >= 35
          ? "Borderline bid"
          : "Consider no-bid";

  const bullets: string[] = [];
  bullets.push(`Tender fit score: ${tenderFitScore}/100.`);
  bullets.push(`Bid/no-bid score: ${bidNoBidScore}/100.`);
  bullets.push(`Readiness score: ${readinessScore}/100.`);
  if (marginPercent != null) bullets.push(`Current margin: ${marginPercent.toFixed(1)}%.`);
  if (estimatedValue != null && estimatedValue > 0) bullets.push(`Estimated value: SGD ${Math.round(estimatedValue).toLocaleString("en-SG")}.`);
  if (closingRisk.daysLeft != null) bullets.push(`Days to close: ${closingRisk.daysLeft} day(s).`);

  const nextActions: string[] = [];
  if (submissionDone < submissionTotal) nextActions.push("Complete submission checklist items.");
  if (complianceDone < complianceTotal) nextActions.push("Complete compliance checks (BizSAFE/insurance/tax/risk review).");
  if ((input.supplierQuotes?.length ?? 0) < 2) nextActions.push("Collect supplier RFQs for key trade packages.");
  if (marginPercent != null && marginPercent < 12) nextActions.push("Review pricing/margin (value engineering, scope alignment).");
  if (closingRisk.severity === "HIGH" || closingRisk.severity === "CRITICAL") nextActions.push("Escalate timeline: approvals and final submission plan.");

  return {
    tenderFitScore,
    bidNoBidScore,
    readinessScore,
    closingRisk,
    alerts,
    summary: {
      headline,
      bullets,
      nextActions,
    },
  };
}
