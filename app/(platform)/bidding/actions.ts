"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import {
  addBidDocument,
  convertAwardedBidToProjectAndContract,
  createBidOpportunity,
  decideBidApproval,
  deleteBidCostItem,
  ensureBidComplianceChecklist,
  markBidAwarded,
  markBidSubmitted,
  requestBidApproval,
  toggleChecklistItem,
  toggleComplianceChecklistItem,
  upsertBidTimelineMilestone,
  updateBidStrategy,
  upsertBidAgencyProfile,
  attachAgencyProfileToOpportunity,
  upsertBidCompetitorRecord,
  deleteBidCompetitorRecord,
  upsertBidWinLossRecord,
  updateBidOpportunity,
  upsertBidCostItem,
  upsertBidSupplierQuote,
  deleteBidSupplierQuote,
} from "@/lib/bidding/service";

function toDateOrNull(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

const createSchema = z.object({
  importText: z.string().optional().or(z.literal("")).default(""),
  opportunityNo: z.string().optional().or(z.literal("")).default(""),
  title: z.string().optional().or(z.literal("")).default(""),
  agency: z.string().optional().or(z.literal("")).default(""),
  procurementType: z.enum(["QUOTATION", "TENDER", "RFI", "FRAMEWORK"]).optional(),
  category: z.string().optional().or(z.literal("")).default(""),
  closingDate: z.string().optional().or(z.literal("")).default(""),
  briefingDate: z.string().optional().or(z.literal("")).default(""),
  estimatedValue: z.coerce.number().optional(),
  targetMargin: z.coerce.number().optional(),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function createBidOpportunityAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "create" });

  const parsed = createSchema.safeParse({
    importText: formData.get("importText"),
    opportunityNo: formData.get("opportunityNo"),
    title: formData.get("title"),
    agency: formData.get("agency"),
    procurementType: formData.get("procurementType") ?? undefined,
    category: formData.get("category"),
    closingDate: formData.get("closingDate"),
    briefingDate: formData.get("briefingDate"),
    estimatedValue: formData.get("estimatedValue") ?? undefined,
    targetMargin: formData.get("targetMargin") ?? undefined,
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid input.");

  const opp = await createBidOpportunity({
    importText: parsed.data.importText?.trim() || undefined,
    opportunityNo: parsed.data.opportunityNo || undefined,
    title: parsed.data.title || undefined,
    agency: parsed.data.agency || undefined,
    procurementType: parsed.data.procurementType,
    category: parsed.data.category || null,
    closingDate: toDateOrNull(parsed.data.closingDate),
    briefingDate: toDateOrNull(parsed.data.briefingDate),
    estimatedValue: parsed.data.estimatedValue ?? null,
    targetMargin: parsed.data.targetMargin ?? null,
    remarks: parsed.data.remarks || null,
  });

  revalidatePath("/bidding");
  revalidatePath("/bidding/opportunities");
  revalidatePath("/bidding/pipeline");
  redirect(`/bidding/${opp.id}`);
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["WATCHING", "BID_NO_BID", "PREPARING", "PENDING_APPROVAL", "SUBMITTED", "AWARDED", "LOST", "CANCELLED"]),
});

export async function updateBidStatusAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await updateBidOpportunity({ id: parsed.data.id, status: parsed.data.status });
  revalidatePath(`/bidding/${parsed.data.id}`);
  revalidatePath("/bidding/pipeline");
  redirect(`/bidding/${parsed.data.id}`);
}

const upsertCostSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().optional().or(z.literal("")).default(""),
  category: z.enum(["MATERIAL", "LABOUR", "SUBCONTRACTOR", "PRELIMINARIES", "OVERHEAD", "CONTINGENCY", "OTHER"]),
  description: z.string().min(1),
  unit: z.string().optional().or(z.literal("")).default(""),
  quantity: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0),
  unitSell: z.coerce.number().min(0),
  sortOrder: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertBidCostItemAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = upsertCostSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
    category: formData.get("category"),
    description: formData.get("description"),
    unit: formData.get("unit"),
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost"),
    unitSell: formData.get("unitSell"),
    sortOrder: formData.get("sortOrder") ?? undefined,
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid cost item.");

  await upsertBidCostItem({
    opportunityId: parsed.data.opportunityId,
    id: parsed.data.id ? parsed.data.id : null,
    category: parsed.data.category,
    description: parsed.data.description,
    unit: parsed.data.unit || null,
    quantity: parsed.data.quantity,
    unitCost: parsed.data.unitCost,
    unitSell: parsed.data.unitSell,
    sortOrder: parsed.data.sortOrder ?? 0,
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/costing`);
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}/costing`);
}

const deleteCostSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().min(1),
});

export async function deleteBidCostItemAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = deleteCostSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
  });
  if (!parsed.success) throw new Error("Invalid request.");
  await deleteBidCostItem({ opportunityId: parsed.data.opportunityId, id: parsed.data.id });
  revalidatePath(`/bidding/${parsed.data.opportunityId}/costing`);
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}/costing`);
}

const docSchema = z.object({
  opportunityId: z.string().min(1),
  documentName: z.string().min(1),
  documentType: z.string().optional().or(z.literal("")).default(""),
  fileUrl: z.string().optional().or(z.literal("")).default(""),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function addBidDocumentAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = docSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    documentName: formData.get("documentName"),
    documentType: formData.get("documentType"),
    fileUrl: formData.get("fileUrl"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid document input.");

  await addBidDocument({
    opportunityId: parsed.data.opportunityId,
    documentName: parsed.data.documentName,
    documentType: parsed.data.documentType || null,
    fileUrl: parsed.data.fileUrl || null,
    dueDate: toDateOrNull(parsed.data.dueDate),
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/documents`);
  redirect(`/bidding/${parsed.data.opportunityId}/documents`);
}

const checklistSchema = z.object({
  opportunityId: z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLETED", "NOT_APPLICABLE"]),
});

export async function toggleBidChecklistAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = checklistSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    itemId: formData.get("itemId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid checklist update.");
  await toggleChecklistItem({
    opportunityId: parsed.data.opportunityId,
    itemId: parsed.data.itemId,
    status: parsed.data.status,
  });
  revalidatePath(`/bidding/${parsed.data.opportunityId}/documents`);
  redirect(`/bidding/${parsed.data.opportunityId}/documents`);
}

export async function toggleBidComplianceChecklistAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = checklistSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    itemId: formData.get("itemId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid compliance checklist update.");
  await toggleComplianceChecklistItem({
    opportunityId: parsed.data.opportunityId,
    itemId: parsed.data.itemId,
    status: parsed.data.status,
  });
  revalidatePath(`/bidding/${parsed.data.opportunityId}/documents`);
  redirect(`/bidding/${parsed.data.opportunityId}/documents`);
}

const supplierQuoteSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().optional().or(z.literal("")).default(""),
  supplierName: z.string().min(1),
  scopeLabel: z.string().optional().or(z.literal("")).default(""),
  quoteAmount: z.coerce.number().min(0),
  leadTimeDays: z.coerce.number().int().min(0).optional(),
  validityDate: z.string().optional().or(z.literal("")).default(""),
  fileUrl: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertBidSupplierQuoteAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = supplierQuoteSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
    supplierName: formData.get("supplierName"),
    scopeLabel: formData.get("scopeLabel"),
    quoteAmount: formData.get("quoteAmount"),
    leadTimeDays: formData.get("leadTimeDays") ?? undefined,
    validityDate: formData.get("validityDate"),
    fileUrl: formData.get("fileUrl"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid supplier quote.");

  const toDate = (s: string) => {
    const v = s.trim();
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };

  await upsertBidSupplierQuote({
    opportunityId: parsed.data.opportunityId,
    id: parsed.data.id ? parsed.data.id : null,
    supplierName: parsed.data.supplierName,
    scopeLabel: parsed.data.scopeLabel || null,
    quoteAmount: parsed.data.quoteAmount,
    leadTimeDays: parsed.data.leadTimeDays ?? null,
    validityDate: toDate(parsed.data.validityDate),
    fileUrl: parsed.data.fileUrl || null,
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/rfq`);
  redirect(`/bidding/${parsed.data.opportunityId}/rfq`);
}

const supplierQuoteDeleteSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().min(1),
});

export async function deleteBidSupplierQuoteAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = supplierQuoteDeleteSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await deleteBidSupplierQuote({ opportunityId: parsed.data.opportunityId, id: parsed.data.id });
  revalidatePath(`/bidding/${parsed.data.opportunityId}/rfq`);
  redirect(`/bidding/${parsed.data.opportunityId}/rfq`);
}

const initComplianceSchema = z.object({ opportunityId: z.string().min(1) });

export async function initializeBidComplianceChecklistAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = initComplianceSchema.safeParse({ opportunityId: formData.get("opportunityId") });
  if (!parsed.success) throw new Error("Invalid request.");

  await ensureBidComplianceChecklist(parsed.data.opportunityId);
  revalidatePath(`/bidding/${parsed.data.opportunityId}/documents`);
  redirect(`/bidding/${parsed.data.opportunityId}/documents`);
}

const strategySchema = z.object({
  opportunityId: z.string().min(1),
  strategyMode: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]),
  pricingPosition: z.enum(["UNDERCUT", "MATCH", "PREMIUM"]),
  strategyNotes: z.string().optional().or(z.literal("")).default(""),
});

export async function updateBidStrategyAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = strategySchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    strategyMode: formData.get("strategyMode"),
    pricingPosition: formData.get("pricingPosition"),
    strategyNotes: formData.get("strategyNotes"),
  });
  if (!parsed.success) throw new Error("Invalid strategy.");

  await updateBidStrategy({
    opportunityId: parsed.data.opportunityId,
    strategyMode: parsed.data.strategyMode,
    pricingPosition: parsed.data.pricingPosition,
    strategyNotes: parsed.data.strategyNotes || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

const agencyProfileSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().optional().or(z.literal("")).default(""),
  name: z.string().min(1),
  sector: z.string().optional().or(z.literal("")).default(""),
  typicalCategories: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertBidAgencyProfileAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = agencyProfileSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
    name: formData.get("name"),
    sector: formData.get("sector"),
    typicalCategories: formData.get("typicalCategories"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid agency profile.");

  const profile = await upsertBidAgencyProfile({
    id: parsed.data.id ? parsed.data.id : null,
    name: parsed.data.name,
    sector: parsed.data.sector || null,
    typicalCategories: parsed.data.typicalCategories || null,
    notes: parsed.data.notes || null,
  });

  await attachAgencyProfileToOpportunity({ opportunityId: parsed.data.opportunityId, agencyProfileId: profile.id });
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

const competitorSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().optional().or(z.literal("")).default(""),
  competitorName: z.string().min(1),
  quotedPrice: z.coerce.number().optional(),
  isWinner: z.string().optional(),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertBidCompetitorRecordAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = competitorSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
    competitorName: formData.get("competitorName"),
    quotedPrice: formData.get("quotedPrice") ?? undefined,
    isWinner: formData.get("isWinner"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid competitor.");

  await upsertBidCompetitorRecord({
    opportunityId: parsed.data.opportunityId,
    id: parsed.data.id ? parsed.data.id : null,
    competitorName: parsed.data.competitorName,
    quotedPrice: parsed.data.quotedPrice ?? null,
    isWinner: String(parsed.data.isWinner ?? "") === "on",
    notes: parsed.data.notes || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

const competitorDeleteSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().min(1),
});

export async function deleteBidCompetitorRecordAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = competitorDeleteSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await deleteBidCompetitorRecord({ opportunityId: parsed.data.opportunityId, id: parsed.data.id });
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

const winLossSchema = z.object({
  opportunityId: z.string().min(1),
  result: z.enum(["WON", "LOST", "CANCELLED"]),
  awardedValue: z.coerce.number().optional(),
  decisionDate: z.string().optional().or(z.literal("")).default(""),
  lostReason: z.string().optional().or(z.literal("")).default(""),
  winReason: z.string().optional().or(z.literal("")).default(""),
  competitorSummary: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertBidWinLossAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const parsed = winLossSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    result: formData.get("result"),
    awardedValue: formData.get("awardedValue") ?? undefined,
    decisionDate: formData.get("decisionDate"),
    lostReason: formData.get("lostReason"),
    winReason: formData.get("winReason"),
    competitorSummary: formData.get("competitorSummary"),
  });
  if (!parsed.success) throw new Error("Invalid win/loss record.");

  const d = parsed.data.decisionDate.trim() ? new Date(parsed.data.decisionDate.trim()) : null;
  const decisionDate = d && Number.isFinite(d.getTime()) ? d : null;

  await upsertBidWinLossRecord({
    opportunityId: parsed.data.opportunityId,
    result: parsed.data.result,
    awardedValue: parsed.data.awardedValue ?? null,
    decisionDate,
    lostReason: parsed.data.lostReason || null,
    winReason: parsed.data.winReason || null,
    competitorSummary: parsed.data.competitorSummary || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  revalidatePath("/bidding/awarded");
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

const timelineSchema = z.object({
  opportunityId: z.string().min(1),
  id: z.string().optional().or(z.literal("")).default(""),
  milestoneKey: z.string().optional().or(z.literal("")).default(""),
  title: z.string().min(1),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  status: z.enum(["PENDING", "COMPLETED", "MISSED"]).optional(),
  notes: z.string().optional().or(z.literal("")).default(""),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function upsertBidTimelineMilestoneAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const parsed = timelineSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    id: formData.get("id"),
    milestoneKey: formData.get("milestoneKey"),
    title: formData.get("title"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status") ?? undefined,
    notes: formData.get("notes"),
    sortOrder: formData.get("sortOrder") ?? undefined,
  });
  if (!parsed.success) throw new Error("Invalid milestone.");

  const due = parsed.data.dueDate.trim() ? new Date(parsed.data.dueDate.trim()) : null;
  const dueDate = due && Number.isFinite(due.getTime()) ? due : null;

  await upsertBidTimelineMilestone({
    opportunityId: parsed.data.opportunityId,
    id: parsed.data.id ? parsed.data.id : null,
    milestoneKey: parsed.data.milestoneKey || null,
    title: parsed.data.title,
    dueDate,
    status: parsed.data.status,
    notes: parsed.data.notes || null,
    sortOrder: parsed.data.sortOrder ?? 0,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/timeline`);
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}/timeline`);
}

const requestApprovalSchema = z.object({
  opportunityId: z.string().min(1),
  approverName: z.string().min(1),
  approverEmail: z.string().optional().or(z.literal("")).default(""),
  role: z.string().optional().or(z.literal("")).default(""),
});

export async function requestBidApprovalAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "send" });
  const parsed = requestApprovalSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    approverName: formData.get("approverName"),
    approverEmail: formData.get("approverEmail"),
    role: formData.get("role"),
  });
  if (!parsed.success) throw new Error("Invalid approval request.");

  await requestBidApproval({
    opportunityId: parsed.data.opportunityId,
    approverName: parsed.data.approverName,
    approverEmail: parsed.data.approverEmail || null,
    role: parsed.data.role || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/approval`);
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}/approval`);
}

const decideApprovalSchema = z.object({
  opportunityId: z.string().min(1),
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function decideBidApprovalAction(formData: FormData) {
  // Executive-only approvals (director/admin).
  const user = await requireExecutive();
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });

  const parsed = decideApprovalSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    approvalId: formData.get("approvalId"),
    decision: formData.get("decision"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid approval decision.");

  await decideBidApproval({
    opportunityId: parsed.data.opportunityId,
    approvalId: parsed.data.approvalId,
    decision: parsed.data.decision,
    remarks: parsed.data.remarks || null,
    actorName: user.name ?? null,
    actorEmail: user.email ?? null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/approval`);
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  redirect(`/bidding/${parsed.data.opportunityId}/approval`);
}

const markSchema = z.object({ opportunityId: z.string().min(1) });

export async function markBidSubmittedAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "send" });
  const parsed = markSchema.safeParse({ opportunityId: formData.get("opportunityId") });
  if (!parsed.success) throw new Error("Invalid request.");
  await markBidSubmitted({ opportunityId: parsed.data.opportunityId });
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  revalidatePath("/bidding/pipeline");
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

export async function markBidAwardedAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const parsed = markSchema.safeParse({ opportunityId: formData.get("opportunityId") });
  if (!parsed.success) throw new Error("Invalid request.");
  await markBidAwarded({ opportunityId: parsed.data.opportunityId });
  revalidatePath(`/bidding/${parsed.data.opportunityId}`);
  revalidatePath("/bidding/awarded");
  redirect(`/bidding/${parsed.data.opportunityId}`);
}

export async function convertAwardedBidAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const parsed = markSchema.safeParse({ opportunityId: formData.get("opportunityId") });
  if (!parsed.success) throw new Error("Invalid request.");

  try {
    const res = await convertAwardedBidToProjectAndContract({ opportunityId: parsed.data.opportunityId });
    revalidatePath(`/bidding/${parsed.data.opportunityId}`);
    revalidatePath("/projects");
    if (res.projectId) {
      redirect(`/projects/${res.projectId}`);
    }
    redirect(`/bidding/${parsed.data.opportunityId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed.";
    redirect(`/bidding/${parsed.data.opportunityId}/execution?error=${encodeURIComponent(message)}`);
  }
}
