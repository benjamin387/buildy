import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCompanySetting } from "@/lib/settings/service";
import { computeClosingRisk } from "@/lib/bidding/intelligence";
import { AuditAction, AuditSource, ComplianceDocumentCategory, ComplianceDocumentStatus, TenderRequirementStatus, type BidProcurementType } from "@prisma/client";
import { logAudit } from "@/lib/audit/logger";

export type ComplianceRisk = {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
};

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export const getOrCreateCompanyComplianceProfile = cache(async () => {
  try {
    const existing = await prisma.companyComplianceProfile.findUnique({ where: { id: "default" } });
    if (existing) return existing;
    const company = await getCompanySetting();
    return await prisma.companyComplianceProfile.create({
      data: {
        id: "default",
        companyName: company.companyName,
        legalName: company.legalName ?? null,
        uen: company.uen ?? null,
        gstRegistered: company.gstRegistered ?? true,
        gstNumber: null,
      },
    });
  } catch {
    // Fail-soft.
    return {
      id: "default",
      companyName: "Buildy Pte Ltd",
      legalName: null,
      uen: null,
      gstRegistered: true,
      gstNumber: null,
      bcaRegistration: null,
      bcaExpiryDate: null,
      bizsafeStatus: null,
      bizsafeExpiryDate: null,
      notes: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as any;
  }
});

export async function upsertCompanyComplianceProfile(params: {
  companyName: string;
  legalName?: string | null;
  uen?: string | null;
  gstRegistered: boolean;
  gstNumber?: string | null;
  bcaRegistration?: string | null;
  bcaExpiryDate?: Date | null;
  bizsafeStatus?: string | null;
  bizsafeExpiryDate?: Date | null;
  notes?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const before = await prisma.companyComplianceProfile.findUnique({ where: { id: "default" } });

  const updated = await prisma.companyComplianceProfile.upsert({
    where: { id: "default" },
    update: {
      companyName: params.companyName.trim(),
      legalName: params.legalName ?? null,
      uen: params.uen ?? null,
      gstRegistered: Boolean(params.gstRegistered),
      gstNumber: params.gstNumber ?? null,
      bcaRegistration: params.bcaRegistration ?? null,
      bcaExpiryDate: params.bcaExpiryDate ?? null,
      bizsafeStatus: params.bizsafeStatus ?? null,
      bizsafeExpiryDate: params.bizsafeExpiryDate ?? null,
      notes: params.notes ?? null,
    },
    create: {
      id: "default",
      companyName: params.companyName.trim(),
      legalName: params.legalName ?? null,
      uen: params.uen ?? null,
      gstRegistered: Boolean(params.gstRegistered),
      gstNumber: params.gstNumber ?? null,
      bcaRegistration: params.bcaRegistration ?? null,
      bcaExpiryDate: params.bcaExpiryDate ?? null,
      bizsafeStatus: params.bizsafeStatus ?? null,
      bizsafeExpiryDate: params.bizsafeExpiryDate ?? null,
      notes: params.notes ?? null,
    },
  });

  await logAudit({
    entityType: "CompanyComplianceProfile",
    entityId: updated.id,
    action: before ? AuditAction.UPDATE : AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: before ?? null,
    after: updated,
  });

  return updated;
}

export async function listComplianceDocuments(params: {
  category?: ComplianceDocumentCategory | null;
  status?: ComplianceDocumentStatus | null;
  q?: string | null;
  limit?: number;
}) {
  const q = params.q?.trim() || null;
  return prisma.complianceDocument.findMany({
    where: {
      category: params.category ?? undefined,
      status: params.status ?? undefined,
      OR: q
        ? [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
    take: params.limit ?? 200,
  });
}

export async function upsertComplianceDocument(params: {
  id?: string | null;
  title: string;
  category: ComplianceDocumentCategory;
  description?: string | null;
  fileUrl?: string | null;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  status?: ComplianceDocumentStatus | null;
  tagsJson?: unknown;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const title = params.title.trim();
  if (!title) throw new Error("Title is required.");

  const before = params.id
    ? await prisma.complianceDocument.findUnique({ where: { id: params.id } })
    : null;

  const row = params.id
    ? await prisma.complianceDocument.update({
        where: { id: params.id },
        data: {
          title,
          category: params.category,
          description: params.description ?? null,
          fileUrl: params.fileUrl ?? null,
          issueDate: params.issueDate ?? null,
          expiryDate: params.expiryDate ?? null,
          status: params.status ?? ComplianceDocumentStatus.ACTIVE,
          tagsJson: params.tagsJson as any,
        },
      })
    : await prisma.complianceDocument.create({
        data: {
          profileId: "default",
          title,
          category: params.category,
          description: params.description ?? null,
          fileUrl: params.fileUrl ?? null,
          issueDate: params.issueDate ?? null,
          expiryDate: params.expiryDate ?? null,
          status: params.status ?? ComplianceDocumentStatus.ACTIVE,
          tagsJson: params.tagsJson as any,
        },
      });

  await logAudit({
    entityType: "ComplianceDocument",
    entityId: row.id,
    action: before ? AuditAction.UPDATE : AuditAction.CREATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: before ?? null,
    after: row,
  });

  return row;
}

export function defaultTenderRequirements(procurementType: BidProcurementType) {
  const base: Array<{ key: string; title: string; mandatory: boolean; category: string }> = [
    { key: "company_profile", title: "Company profile", mandatory: true, category: "Company" },
    { key: "uen_acra", title: "ACRA / UEN registration details", mandatory: true, category: "Company" },
    { key: "gst_status", title: "GST registration / tax treatment", mandatory: true, category: "Finance" },
    { key: "bizsafe", title: "BizSAFE certificate (if required)", mandatory: procurementType === "TENDER", category: "Compliance" },
    { key: "insurance", title: "Insurance certificates (WICA / Public Liability)", mandatory: procurementType !== "RFI", category: "Compliance" },
    { key: "track_record", title: "Relevant project experience / track record", mandatory: procurementType === "TENDER", category: "Experience" },
    { key: "key_personnel", title: "Key personnel CVs", mandatory: procurementType === "TENDER", category: "Team" },
    { key: "equipment_list", title: "Equipment / tools list (if applicable)", mandatory: false, category: "Operations" },
    { key: "safety_records", title: "Safety records / RA / SWP (if required)", mandatory: procurementType === "TENDER", category: "Safety" },
    { key: "method_statement", title: "Method statement / work plan", mandatory: true, category: "Technical" },
    { key: "manpower_plan", title: "Manpower deployment plan", mandatory: procurementType === "TENDER", category: "Technical" },
    { key: "work_schedule", title: "Work schedule / programme", mandatory: true, category: "Technical" },
    { key: "declarations", title: "Declarations / forms checklist", mandatory: true, category: "Admin" },
    { key: "cover_letter", title: "Submission cover letter", mandatory: true, category: "Admin" },
  ];

  return base;
}

export async function ensureTenderDocumentRequirements(params: {
  opportunityId: string;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: params.opportunityId },
    select: { id: true, procurementType: true, closingDate: true },
  });
  if (!opp) throw new Error("Opportunity not found.");

  const existingCount = await prisma.tenderDocumentRequirement.count({
    where: { opportunityId: opp.id },
  });
  if (existingCount > 0) return { created: 0 };

  const reqs = defaultTenderRequirements(opp.procurementType);
  await prisma.tenderDocumentRequirement.createMany({
    data: reqs.map((r, idx) => ({
      opportunityId: opp.id,
      requirementKey: r.key,
      title: r.title,
      category: r.category,
      isMandatory: r.mandatory,
      status: TenderRequirementStatus.PENDING,
      dueDate: opp.closingDate ?? null,
      notes: null,
    })),
    skipDuplicates: true,
  });

  await logAudit({
    entityType: "BidOpportunity",
    entityId: opp.id,
    action: AuditAction.UPDATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before: null,
    after: { tenderRequirementsInitialized: true, count: reqs.length },
    metadata: { action: "INIT_TENDER_REQUIREMENTS" },
  });

  return { created: reqs.length };
}

export async function updateTenderRequirement(params: {
  requirementId: string;
  status: TenderRequirementStatus;
  complianceDocumentId?: string | null;
  generatedDocumentId?: string | null;
  bidDocumentId?: string | null;
  satisfiedByUrl?: string | null;
  notes?: string | null;
  actor?: { name?: string | null; email?: string | null; role?: string | null } | null;
}) {
  const before = await prisma.tenderDocumentRequirement.findUnique({ where: { id: params.requirementId } });
  if (!before) throw new Error("Requirement not found.");

  const updated = await prisma.tenderDocumentRequirement.update({
    where: { id: params.requirementId },
    data: {
      status: params.status,
      complianceDocumentId: params.complianceDocumentId ?? null,
      generatedDocumentId: params.generatedDocumentId ?? null,
      bidDocumentId: params.bidDocumentId ?? null,
      satisfiedByUrl: params.satisfiedByUrl ?? null,
      satisfiedAt: params.status === TenderRequirementStatus.PROVIDED ? new Date() : null,
      notes: params.notes ?? null,
    },
  });

  await logAudit({
    entityType: "TenderDocumentRequirement",
    entityId: updated.id,
    action: AuditAction.UPDATE,
    source: AuditSource.USER,
    actor: params.actor ?? null,
    before,
    after: updated,
    projectIdForActivity: null,
    metadata: { opportunityId: updated.opportunityId },
  });

  return updated;
}

export async function computeComplianceRisks(opportunityId: string): Promise<ComplianceRisk[]> {
  const now = new Date();
  const [opp, profile, docs] = await Promise.all([
    prisma.bidOpportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, closingDate: true, procurementType: true, costingLockedAt: true, approvedCostVersionId: true },
    }),
    getOrCreateCompanyComplianceProfile(),
    prisma.complianceDocument.findMany({
      where: { status: ComplianceDocumentStatus.ACTIVE },
      select: { id: true, category: true, title: true, expiryDate: true },
    }),
  ]);

  if (!opp) return [{ severity: "HIGH", title: "Opportunity missing", description: "This tender opportunity could not be found." }];

  const risks: ComplianceRisk[] = [];

  const closingRisk = computeClosingRisk(opp.closingDate ?? null, now);
  if (closingRisk.severity === "CRITICAL" || closingRisk.severity === "HIGH") {
    risks.push({
      severity: closingRisk.severity,
      title: "Closing date risk",
      description: closingRisk.message,
    });
  }

  if (!opp.approvedCostVersionId || !opp.costingLockedAt) {
    risks.push({
      severity: opp.closingDate && daysBetween(now, opp.closingDate) <= 3 ? "CRITICAL" : "HIGH",
      title: "Cost approval not completed",
      description: "Auto cost approval has not been locked. Director approval is required before final submission pack release.",
    });
  }

  const bizsafeDocs = docs.filter((d) => d.category === ComplianceDocumentCategory.BIZSAFE);
  const insuranceDocs = docs.filter((d) => d.category === ComplianceDocumentCategory.INSURANCE);

  const soonThresholdDays = 30;

  const checkExpiry = (label: string, list: typeof docs) => {
    if (!list.length) {
      risks.push({ severity: "MEDIUM", title: `${label} missing`, description: `No ${label} document is in the library.` });
      return;
    }
    const latest = list
      .slice()
      .sort((a, b) => (b.expiryDate?.getTime() ?? 0) - (a.expiryDate?.getTime() ?? 0))[0]!;
    if (latest.expiryDate && latest.expiryDate.getTime() < now.getTime()) {
      risks.push({
        severity: "CRITICAL",
        title: `${label} expired`,
        description: `"${latest.title}" expired on ${formatDate(latest.expiryDate)}.`,
      });
      return;
    }
    if (latest.expiryDate) {
      const days = daysBetween(now, latest.expiryDate);
      if (days >= 0 && days <= soonThresholdDays) {
        risks.push({
          severity: "HIGH",
          title: `${label} expiring soon`,
          description: `"${latest.title}" expires on ${formatDate(latest.expiryDate)} (${days} day(s)).`,
        });
      }
    }
  };

  if (opp.procurementType === "TENDER") {
    checkExpiry("BizSAFE", bizsafeDocs);
  }
  if (opp.procurementType !== "RFI") {
    checkExpiry("Insurance", insuranceDocs);
  }

  if (profile.bcaExpiryDate && profile.bcaExpiryDate.getTime() < now.getTime()) {
    risks.push({
      severity: "HIGH",
      title: "BCA registration expired",
      description: `BCA registration expiry date is ${formatDate(profile.bcaExpiryDate)}.`,
    });
  }

  return risks;
}
