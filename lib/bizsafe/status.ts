import { BizsafeDocumentType, BizsafeLevel, type BizsafeApplicationStatus, type TaskPriority } from "@prisma/client";

type DateLike = Date | string | null | undefined;

type MinimalProfile = {
  currentLevel?: BizsafeLevel | null;
  expiryDate?: DateLike;
  approvalDate?: DateLike;
  auditReportExpiryDate?: DateLike;
  status?: BizsafeApplicationStatus | null;
  seniorManagementName?: string | null;
  rmChampionName?: string | null;
};

type MinimalDocument = {
  documentType: BizsafeDocumentType;
  fileUrl?: string | null;
};

type MinimalTask = {
  isCompleted?: boolean | null;
  priority?: TaskPriority | null;
};

type MinimalTrainingRecord = {
  completionDate?: DateLike;
};

export type BizsafeCertificateStatus = "NOT_STARTED" | "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";

function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function levelRank(level: BizsafeLevel | null | undefined): number {
  switch (level) {
    case BizsafeLevel.LEVEL_1:
      return 1;
    case BizsafeLevel.LEVEL_2:
      return 2;
    case BizsafeLevel.LEVEL_3:
      return 3;
    case BizsafeLevel.LEVEL_4:
      return 4;
    case BizsafeLevel.STAR:
      return 5;
    default:
      return 0;
  }
}

export function isLevelThreeOrAbove(level: BizsafeLevel | null | undefined): boolean {
  return levelRank(level) >= 3;
}

export function getDaysToExpiry(expiryDate: DateLike): number | null {
  const expiry = toDate(expiryDate);
  if (!expiry) return null;

  const today = startOfToday();
  const end = new Date(expiry);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function getRenewalDueDate(expiryDate: DateLike): Date | null {
  const expiry = toDate(expiryDate);
  if (!expiry) return null;

  const renewalDue = new Date(expiry);
  renewalDue.setMonth(renewalDue.getMonth() - 2);
  return renewalDue;
}

export function getBizsafeCertificateStatus(profile: MinimalProfile | null | undefined): BizsafeCertificateStatus {
  if (!profile?.currentLevel || profile.currentLevel === BizsafeLevel.NONE) {
    return "NOT_STARTED";
  }

  const daysToExpiry = getDaysToExpiry(profile.expiryDate);
  if (daysToExpiry === null) {
    return "ACTIVE";
  }
  if (daysToExpiry < 0) {
    return "EXPIRED";
  }
  if (daysToExpiry <= 60) {
    return "EXPIRING_SOON";
  }

  return "ACTIVE";
}

export function getMissingBizsafeRequirements(
  profile: MinimalProfile | null | undefined,
  documents: MinimalDocument[],
  trainingRecords: MinimalTrainingRecord[],
): string[] {
  const missing: string[] = [];
  const level = profile?.currentLevel ?? BizsafeLevel.NONE;
  const certificateStatus = getBizsafeCertificateStatus(profile);
  const hasCertificate = documents.some((document) => document.documentType === BizsafeDocumentType.CERTIFICATE);
  const hasAuditReport = documents.some((document) => document.documentType === BizsafeDocumentType.RM_AUDIT_REPORT);
  const hasTraining = trainingRecords.some((record) => Boolean(toDate(record.completionDate)));

  if (level === BizsafeLevel.NONE) {
    missing.push("BizSAFE application has not started.");
  }
  if (!profile?.seniorManagementName?.trim()) {
    missing.push("Senior management representative is not assigned.");
  }
  if (!profile?.rmChampionName?.trim()) {
    missing.push("RM Champion is not assigned.");
  }
  if (!hasTraining) {
    missing.push("Training records are missing.");
  }
  if (!hasCertificate) {
    missing.push("Certificate document has not been uploaded.");
  }
  if (isLevelThreeOrAbove(level) && !hasAuditReport) {
    missing.push("Risk Management Audit Report is missing.");
  }
  if (certificateStatus === "EXPIRED") {
    missing.push("BizSAFE certificate has expired.");
  } else if (certificateStatus === "EXPIRING_SOON") {
    missing.push("BizSAFE certificate renewal window is open.");
  }

  const auditReportExpiryDays = getDaysToExpiry(profile?.auditReportExpiryDate);
  if (auditReportExpiryDays !== null && auditReportExpiryDays < 0) {
    missing.push("Risk Management Audit Report has expired.");
  }

  return missing;
}

export function getBizsafeReadinessScore(
  profile: MinimalProfile | null | undefined,
  documents: MinimalDocument[],
  tasks: MinimalTask[],
  trainingRecords: MinimalTrainingRecord[],
): number {
  let score = 100;

  const level = profile?.currentLevel ?? BizsafeLevel.NONE;
  const certificateStatus = getBizsafeCertificateStatus(profile);
  const hasCertificate = documents.some((document) => document.documentType === BizsafeDocumentType.CERTIFICATE);
  const hasAuditReport = documents.some((document) => document.documentType === BizsafeDocumentType.RM_AUDIT_REPORT);
  const hasTraining = trainingRecords.some((record) => Boolean(toDate(record.completionDate)));
  const incompleteTasks = tasks.filter((task) => !task.isCompleted).length;
  const criticalTasks = tasks.filter((task) => !task.isCompleted && task.priority === "CRITICAL").length;

  if (level === BizsafeLevel.NONE) score -= 30;
  else if (!isLevelThreeOrAbove(level)) score -= 18;

  if (!hasCertificate) score -= 20;
  if (!hasAuditReport) score -= 18;
  if (!profile?.rmChampionName?.trim()) score -= 10;
  if (!profile?.seniorManagementName?.trim()) score -= 10;
  if (!hasTraining) score -= 12;
  if (certificateStatus === "EXPIRED") score -= 25;
  if (certificateStatus === "EXPIRING_SOON") score -= 12;

  const auditExpiryDays = getDaysToExpiry(profile?.auditReportExpiryDate);
  if (auditExpiryDays !== null && auditExpiryDays <= 180) score -= 10;
  if (auditExpiryDays !== null && auditExpiryDays < 0) score -= 15;

  score -= Math.min(incompleteTasks * 3, 15);
  score -= Math.min(criticalTasks * 4, 8);

  return Math.max(0, Math.min(100, score));
}

export function getRecommendedNextAction(profile: MinimalProfile | null | undefined): string {
  const level = profile?.currentLevel ?? BizsafeLevel.NONE;
  const certificateStatus = getBizsafeCertificateStatus(profile);
  const auditExpiryDays = getDaysToExpiry(profile?.auditReportExpiryDate);

  if (level === BizsafeLevel.NONE) {
    return "Assign the senior management representative and start BizSAFE Level 1 preparation.";
  }
  if (!profile?.seniorManagementName?.trim()) {
    return "Nominate the senior management representative before proceeding with the application.";
  }
  if (!profile?.rmChampionName?.trim()) {
    return "Assign an RM Champion to complete the risk management workflow.";
  }
  if (certificateStatus === "EXPIRED") {
    return "Renew the BizSAFE certificate immediately before tender submission.";
  }
  if (certificateStatus === "EXPIRING_SOON") {
    return "Begin certificate renewal now to stay ahead of the 2-month reminder window.";
  }
  if (auditExpiryDays !== null && auditExpiryDays <= 180) {
    return "Plan the RM audit refresh now to avoid a report validity gap.";
  }
  if (!isLevelThreeOrAbove(level)) {
    return "Upgrade to BizSAFE Level 3 or above before pursuing higher-compliance tenders.";
  }

  return "Keep documents current and monitor renewal dates for tender readiness.";
}

