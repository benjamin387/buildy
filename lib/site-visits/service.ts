import { prisma } from "@/lib/prisma";
import { Prisma, type SiteVisitStatus } from "@prisma/client";

function toDecimalOrNull(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return new Prisma.Decimal(Math.round((value + Number.EPSILON) * 100) / 100);
}

export async function listLeadSiteVisits(leadId: string) {
  return prisma.siteVisit.findMany({
    where: { leadId },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, name: true, projectCode: true } },
    },
    take: 200,
  });
}

export async function listProjectSiteVisits(projectId: string) {
  return prisma.siteVisit.findMany({
    where: { projectId },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    include: {
      lead: { select: { id: true, leadNumber: true, customerName: true } },
    },
    take: 200,
  });
}

export async function getSiteVisitById(siteVisitId: string) {
  return prisma.siteVisit.findUnique({
    where: { id: siteVisitId },
    include: {
      lead: true,
      project: { include: { client: true, commercialProfile: true } },
      areas: { orderBy: { sortOrder: "asc" } },
      measurements: { orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] },
      photos: { orderBy: [{ createdAt: "desc" }] },
      checklist: true,
      budgetRange: true,
      timelineExpectation: true,
    },
  });
}

export async function createLeadSiteVisit(params: {
  leadId: string;
  scheduledAt: Date;
  addressSnapshot: string;
  assignedSalesName?: string | null;
  assignedSalesEmail?: string | null;
  assignedDesignerName?: string | null;
  assignedDesignerEmail?: string | null;
  notes?: string | null;
}) {
  return prisma.siteVisit.create({
    data: {
      leadId: params.leadId,
      projectId: null,
      status: "SCHEDULED",
      scheduledAt: params.scheduledAt,
      completedAt: null,
      addressSnapshot: params.addressSnapshot,
      assignedSalesName: params.assignedSalesName ?? null,
      assignedSalesEmail: params.assignedSalesEmail ?? null,
      assignedDesignerName: params.assignedDesignerName ?? null,
      assignedDesignerEmail: params.assignedDesignerEmail ?? null,
      notes: params.notes ?? null,
    },
  });
}

export async function markSiteVisitStatus(params: { siteVisitId: string; status: SiteVisitStatus }) {
  return prisma.siteVisit.update({
    where: { id: params.siteVisitId },
    data: {
      status: params.status,
      completedAt: params.status === "COMPLETED" ? new Date() : null,
    },
  });
}

export async function upsertRequirementChecklist(params: {
  siteVisitId: string;
  items: unknown;
  notes?: string | null;
}) {
  return prisma.requirementChecklist.upsert({
    where: { siteVisitId: params.siteVisitId },
    create: {
      siteVisitId: params.siteVisitId,
      items: params.items as Prisma.InputJsonValue,
      notes: params.notes ?? null,
    },
    update: {
      items: params.items as Prisma.InputJsonValue,
      notes: params.notes ?? null,
    },
  });
}

export async function upsertBudgetRange(params: {
  siteVisitId: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  currency?: string | null;
  notes?: string | null;
}) {
  return prisma.budgetRange.upsert({
    where: { siteVisitId: params.siteVisitId },
    create: {
      siteVisitId: params.siteVisitId,
      minAmount: toDecimalOrNull(params.minAmount ?? null),
      maxAmount: toDecimalOrNull(params.maxAmount ?? null),
      currency: params.currency?.trim() || "SGD",
      notes: params.notes ?? null,
    },
    update: {
      minAmount: toDecimalOrNull(params.minAmount ?? null),
      maxAmount: toDecimalOrNull(params.maxAmount ?? null),
      currency: params.currency?.trim() || "SGD",
      notes: params.notes ?? null,
    },
  });
}

export async function upsertTimelineExpectation(params: {
  siteVisitId: string;
  desiredStartDate?: Date | null;
  desiredCompletionDate?: Date | null;
  notes?: string | null;
}) {
  return prisma.timelineExpectation.upsert({
    where: { siteVisitId: params.siteVisitId },
    create: {
      siteVisitId: params.siteVisitId,
      desiredStartDate: params.desiredStartDate ?? null,
      desiredCompletionDate: params.desiredCompletionDate ?? null,
      notes: params.notes ?? null,
    },
    update: {
      desiredStartDate: params.desiredStartDate ?? null,
      desiredCompletionDate: params.desiredCompletionDate ?? null,
      notes: params.notes ?? null,
    },
  });
}

export async function addSiteVisitArea(params: {
  siteVisitId: string;
  title: string;
  notes?: string | null;
}) {
  const count = await prisma.siteVisitArea.count({ where: { siteVisitId: params.siteVisitId } });
  return prisma.siteVisitArea.create({
    data: {
      siteVisitId: params.siteVisitId,
      title: params.title,
      notes: params.notes ?? null,
      sortOrder: count,
    },
  });
}

export async function addMeasurementNote(params: {
  siteVisitId: string;
  areaId?: string | null;
  title: string;
  value: string;
  unit?: string | null;
  notes?: string | null;
}) {
  const count = await prisma.measurementNote.count({ where: { siteVisitId: params.siteVisitId } });
  return prisma.measurementNote.create({
    data: {
      siteVisitId: params.siteVisitId,
      areaId: params.areaId ?? null,
      title: params.title,
      value: params.value,
      unit: params.unit ?? null,
      notes: params.notes ?? null,
      sortOrder: count,
    },
  });
}

export async function addSitePhoto(params: {
  siteVisitId: string;
  areaId?: string | null;
  fileUrl: string;
  fileName?: string | null;
  caption?: string | null;
}) {
  return prisma.sitePhoto.create({
    data: {
      siteVisitId: params.siteVisitId,
      areaId: params.areaId ?? null,
      fileUrl: params.fileUrl,
      fileName: params.fileName ?? null,
      caption: params.caption ?? null,
      takenAt: null,
    },
  });
}

