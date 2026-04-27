import "server-only";

import { prisma } from "@/lib/prisma";
import { parseGeBizText } from "@/lib/bidding/gebiz-parser";
import { computeTenderFitScoreLight, deriveTenderFitLabel } from "@/lib/bidding/intelligence";
import { generateProjectCode } from "@/lib/projects/project-code";
import { generateContractNumber } from "@/lib/contracts/contract-number";
import { DEFAULT_CONTRACT_CLAUSE_ORDER, getDefaultClauseTemplates } from "@/lib/contracts/clause-templates";
import { auditLog } from "@/lib/audit";
import { refreshProjectExecutionAlerts } from "@/lib/execution/alerts";
import { ForbiddenError } from "@/lib/rbac";
import { Prisma } from "@prisma/client";

export type BidOpportunityStatus =
  | "WATCHING"
  | "BID_NO_BID"
  | "PREPARING"
  | "PENDING_APPROVAL"
  | "SUBMITTED"
  | "AWARDED"
  | "LOST"
  | "CANCELLED";

export type BidProcurementType = "QUOTATION" | "TENDER" | "RFI" | "FRAMEWORK";

export type BidCostCategory =
  | "MATERIAL"
  | "LABOUR"
  | "SUBCONTRACTOR"
  | "PRELIMINARIES"
  | "OVERHEAD"
  | "CONTINGENCY"
  | "OTHER";

export function toMoney(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function safeMargin(totalSell: number, totalCost: number): number {
  if (!(totalSell > 0)) return 0;
  return (totalSell - totalCost) / totalSell;
}

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function defaultTimeline(params: { closingDate: Date | null; briefingDate: Date | null }) {
  const closing = params.closingDate;
  const briefing = params.briefingDate;

  // If closing date missing, generate template milestones without dates.
  if (!closing) {
    return [
      { key: "briefing", title: "Briefing attendance / clarifications", dueDate: briefing },
      { key: "rfq", title: "Issue RFQs to suppliers / subs", dueDate: null },
      { key: "costing_final", title: "Finalize costing & margin", dueDate: null },
      { key: "risk_review", title: "Commercial / legal risk review", dueDate: null },
      { key: "approvals", title: "Director approval & sign-off", dueDate: null },
      { key: "submission_ready", title: "Submission pack complete", dueDate: null },
      { key: "submit", title: "Submit on GeBIZ", dueDate: null },
    ];
  }

  // Timeline is conservative by default; teams can adjust.
  const submitDue = subtractDays(closing, 1);
  const submissionReady = subtractDays(closing, 2);
  const approvals = subtractDays(closing, 4);
  const riskReview = subtractDays(closing, 6);
  const costingFinal = subtractDays(closing, 9);
  const rfq = subtractDays(closing, 14);

  return [
    { key: "briefing", title: "Briefing attendance / clarifications", dueDate: briefing },
    { key: "rfq", title: "Issue RFQs to suppliers / subs", dueDate: rfq },
    { key: "costing_final", title: "Finalize costing & margin", dueDate: costingFinal },
    { key: "risk_review", title: "Commercial / legal risk review", dueDate: riskReview },
    { key: "approvals", title: "Director approval & sign-off", dueDate: approvals },
    { key: "submission_ready", title: "Submission pack complete", dueDate: submissionReady },
    { key: "submit", title: "Submit on GeBIZ", dueDate: submitDue },
  ];
}

async function recomputeOpportunityTotals(opportunityId: string) {
  const sums = await prisma.bidCostItem.aggregate({
    where: { opportunityId },
    _sum: { totalCost: true, totalSell: true },
  });

  const estimatedCost = toMoney(sums._sum.totalCost ?? 0);
  const bidPrice = toMoney(sums._sum.totalSell ?? 0);
  const finalMargin = safeMargin(bidPrice, estimatedCost);

  await prisma.bidOpportunity.update({
    where: { id: opportunityId },
    data: {
      estimatedCost,
      bidPrice,
      finalMargin,
    },
  });
}

function defaultChecklist(procurementType: BidProcurementType) {
  // Lean, practical defaults (tweak via UI later).
  const base: Array<{ key: string; label: string; required: boolean }> = [
    { key: "company_profile", label: "Company profile", required: true },
    { key: "bizsafe", label: "BizSAFE certificate (if required)", required: false },
    { key: "insurance", label: "Insurance certificates (Workmen / Public Liability)", required: false },
    { key: "method_statement", label: "Method statement / work plan", required: true },
    { key: "timeline", label: "Work schedule / programme", required: true },
    { key: "pricing_breakdown", label: "Pricing breakdown", required: true },
    { key: "forms_signed", label: "Forms signed / declarations", required: true },
  ];

  if (procurementType === "TENDER") {
    base.push(
      { key: "safety_plan", label: "Safety plan / RA / SWP", required: true },
      { key: "past_projects", label: "Past project references", required: true },
    );
  }

  return base;
}

function defaultComplianceChecklist(procurementType: BidProcurementType) {
  // Compliance items are intentionally practical and generic for SG tenders/quotations.
  // Teams can use this as a control gate before submission.
  const base: Array<{ key: string; label: string; required: boolean }> = [
    { key: "uen_acra", label: "ACRA / UEN registration details confirmed", required: true },
    { key: "bizsafe_level", label: "BizSAFE level meets requirement (if applicable)", required: false },
    { key: "insurance_pl_wica", label: "Public Liability / WICA insurance valid (if required)", required: false },
    { key: "wsh_ra_swp", label: "WSH RA / SWP prepared (if required)", required: false },
    { key: "bca_registration", label: "BCA registration / trades eligibility verified (if applicable)", required: false },
    { key: "subcontractor_checks", label: "Subcontractor onboarding checks complete (if used)", required: false },
    { key: "tax_gst", label: "GST/tax treatment verified (SR/ZR/ES/NS)", required: true },
    { key: "payment_terms_review", label: "Payment terms reviewed and acceptable", required: true },
    { key: "contract_risk_review", label: "Contract risk review (LD, warranty, indemnity)", required: procurementType === "TENDER" },
  ];

  return base;
}

function renderClauseContent(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    const value = vars[key];
    return value === undefined ? full : value;
  });
}

function tradeLabel(key: string): string {
  return key
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getApprovedCostVersionForOpportunity(opportunityId: string) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: opportunityId },
    select: { approvedCostVersionId: true },
  });

  const byId = opp?.approvedCostVersionId
    ? await prisma.bidCostVersion.findUnique({
        where: { id: opp.approvedCostVersionId },
        include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      })
    : null;
  if (byId && String(byId.status) === "APPROVED") return byId;

  return await prisma.bidCostVersion.findFirst({
    where: { opportunityId, status: "APPROVED" },
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
    include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
}

async function ensureContractClauses(params: {
  tx: Prisma.TransactionClient;
  contractId: string;
  contractNumber: string;
  clientName: string;
  projectName: string;
  defectsLiabilityDays: number;
  warrantyMonths: number;
}) {
  const templates = getDefaultClauseTemplates();
  await params.tx.clauseTemplate.createMany({
    data: templates.map((t) => ({
      code: t.code,
      title: t.title,
      content: t.content,
      category: t.category,
      isDefault: t.isDefault,
      createdAt: new Date(),
    })),
    skipDuplicates: true,
  });

  const clauseVars: Record<string, string> = {
    defectsLiabilityDays: String(params.defectsLiabilityDays > 0 ? params.defectsLiabilityDays : 30),
    warrantyMonths: String(params.warrantyMonths > 0 ? params.warrantyMonths : 12),
    contractNumber: params.contractNumber,
    clientName: params.clientName,
    projectName: params.projectName,
  };

  const clauseKeyToEditable = new Map<string, boolean>([
    ["SCOPE_OF_WORKS", true],
    ["CONTRACT_SUM", false],
    ["PAYMENT_TERMS", true],
    ["VARIATION", false],
    ["TIMELINE_COMPLETION", true],
    ["DEFECTS_WARRANTY", true],
    ["LIQUIDATED_DAMAGES", true],
    ["INSURANCE", true],
    ["INDEMNITY", true],
    ["TERMINATION", true],
    ["COMMUNICATION", false],
    ["GOVERNING_LAW", false],
  ]);

  const clausesToCreate = DEFAULT_CONTRACT_CLAUSE_ORDER.map((key, idx) => {
    const template = templates.find((t) => t.code === key);
    if (!template) return null;
    return {
      contractId: params.contractId,
      clauseKey: template.code,
      title: template.title,
      content: renderClauseContent(template.content, clauseVars),
      sortOrder: idx,
      isEditable: clauseKeyToEditable.get(template.code) ?? true,
      createdAt: new Date(),
    };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  if (clausesToCreate.length > 0) {
    await params.tx.contractClause.createMany({ data: clausesToCreate, skipDuplicates: true });
  }
}

export async function ensureBidComplianceChecklist(opportunityId: string) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, procurementType: true },
  });
  if (!opp) throw new Error("Opportunity not found.");

  const existingCount = await prisma.bidComplianceChecklistItem.count({
    where: { opportunityId: opp.id },
  });
  if (existingCount > 0) return { created: 0 };

  const items = defaultComplianceChecklist(String(opp.procurementType) as BidProcurementType);
  await prisma.bidComplianceChecklistItem.createMany({
    data: items.map((c, idx) => ({
      opportunityId: opp.id,
      itemKey: c.key,
      label: c.label,
      isRequired: c.required,
      sortOrder: idx,
    })),
    skipDuplicates: true,
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: opp.id,
      type: "DOCUMENT",
      title: "Compliance checklist initialized",
      description: "Default compliance checklist items were generated.",
    },
  });

  return { created: items.length };
}

export async function ensureAgencyProfile(agencyName: string) {
  const name = agencyName.trim();
  if (!name) throw new Error("Agency name is required.");

  return prisma.bidAgencyProfile.upsert({
    where: { name },
    update: { lastEngagedAt: new Date() },
    create: { name, lastEngagedAt: new Date() },
  });
}

export type CreateBidOpportunityInput = {
  // Either provide raw importText OR explicit fields.
  importText?: string;
  opportunityNo?: string;
  title?: string;
  agency?: string;
  procurementType?: BidProcurementType;
  category?: string | null;
  closingDate?: Date | null;
  briefingDate?: Date | null;
  estimatedValue?: number | null;
  fitScore?: number | null;
  fitLabel?: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  importHash?: string | null;
  targetMargin?: number | null;
  remarks?: string | null;
};

export async function createBidOpportunity(input: CreateBidOpportunityInput) {
  const parsed = input.importText ? parseGeBizText(input.importText) : {};

  const opportunityNo = (input.opportunityNo ?? parsed.opportunityNo ?? "").trim();
  const title = (input.title ?? parsed.title ?? "").trim();
  const agency = (input.agency ?? parsed.agency ?? "").trim();

  if (!opportunityNo) throw new Error("Opportunity No is required.");
  if (!title) throw new Error("Title is required.");
  if (!agency) throw new Error("Agency is required.");

  const procurementType = (input.procurementType ?? parsed.procurementType ?? "QUOTATION") as BidProcurementType;
  const category = (input.category ?? parsed.category ?? null) || null;
  const closingDate = input.closingDate ?? parsed.closingDate ?? null;
  const briefingDate = input.briefingDate ?? parsed.briefingDate ?? null;
  const estimatedValue =
    input.estimatedValue != null
      ? toMoney(input.estimatedValue)
      : parsed.estimatedValue != null
        ? toMoney(parsed.estimatedValue)
        : null;
  const targetMargin = input.targetMargin != null ? input.targetMargin : null;

  const computedFitScore = computeTenderFitScoreLight({
    title,
    agency,
    category,
    procurementType,
    estimatedValue,
    closingDate,
  });
  const fitScore = input.fitScore != null ? Math.max(0, Math.min(100, Math.round(input.fitScore))) : computedFitScore;
  const fitLabel = (input.fitLabel ?? deriveTenderFitLabel(fitScore)) as any;

  const agencyProfile = await ensureAgencyProfile(agency);

  const created = await prisma.bidOpportunity.create({
    data: {
      source: "GEBIZ",
      opportunityNo,
      title,
      agency,
      agencyProfileId: agencyProfile.id,
      procurementType,
      category,
      status: "WATCHING",
      closingDate,
      briefingDate,
      estimatedValue,
      fitScore,
      fitLabel,
      importHash: input.importHash ?? null,
      targetMargin,
      remarks: input.remarks ?? null,
      submissionChecklist: {
        create: defaultChecklist(procurementType).map((c, idx) => ({
          itemKey: c.key,
          label: c.label,
          isRequired: c.required,
          sortOrder: idx,
        })),
      },
      complianceChecklist: {
        create: defaultComplianceChecklist(procurementType).map((c, idx) => ({
          itemKey: c.key,
          label: c.label,
          isRequired: c.required,
          sortOrder: idx,
        })),
      },
      timelineMilestones: {
        create: defaultTimeline({ closingDate, briefingDate }).map((m, idx) => ({
          milestoneKey: m.key,
          title: m.title,
          dueDate: m.dueDate,
          sortOrder: idx,
        })),
      },
      activities: {
        create: {
          type: "NOTE",
          title: "Opportunity created",
          description: input.importText ? "Created from pasted GeBIZ text import." : "Created manually.",
        },
      },
    },
  });

  return created;
}

export type UpdateBidOpportunityInput = {
  id: string;
  status?: BidOpportunityStatus;
  title?: string;
  agency?: string;
  procurementType?: BidProcurementType;
  category?: string | null;
  closingDate?: Date | null;
  briefingDate?: Date | null;
  estimatedValue?: number | null;
  targetMargin?: number | null;
  remarks?: string | null;
};

export async function updateBidOpportunity(input: UpdateBidOpportunityInput) {
  const now = new Date();
  const updated = await prisma.bidOpportunity.update({
    where: { id: input.id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.status === "SUBMITTED" ? { submittedAt: now } : {}),
      ...(input.status === "AWARDED" ? { awardedAt: now } : {}),
      ...(input.title != null ? { title: input.title } : {}),
      ...(input.agency != null ? { agency: input.agency } : {}),
      ...(input.procurementType ? { procurementType: input.procurementType } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.closingDate !== undefined ? { closingDate: input.closingDate } : {}),
      ...(input.briefingDate !== undefined ? { briefingDate: input.briefingDate } : {}),
      ...(input.estimatedValue !== undefined
        ? { estimatedValue: input.estimatedValue == null ? null : toMoney(input.estimatedValue) }
        : {}),
      ...(input.targetMargin !== undefined ? { targetMargin: input.targetMargin } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: updated.id,
      type: input.status ? "STATUS_CHANGE" : "NOTE",
      title: input.status ? `Status changed to ${input.status}` : "Opportunity updated",
      description: input.status ? null : "Details updated.",
    },
  });

  return updated;
}

export async function listBidOpportunities(params: {
  search?: string;
  status?: BidOpportunityStatus | "ALL";
  take?: number;
}) {
  const search = params.search?.trim();
  const where: Prisma.BidOpportunityWhereInput = {
    ...(params.status && params.status !== "ALL" ? { status: params.status } : {}),
    ...(search
      ? {
          OR: [
            { opportunityNo: { contains: search, mode: "insensitive" } },
            { title: { contains: search, mode: "insensitive" } },
            { agency: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return prisma.bidOpportunity.findMany({
    where,
    orderBy: [{ closingDate: "asc" }, { updatedAt: "desc" }],
    take: params.take ?? 200,
  });
}

export async function getBidOpportunityById(id: string) {
  return prisma.bidOpportunity.findUnique({
    where: { id },
    include: {
      costItems: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
      documents: { orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] },
      supplierQuotes: { orderBy: [{ quoteAmount: "asc" }, { createdAt: "desc" }] },
      approvals: { orderBy: [{ createdAt: "desc" }] },
      activities: { orderBy: [{ createdAt: "desc" }], take: 50 },
      submissionChecklist: { orderBy: [{ sortOrder: "asc" }] },
      complianceChecklist: { orderBy: [{ sortOrder: "asc" }] },
      timelineMilestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }] },
      winLossRecord: true,
      competitorRecords: { orderBy: [{ isWinner: "desc" }, { createdAt: "desc" }] },
      awardedProject: { select: { id: true, projectCode: true, name: true } },
      awardedContract: { select: { id: true, contractNumber: true, status: true } },
      agencyProfile: true,
    },
  });
}

export type UpsertBidCostItemInput = {
  opportunityId: string;
  id?: string | null;
  category: BidCostCategory;
  description: string;
  unit?: string | null;
  quantity: number;
  unitCost: number;
  unitSell: number;
  sortOrder?: number;
  notes?: string | null;
};

export async function upsertBidCostItem(input: UpsertBidCostItemInput) {
  if (!input.description.trim()) throw new Error("Description is required.");
  if (input.quantity < 0) throw new Error("Quantity cannot be negative.");
  if (input.unitCost < 0) throw new Error("Unit cost cannot be negative.");
  if (input.unitSell < 0) throw new Error("Unit sell cannot be negative.");

  const quantity = toMoney(input.quantity);
  const unitCost = toMoney(input.unitCost);
  const unitSell = toMoney(input.unitSell);
  const totalCost = toMoney(quantity * unitCost);
  const totalSell = toMoney(quantity * unitSell);

  const data: Prisma.BidCostItemUncheckedCreateInput = {
    id: input.id ?? undefined,
    opportunityId: input.opportunityId,
    category: input.category as any,
    description: input.description.trim(),
    unit: input.unit?.trim() || null,
    quantity,
    unitCost,
    unitSell,
    totalCost,
    totalSell,
    sortOrder: input.sortOrder ?? 0,
    notes: input.notes ?? null,
  };

  const row = input.id
    ? await prisma.bidCostItem.update({ where: { id: input.id }, data })
    : await prisma.bidCostItem.create({ data });

  await prisma.bidActivity.create({
    data: {
      opportunityId: input.opportunityId,
      type: "COSTING",
      title: input.id ? "Cost item updated" : "Cost item added",
      description: `${row.category}: ${row.description}`,
    },
  });

  await recomputeOpportunityTotals(input.opportunityId);
  return row;
}

export async function deleteBidCostItem(params: { opportunityId: string; id: string }) {
  await prisma.bidCostItem.delete({ where: { id: params.id } });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "COSTING",
      title: "Cost item removed",
    },
  });
  await recomputeOpportunityTotals(params.opportunityId);
}

export async function addBidDocument(params: {
  opportunityId: string;
  documentName: string;
  documentType?: string | null;
  fileUrl?: string | null;
  dueDate?: Date | null;
  notes?: string | null;
}) {
  if (!params.documentName.trim()) throw new Error("Document name is required.");
  const doc = await prisma.bidDocument.create({
    data: {
      opportunityId: params.opportunityId,
      documentName: params.documentName.trim(),
      documentType: params.documentType?.trim() || null,
      fileUrl: params.fileUrl?.trim() || null,
      dueDate: params.dueDate ?? null,
      notes: params.notes ?? null,
    },
  });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "DOCUMENT",
      title: "Document added",
      description: doc.documentName,
    },
  });
  return doc;
}

export async function toggleChecklistItem(params: { opportunityId: string; itemId: string; status: "PENDING" | "COMPLETED" | "NOT_APPLICABLE" }) {
  const updated = await prisma.bidSubmissionChecklist.update({
    where: { id: params.itemId },
    data: {
      status: params.status as any,
      completedAt: params.status === "COMPLETED" ? new Date() : null,
    },
  });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "DOCUMENT",
      title: "Checklist updated",
      description: `${updated.label}: ${updated.status}`,
    },
  });
  return updated;
}

export async function toggleComplianceChecklistItem(params: { opportunityId: string; itemId: string; status: "PENDING" | "COMPLETED" | "NOT_APPLICABLE" }) {
  const updated = await prisma.bidComplianceChecklistItem.update({
    where: { id: params.itemId },
    data: {
      status: params.status as any,
      completedAt: params.status === "COMPLETED" ? new Date() : null,
    },
  });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "DOCUMENT",
      title: "Compliance checklist updated",
      description: `${updated.label}: ${updated.status}`,
    },
  });
  return updated;
}

export async function upsertBidTimelineMilestone(params: {
  opportunityId: string;
  id?: string | null;
  milestoneKey?: string | null;
  title: string;
  dueDate?: Date | null;
  status?: "PENDING" | "COMPLETED" | "MISSED";
  notes?: string | null;
  sortOrder?: number;
}) {
  if (!params.title.trim()) throw new Error("Milestone title is required.");

  if (params.id) {
    const row = await prisma.bidTimelineMilestone.update({
      where: { id: params.id },
      data: {
        title: params.title.trim(),
        dueDate: params.dueDate ?? null,
        status: (params.status ?? "PENDING") as any,
        completedAt: params.status === "COMPLETED" ? new Date() : null,
        notes: params.notes ?? null,
        sortOrder: params.sortOrder ?? 0,
      },
    });

    await prisma.bidActivity.create({
      data: {
        opportunityId: params.opportunityId,
        type: "NOTE",
        title: "Timeline milestone updated",
        description: row.title,
      },
    });

    return row;
  }

  const milestoneKey = (params.milestoneKey ?? "").trim() || `custom_${Math.random().toString(36).slice(2, 8)}`;
  const row = await prisma.bidTimelineMilestone.create({
    data: {
      opportunityId: params.opportunityId,
      milestoneKey,
      title: params.title.trim(),
      dueDate: params.dueDate ?? null,
      status: (params.status ?? "PENDING") as any,
      completedAt: params.status === "COMPLETED" ? new Date() : null,
      notes: params.notes ?? null,
      sortOrder: params.sortOrder ?? 0,
    },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "NOTE",
      title: "Timeline milestone added",
      description: row.title,
    },
  });

  return row;
}

export type UpsertBidSupplierQuoteInput = {
  opportunityId: string;
  id?: string | null;
  supplierId?: string | null;
  supplierName: string;
  scopeLabel?: string | null;
  quoteAmount: number;
  leadTimeDays?: number | null;
  validityDate?: Date | null;
  notes?: string | null;
  fileUrl?: string | null;
};

export async function upsertBidSupplierQuote(input: UpsertBidSupplierQuoteInput) {
  if (!input.supplierName.trim()) throw new Error("Supplier name is required.");
  if (input.quoteAmount < 0) throw new Error("Quote amount cannot be negative.");
  const data: Prisma.BidSupplierQuoteUncheckedCreateInput = {
    id: input.id ?? undefined,
    opportunityId: input.opportunityId,
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName.trim(),
    scopeLabel: input.scopeLabel?.trim() || null,
    quoteAmount: toMoney(input.quoteAmount),
    leadTimeDays: input.leadTimeDays ?? null,
    validityDate: input.validityDate ?? null,
    notes: input.notes ?? null,
    fileUrl: input.fileUrl ?? null,
  };

  const row = input.id
    ? await prisma.bidSupplierQuote.update({ where: { id: input.id }, data })
    : await prisma.bidSupplierQuote.create({ data });

  await prisma.bidActivity.create({
    data: {
      opportunityId: input.opportunityId,
      type: "COSTING",
      title: input.id ? "Supplier quote updated" : "Supplier quote added",
      description: `${row.supplierName}${row.scopeLabel ? ` · ${row.scopeLabel}` : ""}`,
    },
  });

  return row;
}

export async function deleteBidSupplierQuote(params: { opportunityId: string; id: string }) {
  await prisma.bidSupplierQuote.delete({ where: { id: params.id } });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "COSTING",
      title: "Supplier quote removed",
    },
  });
}

export async function upsertBidAgencyProfile(params: {
  id?: string | null;
  name: string;
  sector?: string | null;
  typicalCategories?: string | null;
  notes?: string | null;
}) {
  const name = params.name.trim();
  if (!name) throw new Error("Agency name is required.");

  const row = params.id
    ? await prisma.bidAgencyProfile.update({
        where: { id: params.id },
        data: {
          name,
          sector: params.sector ?? null,
          typicalCategories: params.typicalCategories ?? null,
          notes: params.notes ?? null,
          lastEngagedAt: new Date(),
        },
      })
    : await prisma.bidAgencyProfile.create({
        data: {
          name,
          sector: params.sector ?? null,
          typicalCategories: params.typicalCategories ?? null,
          notes: params.notes ?? null,
          lastEngagedAt: new Date(),
        },
      });

  return row;
}

export async function attachAgencyProfileToOpportunity(params: { opportunityId: string; agencyProfileId: string }) {
  await prisma.bidOpportunity.update({
    where: { id: params.opportunityId },
    data: { agencyProfileId: params.agencyProfileId },
  });
}

export async function upsertBidCompetitorRecord(params: {
  opportunityId: string;
  id?: string | null;
  competitorName: string;
  quotedPrice?: number | null;
  isWinner?: boolean;
  notes?: string | null;
}) {
  const name = params.competitorName.trim();
  if (!name) throw new Error("Competitor name is required.");

  // Link to competitor master if exists; create if not.
  const competitor = await prisma.bidCompetitor.upsert({
    where: { name },
    update: {},
    create: { name },
    select: { id: true, name: true },
  });

  const data: Prisma.BidCompetitorRecordUncheckedCreateInput = {
    id: params.id ?? undefined,
    opportunityId: params.opportunityId,
    competitorId: competitor.id,
    competitorName: competitor.name,
    quotedPrice: params.quotedPrice == null ? null : toMoney(params.quotedPrice),
    isWinner: Boolean(params.isWinner),
    notes: params.notes ?? null,
  };

  const row = params.id
    ? await prisma.bidCompetitorRecord.update({ where: { id: params.id }, data })
    : await prisma.bidCompetitorRecord.create({ data });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "NOTE",
      title: params.id ? "Competitor updated" : "Competitor added",
      description: `${row.competitorName}${row.quotedPrice != null ? ` · SGD ${Number(row.quotedPrice).toLocaleString("en-SG")}` : ""}`,
    },
  });

  return row;
}

export async function deleteBidCompetitorRecord(params: { opportunityId: string; id: string }) {
  await prisma.bidCompetitorRecord.delete({ where: { id: params.id } });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "NOTE",
      title: "Competitor removed",
    },
  });
}

export async function upsertBidWinLossRecord(params: {
  opportunityId: string;
  result: "WON" | "LOST" | "CANCELLED";
  awardedValue?: number | null;
  decisionDate?: Date | null;
  lostReason?: string | null;
  winReason?: string | null;
  competitorSummary?: string | null;
}) {
  const data: Prisma.BidWinLossRecordUncheckedCreateInput = {
    opportunityId: params.opportunityId,
    result: params.result as any,
    awardedValue: params.awardedValue == null ? null : toMoney(params.awardedValue),
    decisionDate: params.decisionDate ?? null,
    lostReason: params.lostReason ?? null,
    winReason: params.winReason ?? null,
    competitorSummary: params.competitorSummary ?? null,
  };

  const existing = await prisma.bidWinLossRecord.findUnique({
    where: { opportunityId: params.opportunityId },
    select: { id: true },
  });

  const row = existing
    ? await prisma.bidWinLossRecord.update({ where: { id: existing.id }, data })
    : await prisma.bidWinLossRecord.create({ data });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "AWARD",
      title: `Win/Loss recorded: ${params.result}`,
    },
  });

  return row;
}

export async function updateBidStrategy(params: {
  opportunityId: string;
  strategyMode: "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";
  pricingPosition: "UNDERCUT" | "MATCH" | "PREMIUM";
  strategyNotes?: string | null;
}) {
  await prisma.bidOpportunity.update({
    where: { id: params.opportunityId },
    data: {
      strategyMode: params.strategyMode as any,
      pricingPosition: params.pricingPosition as any,
      strategyNotes: params.strategyNotes ?? null,
    },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "NOTE",
      title: "Bid strategy updated",
      description: `${params.strategyMode} · ${params.pricingPosition}`,
    },
  });
}

export async function requestBidApproval(params: { opportunityId: string; approverName: string; approverEmail?: string | null; role?: string | null }) {
  if (!params.approverName.trim()) throw new Error("Approver name is required.");
  const approval = await prisma.bidApproval.create({
    data: {
      opportunityId: params.opportunityId,
      approverName: params.approverName.trim(),
      approverEmail: params.approverEmail?.trim() || null,
      role: params.role?.trim() || null,
      status: "PENDING",
    },
  });
  await prisma.bidOpportunity.update({
    where: { id: params.opportunityId },
    data: { status: "PENDING_APPROVAL" },
  });
  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "APPROVAL",
      title: "Approval requested",
      description: `${approval.approverName}${approval.role ? ` (${approval.role})` : ""}`,
    },
  });
  return approval;
}

export async function decideBidApproval(params: { opportunityId: string; approvalId: string; decision: "APPROVED" | "REJECTED"; remarks?: string | null; actorName?: string | null; actorEmail?: string | null }) {
  const updated = await prisma.bidApproval.update({
    where: { id: params.approvalId },
    data: {
      status: params.decision,
      remarks: params.remarks ?? null,
      decidedAt: new Date(),
    },
  });

  await prisma.bidActivity.create({
    data: {
      opportunityId: params.opportunityId,
      type: "APPROVAL",
      title: `Approval ${params.decision.toLowerCase()}`,
      description: updated.remarks ?? null,
      actorName: params.actorName ?? null,
      actorEmail: params.actorEmail ?? null,
    },
  });

  // If any rejection => back to PREPARING. If all approved => ready to submit.
  const approvals = await prisma.bidApproval.findMany({
    where: { opportunityId: params.opportunityId },
    select: { status: true },
  });
  if (approvals.some((a) => a.status === "REJECTED")) {
    await prisma.bidOpportunity.update({ where: { id: params.opportunityId }, data: { status: "PREPARING" } });
  } else if (approvals.length > 0 && approvals.every((a) => a.status === "APPROVED")) {
    await prisma.bidOpportunity.update({ where: { id: params.opportunityId }, data: { status: "PREPARING" } });
  }

  return updated;
}

export async function markBidSubmitted(params: { opportunityId: string }) {
  const updated = await prisma.bidOpportunity.update({
    where: { id: params.opportunityId },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await prisma.bidActivity.create({
    data: { opportunityId: params.opportunityId, type: "SUBMISSION", title: "Bid submitted" },
  });
  return updated;
}

export async function markBidAwarded(params: { opportunityId: string }) {
  const updated = await prisma.bidOpportunity.update({
    where: { id: params.opportunityId },
    data: { status: "AWARDED", awardedAt: new Date() },
  });
  await prisma.bidActivity.create({
    data: { opportunityId: params.opportunityId, type: "AWARD", title: "Bid awarded" },
  });
  return updated;
}

export async function convertAwardedBidToProjectAndContract(params: { opportunityId: string }) {
  const opp = await prisma.bidOpportunity.findUnique({
    where: { id: params.opportunityId },
  });
  if (!opp) throw new Error("Opportunity not found.");
  if (opp.status !== "AWARDED") throw new Error("Only AWARDED bids can be converted.");

  if (opp.awardedProjectId || opp.awardedContractId) {
    return { projectId: opp.awardedProjectId, contractId: opp.awardedContractId };
  }

  const approvedCostVersion = await getApprovedCostVersionForOpportunity(opp.id);
  if (!approvedCostVersion || String(approvedCostVersion.status) !== "APPROVED") {
    throw new Error("Conversion blocked: an approved BidCostVersion is required before post-award execution can start.");
  }
  const bidPrice = toMoney(Number(approvedCostVersion.bidPrice ?? 0));
  const estimatedCost = toMoney(Number(approvedCostVersion.totalCost ?? 0));

  const res = await prisma.$transaction(async (tx) => {
    // Create a minimal client record for the agency.
    const client = await tx.client.create({
      data: {
        name: opp.agency,
        companyName: opp.agency,
        email: null,
        phone: null,
        notes: `Created from GeBIZ awarded opportunity ${opp.opportunityNo}.`,
      },
    });

    const project = await tx.project.create({
      data: {
        clientId: client.id,
        projectCode: generateProjectCode(),
        name: opp.title,
        clientName: opp.agency,
        clientCompany: opp.agency,
        clientEmail: null,
        clientPhone: null,
        siteAddress: opp.agency,
        projectType: "COMMERCIAL",
        status: "CONTRACTED",
        addressLine1: opp.agency,
        addressLine2: null,
        postalCode: null,
        propertyType: "COMMERCIAL",
        notes: `Converted from GeBIZ bid ${opp.opportunityNo}.`,
        contractValue: new Prisma.Decimal(bidPrice),
        revisedContractValue: new Prisma.Decimal(bidPrice),
        estimatedCost: new Prisma.Decimal(estimatedCost),
      },
    });

    const contractDate = new Date();
    const contractNumber = generateContractNumber(contractDate);

    // Project timeline engine (lightweight defaults; teams can edit in the Project module).
    await tx.projectMilestone.createMany({
      data: [
        { projectId: project.id, title: "Kickoff & site briefing", description: "Confirm scope, access, safety, and programme.", dueDate: addDays(contractDate, 3), status: "PLANNED", sortOrder: 0 },
        { projectId: project.id, title: "Procurement planning", description: "Finalize trade awards and PO/subcontract issuance.", dueDate: addDays(contractDate, 10), status: "PLANNED", sortOrder: 1 },
        { projectId: project.id, title: "Site setup & protection", description: "Protection works and site readiness.", dueDate: addDays(contractDate, 14), status: "PLANNED", sortOrder: 2 },
        { projectId: project.id, title: "Demolition / hacking", description: "Demolition and disposal (if applicable).", dueDate: addDays(contractDate, 21), status: "PLANNED", sortOrder: 3 },
        { projectId: project.id, title: "M&E rough-in", description: "Electrical and plumbing rough-in.", dueDate: addDays(contractDate, 35), status: "PLANNED", sortOrder: 4 },
        { projectId: project.id, title: "Carpentry & finishes", description: "Carpentry fabrication/install and finishes.", dueDate: addDays(contractDate, 60), status: "PLANNED", sortOrder: 5 },
        { projectId: project.id, title: "Testing, handover & defects", description: "Testing, handover, and defects rectification plan.", dueDate: addDays(contractDate, 75), status: "PLANNED", sortOrder: 6 },
      ],
      skipDuplicates: false,
    });

    const scopeSnapshot =
      approvedCostVersion
        ? {
            bid: {
              opportunityNo: opp.opportunityNo,
              opportunityId: opp.id,
              costVersionId: approvedCostVersion.id,
              versionNo: approvedCostVersion.versionNo,
              approvedAt: approvedCostVersion.approvedAt,
            },
            tradeSummary: approvedCostVersion.lines.map((l) => ({
              tradeKey: l.tradeKey,
              tradeLabel: tradeLabel(String(l.tradeKey)),
              description: l.description,
              costAmount: Number(l.costAmount),
              sellAmount: Number(l.sellAmount),
              sortOrder: l.sortOrder,
            })),
            totals: {
              totalCost: Number(approvedCostVersion.totalCost),
              bidPrice: Number(approvedCostVersion.bidPrice),
              marginPercent: Number(approvedCostVersion.marginPercent),
            },
          }
        : {
            bid: { opportunityNo: opp.opportunityNo, opportunityId: opp.id, costVersionId: null },
          };

    const contract = await tx.contract.create({
      data: {
        projectId: project.id,
        quotationId: null,
        contractNumber,
        version: 1,
        contractDate,
        status: "DRAFT",
        clientNameSnapshot: opp.agency,
        clientCompanySnapshot: opp.agency,
        clientEmailSnapshot: null,
        clientPhoneSnapshot: null,
        projectNameSnapshot: project.name,
        projectAddress1: project.addressLine1,
        projectAddress2: project.addressLine2,
        projectPostalCode: project.postalCode,
        contractSubtotal: new Prisma.Decimal(bidPrice),
        discountAmount: new Prisma.Decimal(0),
        gstAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(bidPrice),
        contractValue: new Prisma.Decimal(bidPrice),
        retentionAmount: new Prisma.Decimal(0),
        defectsLiabilityDays: 30,
        warrantyMonths: 12,
        scopeOfWork: "Scope of work is based on the tender submission, approved costing, and any approved variation orders.",
        paymentTerms: "Payment terms to follow tender conditions; staged invoices will be issued based on agreed milestones.",
        warrantyTerms:
          "Defects liability and warranty period as per contract clauses; workmanship defects to be rectified within a reasonable time upon notification.",
        variationPolicy:
          "Variation orders must be documented and approved in writing prior to execution. Unapproved variations are excluded from contract value.",
        defectsPolicy:
          "Defects noted during handover or within the defects liability period will be addressed subject to agreed exclusions and misuse.",
        insurancePolicy:
          "Contractor to maintain relevant insurances where required (public liability, workmen compensation) subject to project needs.",
        termsText:
          "This contract is formed based on the tender submission, approved costing, agreed scope, and the terms & conditions stated herein. All staged payments must be fulfilled according to the payment schedule. Variations require written approval prior to execution.",
        notes: `Draft created from awarded GeBIZ opportunity ${opp.opportunityNo}.`,
        lockedAt: null,
        scopeSnapshot: scopeSnapshot as Prisma.InputJsonValue,
        paymentTermsSnapshot: Prisma.JsonNull,
      },
    });

    await ensureContractClauses({
      tx,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      clientName: contract.clientNameSnapshot,
      projectName: contract.projectNameSnapshot,
      defectsLiabilityDays: contract.defectsLiabilityDays,
      warrantyMonths: contract.warrantyMonths,
    });

    const existingBudget =
      approvedCostVersion
        ? await tx.projectBudget.findFirst({
            where: { projectId: project.id, sourceType: "BID_COST_VERSION", bidCostVersionId: approvedCostVersion.id },
            select: { id: true },
          })
        : null;

    const createdBudget =
      approvedCostVersion && !existingBudget
        ? await tx.projectBudget.create({
            data: {
              projectId: project.id,
              sourceType: "BID_COST_VERSION",
              bidOpportunityId: opp.id,
              bidCostVersionId: approvedCostVersion.id,
              quotationId: null,
              versionNo: 1,
              status: "LOCKED",
              isActive: true,
              lockedAt: new Date(),
              lockedByName: null,
              lockedByEmail: null,
              createdByName: null,
              createdByEmail: null,
              totalCost: new Prisma.Decimal(toMoney(Number(approvedCostVersion.totalCost ?? 0))),
              totalRevenue: new Prisma.Decimal(toMoney(Number(approvedCostVersion.bidPrice ?? 0))),
              notes: `Baseline budget locked from approved BidCostVersion #${approvedCostVersion.versionNo}.`,
              lines: {
                create: approvedCostVersion.lines.map((l, idx) => ({
                  tradeKey: l.tradeKey,
                  description: l.description,
                  costAmount: l.costAmount,
                  revenueAmount: l.sellAmount,
                  sourceCostVersionLineId: l.id,
                  sortOrder: l.sortOrder ?? idx,
                  notes: l.notes ?? null,
                })),
              },
            },
            include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
          })
        : null;

    const existingPlan =
      approvedCostVersion
        ? await tx.projectProcurementPlan.findFirst({
            where: { projectId: project.id, bidOpportunityId: opp.id },
            select: { id: true },
          })
        : null;

    if (approvedCostVersion && !existingPlan) {
      const lines = createdBudget?.lines ?? [];
      const byTrade = new Map<string, { tradeKey: any; totalCost: number; title: string; firstLineId: string | null }>();
      for (const l of lines) {
        const key = String(l.tradeKey);
        const cur = byTrade.get(key);
        const amt = toMoney(Number(l.costAmount ?? 0));
        if (!cur) {
          byTrade.set(key, { tradeKey: l.tradeKey, totalCost: amt, title: tradeLabel(key), firstLineId: l.id ?? null });
        } else {
          cur.totalCost = toMoney(cur.totalCost + amt);
        }
      }

      await tx.projectProcurementPlan.create({
        data: {
          projectId: project.id,
          bidOpportunityId: opp.id,
          status: "ACTIVE",
          notes: "Auto-generated from locked tender budget lines.",
          items: {
            create: Array.from(byTrade.values()).map((t, idx) => ({
              tradeKey: t.tradeKey,
              itemType: "SUBCONTRACT",
              title: t.title,
              plannedVendorId: null,
              plannedAmount: new Prisma.Decimal(t.totalCost),
              plannedAwardDate: null,
              plannedDeliveryDate: null,
              status: "PLANNED",
              purchaseOrderId: null,
              subcontractId: null,
              sourceBudgetLineId: t.firstLineId,
              notes: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
        },
      });
    }

    await tx.bidOpportunity.update({
      where: { id: opp.id },
      data: {
        awardedProjectId: project.id,
        awardedContractId: contract.id,
        approvedCostVersionId: approvedCostVersion?.id ?? opp.approvedCostVersionId ?? null,
        costingLockedAt: approvedCostVersion ? new Date() : opp.costingLockedAt ?? null,
        bidPrice: new Prisma.Decimal(bidPrice),
        estimatedCost: new Prisma.Decimal(estimatedCost),
        finalMargin: new Prisma.Decimal(safeMargin(bidPrice, estimatedCost)),
      },
    });

    await tx.bidActivity.create({
      data: {
        opportunityId: opp.id,
        type: "AWARD",
        title: "Converted to project + execution setup",
        description: `Project: ${project.projectCode} · Contract: ${contract.contractNumber}${approvedCostVersion ? ` · Budget locked (v${approvedCostVersion.versionNo})` : ""}`,
      },
    });

    return { projectId: project.id, contractId: contract.id };
  });

  try {
    await auditLog({
      module: "bidding",
      action: "Converted awarded bid to project + contract",
      actorUserId: null,
      projectId: res.projectId ?? null,
      entityType: "BidOpportunity",
      entityId: opp.id,
      metadata: { opportunityNo: opp.opportunityNo, projectId: res.projectId, contractId: res.contractId },
    });
  } catch {
    // ignore
  }

  if (res.projectId) {
    await refreshProjectExecutionAlerts(res.projectId).catch(() => null);
  }

  return res;
}

export async function assertBiddingWriteAccess(user: { isAdmin: boolean; roleKeys: string[] }, action: "create" | "edit" | "approve" | "send") {
  // Lightweight server-side guard for actions that aren’t yet wired into module/action matrix.
  // Use the central module permission guard in routes/pages where available.
  if (user.isAdmin || user.roleKeys.includes("DIRECTOR")) return;
  throw new ForbiddenError();
}
