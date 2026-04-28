import "server-only";

import { cache } from "react";
import {
  AuditAction,
  AuditSource,
  BizsafeApplicationStatus,
  BizsafeDocumentType,
  BizsafeLevel,
  TaskPriority,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";
import { getCompanySetting } from "@/lib/settings/service";

const DEFAULT_PROFILE_ID = "default";

function addYears(value: Date, years: number): Date {
  const next = new Date(value);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function formatLevelLabel(level: BizsafeLevel): string | null {
  switch (level) {
    case BizsafeLevel.LEVEL_1:
      return "BizSAFE Level 1";
    case BizsafeLevel.LEVEL_2:
      return "BizSAFE Level 2";
    case BizsafeLevel.LEVEL_3:
      return "BizSAFE Level 3";
    case BizsafeLevel.LEVEL_4:
      return "BizSAFE Level 4";
    case BizsafeLevel.STAR:
      return "BizSAFE STAR";
    default:
      return null;
  }
}

function deriveCertificateExpiryDate(params: {
  currentLevel: BizsafeLevel;
  approvalDate?: Date | null;
  expiryDate?: Date | null;
}) {
  if (params.expiryDate) return params.expiryDate;
  if (params.currentLevel === BizsafeLevel.LEVEL_3 && params.approvalDate) {
    return addYears(params.approvalDate, 3);
  }
  return null;
}

function deriveAuditReportExpiryDate(auditDate?: Date | null, expiryDate?: Date | null) {
  if (expiryDate) return expiryDate;
  if (!auditDate) return null;
  return addYears(auditDate, 3);
}

async function syncCompanyComplianceProfile(profile: {
  companyName: string;
  uen?: string | null;
  currentLevel: BizsafeLevel;
  expiryDate?: Date | null;
}) {
  const existing = await prisma.companyComplianceProfile.findUnique({ where: { id: DEFAULT_PROFILE_ID } });

  await prisma.companyComplianceProfile.upsert({
    where: { id: DEFAULT_PROFILE_ID },
    create: {
      id: DEFAULT_PROFILE_ID,
      companyName: profile.companyName,
      uen: profile.uen ?? null,
      gstRegistered: existing?.gstRegistered ?? true,
      bizsafeStatus: formatLevelLabel(profile.currentLevel),
      bizsafeExpiryDate: profile.expiryDate ?? null,
    },
    update: {
      companyName: profile.companyName,
      uen: profile.uen ?? existing?.uen ?? null,
      bizsafeStatus: formatLevelLabel(profile.currentLevel),
      bizsafeExpiryDate: profile.expiryDate ?? null,
    },
  });
}

export const getOrCreateBizsafeProfile = cache(async () => {
  const existing = await prisma.bizsafeProfile.findUnique({ where: { id: DEFAULT_PROFILE_ID } });
  if (existing) return existing;

  const [companySettings, complianceProfile] = await Promise.all([
    getCompanySetting().catch(() => null),
    prisma.companyComplianceProfile.findUnique({ where: { id: DEFAULT_PROFILE_ID } }).catch(() => null),
  ]);

  return prisma.bizsafeProfile.create({
    data: {
      id: DEFAULT_PROFILE_ID,
      companyName:
        companySettings?.companyName?.trim() ||
        complianceProfile?.companyName?.trim() ||
        "Buildy Pte Ltd",
      uen: companySettings?.uen ?? complianceProfile?.uen ?? null,
      currentLevel: BizsafeLevel.NONE,
      status: BizsafeApplicationStatus.NOT_STARTED,
    },
  });
});

export type UpsertBizsafeProfileInput = {
  companyName: string;
  uen?: string | null;
  currentLevel: BizsafeLevel;
  certificateNumber?: string | null;
  approvalDate?: Date | null;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  status: BizsafeApplicationStatus;
  seniorManagementName?: string | null;
  seniorManagementEmail?: string | null;
  seniorManagementPhone?: string | null;
  rmChampionName?: string | null;
  rmChampionEmail?: string | null;
  rmChampionPhone?: string | null;
  auditorName?: string | null;
  auditCompany?: string | null;
  auditDate?: Date | null;
  auditReportExpiryDate?: Date | null;
  remarks?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
};

export async function upsertBizsafeProfile(input: UpsertBizsafeProfileInput) {
  const before = await prisma.bizsafeProfile.findUnique({ where: { id: DEFAULT_PROFILE_ID } });
  const expiryDate = deriveCertificateExpiryDate({
    currentLevel: input.currentLevel,
    approvalDate: input.approvalDate ?? null,
    expiryDate: input.expiryDate ?? null,
  });
  const auditReportExpiryDate = deriveAuditReportExpiryDate(
    input.auditDate ?? null,
    input.auditReportExpiryDate ?? null,
  );

  const row = await prisma.bizsafeProfile.upsert({
    where: { id: DEFAULT_PROFILE_ID },
    create: {
      id: DEFAULT_PROFILE_ID,
      companyName: input.companyName.trim(),
      uen: normalizeText(input.uen),
      currentLevel: input.currentLevel,
      certificateNumber: normalizeText(input.certificateNumber),
      approvalDate: input.approvalDate ?? null,
      issueDate: input.issueDate ?? null,
      expiryDate,
      status:
        input.status === BizsafeApplicationStatus.APPROVED && expiryDate && expiryDate.getTime() < Date.now()
          ? BizsafeApplicationStatus.EXPIRED
          : input.status,
      seniorManagementName: normalizeText(input.seniorManagementName),
      seniorManagementEmail: normalizeText(input.seniorManagementEmail),
      seniorManagementPhone: normalizeText(input.seniorManagementPhone),
      rmChampionName: normalizeText(input.rmChampionName),
      rmChampionEmail: normalizeText(input.rmChampionEmail),
      rmChampionPhone: normalizeText(input.rmChampionPhone),
      auditorName: normalizeText(input.auditorName),
      auditCompany: normalizeText(input.auditCompany),
      auditDate: input.auditDate ?? null,
      auditReportExpiryDate,
      remarks: normalizeText(input.remarks),
    },
    update: {
      companyName: input.companyName.trim(),
      uen: normalizeText(input.uen),
      currentLevel: input.currentLevel,
      certificateNumber: normalizeText(input.certificateNumber),
      approvalDate: input.approvalDate ?? null,
      issueDate: input.issueDate ?? null,
      expiryDate,
      seniorManagementName: normalizeText(input.seniorManagementName),
      seniorManagementEmail: normalizeText(input.seniorManagementEmail),
      seniorManagementPhone: normalizeText(input.seniorManagementPhone),
      rmChampionName: normalizeText(input.rmChampionName),
      rmChampionEmail: normalizeText(input.rmChampionEmail),
      rmChampionPhone: normalizeText(input.rmChampionPhone),
      auditorName: normalizeText(input.auditorName),
      auditCompany: normalizeText(input.auditCompany),
      auditDate: input.auditDate ?? null,
      auditReportExpiryDate,
      remarks: normalizeText(input.remarks),
      status:
        input.status === BizsafeApplicationStatus.APPROVED && expiryDate && expiryDate.getTime() < Date.now()
          ? BizsafeApplicationStatus.EXPIRED
          : input.status,
    },
  });

  await syncCompanyComplianceProfile({
    companyName: row.companyName,
    uen: row.uen,
    currentLevel: row.currentLevel,
    expiryDate: row.expiryDate,
  });

  await logAudit({
    entityType: "BizsafeProfile",
    entityId: row.id,
    action: before ? AuditAction.UPDATE : AuditAction.CREATE,
    source: AuditSource.USER,
    actor: input.actor ?? null,
    before,
    after: row,
  });

  return row;
}

export async function listBizsafeDocuments(profileId = DEFAULT_PROFILE_ID) {
  return prisma.bizsafeDocument.findMany({
    where: { bizsafeProfileId: profileId },
    orderBy: [{ uploadedAt: "desc" }, { title: "asc" }],
  });
}

export async function createBizsafeDocument(input: {
  documentType: BizsafeDocumentType;
  title: string;
  fileUrl?: string | null;
  fileName?: string | null;
  remarks?: string | null;
  uploadedBy?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  await getOrCreateBizsafeProfile();

  const row = await prisma.bizsafeDocument.create({
    data: {
      bizsafeProfileId: DEFAULT_PROFILE_ID,
      documentType: input.documentType,
      title: input.title.trim(),
      fileUrl: normalizeText(input.fileUrl),
      fileName: normalizeText(input.fileName),
      remarks: normalizeText(input.remarks),
      uploadedBy: normalizeText(input.uploadedBy),
    },
  });

  await logAudit({
    entityType: "BizsafeDocument",
    entityId: row.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: input.actor ?? null,
    after: row,
  });

  return row;
}

export async function listBizsafeTasks(profileId = DEFAULT_PROFILE_ID) {
  return prisma.bizsafeTask.findMany({
    where: { bizsafeProfileId: profileId },
    orderBy: [
      { isCompleted: "asc" },
      { dueDate: "asc" },
      { priority: "desc" },
      { createdAt: "desc" },
    ],
  });
}

export async function createBizsafeTask(input: {
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  priority?: TaskPriority;
  assignedTo?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  await getOrCreateBizsafeProfile();

  const row = await prisma.bizsafeTask.create({
    data: {
      bizsafeProfileId: DEFAULT_PROFILE_ID,
      title: input.title.trim(),
      description: normalizeText(input.description),
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? TaskPriority.MEDIUM,
      assignedTo: normalizeText(input.assignedTo),
    },
  });

  await logAudit({
    entityType: "BizsafeTask",
    entityId: row.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: input.actor ?? null,
    after: row,
  });

  return row;
}

export async function updateBizsafeTask(input: {
  id: string;
  title?: string;
  description?: string | null;
  dueDate?: Date | null;
  isCompleted?: boolean;
  priority?: TaskPriority;
  assignedTo?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const before = await prisma.bizsafeTask.findUnique({ where: { id: input.id } });
  if (!before) {
    throw new Error("Task not found.");
  }

  const row = await prisma.bizsafeTask.update({
    where: { id: input.id },
    data: {
      title: input.title ? input.title.trim() : undefined,
      description: input.description !== undefined ? normalizeText(input.description) : undefined,
      dueDate: input.dueDate !== undefined ? input.dueDate : undefined,
      isCompleted: input.isCompleted ?? undefined,
      completedAt:
        input.isCompleted === undefined
          ? undefined
          : input.isCompleted
            ? before.completedAt ?? new Date()
            : null,
      priority: input.priority ?? undefined,
      assignedTo: input.assignedTo !== undefined ? normalizeText(input.assignedTo) : undefined,
    },
  });

  await logAudit({
    entityType: "BizsafeTask",
    entityId: row.id,
    action: AuditAction.UPDATE,
    source: AuditSource.USER,
    actor: input.actor ?? null,
    before,
    after: row,
  });

  return row;
}

export async function deleteBizsafeTask(input: {
  id: string;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const before = await prisma.bizsafeTask.findUnique({ where: { id: input.id } });
  if (!before) {
    throw new Error("Task not found.");
  }

  await prisma.bizsafeTask.delete({ where: { id: input.id } });

  await logAudit({
    entityType: "BizsafeTask",
    entityId: input.id,
    action: AuditAction.DELETE,
    source: AuditSource.USER,
    actor: input.actor ?? null,
    before,
    after: null,
  });
}

export async function listBizsafeTrainingRecords(profileId = DEFAULT_PROFILE_ID) {
  return prisma.bizsafeTrainingRecord.findMany({
    where: { bizsafeProfileId: profileId },
    orderBy: [{ completionDate: "desc" }, { createdAt: "desc" }],
  });
}

export async function createBizsafeTrainingRecord(input: {
  courseName: string;
  courseLevel?: BizsafeLevel | null;
  attendeeName: string;
  attendeeRole?: string | null;
  providerName?: string | null;
  courseDate?: Date | null;
  completionDate?: Date | null;
  certificateUrl?: string | null;
  remarks?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  await getOrCreateBizsafeProfile();

  const row = await prisma.bizsafeTrainingRecord.create({
    data: {
      bizsafeProfileId: DEFAULT_PROFILE_ID,
      courseName: input.courseName.trim(),
      courseLevel: input.courseLevel ?? null,
      attendeeName: input.attendeeName.trim(),
      attendeeRole: normalizeText(input.attendeeRole),
      providerName: normalizeText(input.providerName),
      courseDate: input.courseDate ?? null,
      completionDate: input.completionDate ?? null,
      certificateUrl: normalizeText(input.certificateUrl),
      remarks: normalizeText(input.remarks),
    },
  });

  await logAudit({
    entityType: "BizsafeTrainingRecord",
    entityId: row.id,
    action: AuditAction.CREATE,
    source: AuditSource.USER,
    actor: input.actor ?? null,
    after: row,
  });

  return row;
}

export async function getBizsafeDashboardSnapshot() {
  const profile = await getOrCreateBizsafeProfile();
  const [documents, tasks, trainingRecords] = await Promise.all([
    listBizsafeDocuments(profile.id),
    listBizsafeTasks(profile.id),
    listBizsafeTrainingRecords(profile.id),
  ]);

  return { profile, documents, tasks, trainingRecords };
}
