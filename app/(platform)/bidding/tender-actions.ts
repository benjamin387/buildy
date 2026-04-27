"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { ensureTenderDocumentRequirements, updateTenderRequirement } from "@/lib/bidding/compliance-service";
import { generateTenderDocument } from "@/lib/bidding/tender-document-generator";
import {
  addPackItem,
  approvePack,
  createSubmissionPack,
  getLatestSubmissionPack,
  releasePack,
  requestPackApproval,
  updatePackItemOrder,
} from "@/lib/bidding/submission-pack-service";

const initSchema = z.object({ opportunityId: z.string().min(1) });

export async function initTenderRequirementsAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const parsed = initSchema.safeParse({ opportunityId: formData.get("opportunityId") });
  if (!parsed.success) throw new Error("Invalid request.");

  await ensureTenderDocumentRequirements({
    opportunityId: parsed.data.opportunityId,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/compliance`);
  redirect(`/bidding/${parsed.data.opportunityId}/compliance`);
}

const requirementSchema = z.object({
  opportunityId: z.string().min(1),
  requirementId: z.string().min(1),
  status: z.enum(["PENDING", "PROVIDED", "WAIVED", "NOT_APPLICABLE"]),
  complianceDocumentId: z.string().optional().or(z.literal("")).default(""),
  generatedDocumentId: z.string().optional().or(z.literal("")).default(""),
  satisfiedByUrl: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function updateTenderRequirementAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const parsed = requirementSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    requirementId: formData.get("requirementId"),
    status: formData.get("status"),
    complianceDocumentId: formData.get("complianceDocumentId"),
    generatedDocumentId: formData.get("generatedDocumentId"),
    satisfiedByUrl: formData.get("satisfiedByUrl"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid update.");

  await updateTenderRequirement({
    requirementId: parsed.data.requirementId,
    status: parsed.data.status,
    complianceDocumentId: parsed.data.complianceDocumentId.trim() || null,
    generatedDocumentId: parsed.data.generatedDocumentId.trim() || null,
    satisfiedByUrl: parsed.data.satisfiedByUrl.trim() || null,
    notes: parsed.data.notes.trim() || null,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/compliance`);
  redirect(`/bidding/${parsed.data.opportunityId}/compliance`);
}

const genSchema = z.object({
  opportunityId: z.string().min(1),
  docType: z.enum([
    "COMPANY_PROFILE",
    "METHOD_STATEMENT",
    "ORGANISATION_CHART",
    "SAFETY_PLAN",
    "MANPOWER_PLAN",
    "WORK_SCHEDULE",
    "PROJECT_EXPERIENCE",
    "DECLARATIONS_CHECKLIST",
    "SUBMISSION_COVER_LETTER",
  ]),
});

export async function generateTenderDocumentAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const parsed = genSchema.safeParse({ opportunityId: formData.get("opportunityId"), docType: formData.get("docType") });
  if (!parsed.success) throw new Error("Invalid request.");

  await generateTenderDocument({
    opportunityId: parsed.data.opportunityId,
    docType: parsed.data.docType as any,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/documents/generator`);
  redirect(`/bidding/${parsed.data.opportunityId}/documents/generator`);
}

const createPackSchema = z.object({
  opportunityId: z.string().min(1),
  title: z.string().optional().or(z.literal("")).default(""),
});

export async function createTenderSubmissionPackAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const parsed = createPackSchema.safeParse({ opportunityId: formData.get("opportunityId"), title: formData.get("title") });
  if (!parsed.success) throw new Error("Invalid request.");

  await createSubmissionPack({
    opportunityId: parsed.data.opportunityId,
    title: parsed.data.title.trim() || null,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/submission-pack`);
  redirect(`/bidding/${parsed.data.opportunityId}/submission-pack`);
}

const addItemSchema = z.object({
  opportunityId: z.string().min(1),
  packId: z.string().min(1),
  sourceType: z.enum(["COMPLIANCE_DOCUMENT", "GENERATED_DOCUMENT", "BID_DOCUMENT", "MANUAL_URL"]),
  complianceDocumentId: z.string().optional().or(z.literal("")).default(""),
  generatedDocumentId: z.string().optional().or(z.literal("")).default(""),
  manualUrl: z.string().optional().or(z.literal("")).default(""),
  title: z.string().min(1),
  category: z.string().optional().or(z.literal("")).default(""),
});

export async function addPackItemAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const parsed = addItemSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    packId: formData.get("packId"),
    sourceType: formData.get("sourceType"),
    complianceDocumentId: formData.get("complianceDocumentId"),
    generatedDocumentId: formData.get("generatedDocumentId"),
    manualUrl: formData.get("manualUrl"),
    title: formData.get("title"),
    category: formData.get("category"),
  });
  if (!parsed.success) throw new Error("Invalid item.");

  await addPackItem({
    packId: parsed.data.packId,
    sourceType: parsed.data.sourceType,
    complianceDocumentId: parsed.data.complianceDocumentId.trim() || null,
    generatedDocumentId: parsed.data.generatedDocumentId.trim() || null,
    manualUrl: parsed.data.manualUrl.trim() || null,
    title: parsed.data.title,
    category: parsed.data.category.trim() || null,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/submission-pack`);
  redirect(`/bidding/${parsed.data.opportunityId}/submission-pack`);
}

const reorderSchema = z.object({
  opportunityId: z.string().min(1),
  packId: z.string().min(1),
  itemId: z.array(z.string().min(1)),
  sortOrder: z.array(z.coerce.number().int().min(0)),
});

export async function reorderPackItemsAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();

  const itemIds = formData.getAll("itemId").map((v) => String(v));
  const sortOrders = formData.getAll("sortOrder").map((v) => Number(v));
  const parsed = reorderSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    packId: formData.get("packId"),
    itemId: itemIds,
    sortOrder: sortOrders,
  });
  if (!parsed.success) throw new Error("Invalid reorder.");
  const orders = parsed.data.itemId.map((id, idx) => ({ itemId: id, sortOrder: parsed.data.sortOrder[idx] ?? idx }));

  await updatePackItemOrder({
    packId: parsed.data.packId,
    orders,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/submission-pack`);
  redirect(`/bidding/${parsed.data.opportunityId}/submission-pack`);
}

const packActionSchema = z.object({
  opportunityId: z.string().min(1),
  packId: z.string().min(1),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function requestPackApprovalAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const user = await requireUser();
  const parsed = packActionSchema.safeParse({ opportunityId: formData.get("opportunityId"), packId: formData.get("packId"), remarks: "" });
  if (!parsed.success) throw new Error("Invalid request.");

  await requestPackApproval({
    packId: parsed.data.packId,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/submission-pack`);
  redirect(`/bidding/${parsed.data.opportunityId}/submission-pack`);
}

export async function approvePackAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const executive = await requireExecutive();
  const parsed = packActionSchema.safeParse({ opportunityId: formData.get("opportunityId"), packId: formData.get("packId"), remarks: formData.get("remarks") });
  if (!parsed.success) throw new Error("Invalid request.");

  await approvePack({
    packId: parsed.data.packId,
    approver: { name: executive.name, email: executive.email, role: executive.primaryRoleLabel },
    remarks: parsed.data.remarks.trim() || null,
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/submission-pack`);
  redirect(`/bidding/${parsed.data.opportunityId}/submission-pack`);
}

export async function releasePackAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const executive = await requireExecutive();
  const parsed = packActionSchema.safeParse({ opportunityId: formData.get("opportunityId"), packId: formData.get("packId"), remarks: "" });
  if (!parsed.success) throw new Error("Invalid request.");

  await releasePack({
    packId: parsed.data.packId,
    actor: { name: executive.name, email: executive.email, role: executive.primaryRoleLabel },
  });

  revalidatePath(`/bidding/${parsed.data.opportunityId}/submission-pack`);
  redirect(`/bidding/${parsed.data.opportunityId}/submission-pack`);
}

export async function ensurePackExists(opportunityId: string) {
  const existing = await getLatestSubmissionPack(opportunityId);
  if (existing) return existing;
  const user = await requireUser();
  return createSubmissionPack({
    opportunityId,
    title: null,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });
}

