"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission, ProgressClaimMethod } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import {
  addProgressClaimLine,
  approveProgressClaim,
  certifyProgressClaim,
  createProgressClaim,
  rejectProgressClaim,
  recalcProgressClaimTotals,
  submitProgressClaim,
} from "@/lib/claims/service";
import { createManualInvoice } from "@/lib/invoices/service";
import { prisma } from "@/lib/prisma";

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const createClaimSchema = z.object({
  projectId: z.string().min(1),
  claimDate: z.string().min(1),
  claimMethod: z.nativeEnum(ProgressClaimMethod),
  percentComplete: z.coerce.number().finite().min(0).max(1).optional(),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function createProgressClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = createClaimSchema.safeParse({
    projectId,
    claimDate: formData.get("claimDate"),
    claimMethod: formData.get("claimMethod"),
    percentComplete: formData.get("percentComplete"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid claim input.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const user = await requireUser();

  const claim = await createProgressClaim({
    projectId,
    claimDate: toDate(parsed.data.claimDate),
    claimMethod: parsed.data.claimMethod,
    percentComplete:
      parsed.data.claimMethod === "PERCENTAGE" ? (parsed.data.percentComplete ?? null) : null,
    remarks: parsed.data.remarks || null,
    actorUserId: userId,
    contractId: null,
  });

  revalidatePath(`/projects/${projectId}/claims`);
  redirect(`/projects/${projectId}/claims/${claim.id}`);
}

const addLineSchema = z.object({
  projectId: z.string().min(1),
  claimId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().or(z.literal("")).default(""),
  claimedAmount: z.coerce.number().finite().min(0),
  budgetLineId: z.string().optional().or(z.literal("")).default(""),
  contractMilestoneId: z.string().optional().or(z.literal("")).default(""),
});

export async function addProgressClaimLineAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = addLineSchema.safeParse({
    projectId,
    claimId,
    title: formData.get("title"),
    description: formData.get("description"),
    claimedAmount: formData.get("claimedAmount"),
    budgetLineId: formData.get("budgetLineId"),
    contractMilestoneId: formData.get("contractMilestoneId"),
  });
  if (!parsed.success) throw new Error("Invalid claim line input.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const existing = await prisma.progressClaimLine.count({ where: { claimId } });
  await addProgressClaimLine({
    projectId,
    claimId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    claimedAmount: parsed.data.claimedAmount,
    budgetLineId: parsed.data.budgetLineId || null,
    contractMilestoneId: parsed.data.contractMilestoneId || null,
    sortOrder: existing,
    actorUserId: userId,
  });

  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  redirect(`/projects/${projectId}/claims/${claimId}`);
}

const submitSchema = z.object({
  projectId: z.string().min(1),
  claimId: z.string().min(1),
});

export async function submitProgressClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = submitSchema.safeParse({ projectId, claimId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  await submitProgressClaim({ projectId, claimId, actorUserId: userId });

  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  redirect(`/projects/${projectId}/claims/${claimId}`);
}

const certifySchema = z.object({
  projectId: z.string().min(1),
  claimId: z.string().min(1),
  certifiedAmount: z.coerce.number().finite().min(0),
  retentionPercentOverride: z.coerce.number().finite().min(0).max(1).optional(),
});

export async function certifyProgressClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = certifySchema.safeParse({
    projectId,
    claimId,
    certifiedAmount: formData.get("certifiedAmount"),
    retentionPercentOverride: formData.get("retentionPercentOverride"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const user = await requireUser();

  await certifyProgressClaim({
    projectId,
    claimId,
    certifiedAmount: parsed.data.certifiedAmount,
    retentionPercentOverride: parsed.data.retentionPercentOverride ?? null,
    actorUserId: userId,
    actorName: user.name ?? null,
    actorEmail: user.email,
  });

  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  redirect(`/projects/${projectId}/claims/${claimId}`);
}

export async function approveProgressClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = submitSchema.safeParse({ projectId, claimId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.CONTRACT_APPROVE, projectId });
  const user = await requireUser();

  await approveProgressClaim({
    projectId,
    claimId,
    actorUserId: userId,
    actorName: user.name ?? null,
    actorEmail: user.email,
  });

  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  redirect(`/projects/${projectId}/claims/${claimId}`);
}

const rejectSchema = z.object({
  projectId: z.string().min(1),
  claimId: z.string().min(1),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function rejectProgressClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = rejectSchema.safeParse({
    projectId,
    claimId,
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const user = await requireUser();

  await rejectProgressClaim({
    projectId,
    claimId,
    actorUserId: userId,
    actorName: user.name ?? null,
    actorEmail: user.email,
    roleKey: "PROJECT_MANAGER",
    remarks: parsed.data.remarks || null,
  });

  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  redirect(`/projects/${projectId}/claims/${claimId}`);
}

export async function createInvoiceFromProgressClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = submitSchema.safeParse({ projectId, claimId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });

  const claim = await prisma.progressClaim.findUnique({
    where: { id: claimId },
    include: { invoices: { select: { id: true } }, contract: true },
  });
  if (!claim || claim.projectId !== projectId) throw new Error("Claim not found.");
  if (!["APPROVED", "INVOICED"].includes(claim.status)) throw new Error("Claim must be approved before invoicing.");

  const invoice = await createManualInvoice({
    projectId,
    contractId: claim.contractId ?? null,
    quotationId: null,
    variationOrderId: null,
    progressClaimId: claim.id,
    invoiceType: "PROGRESS",
    issueDate: new Date(),
    dueDate: null,
    discountAmount: 0,
    title: `Progress Claim ${claim.claimNumber}`,
    notes: null,
    lines: [
      {
        description: `Progress claim certified net amount (${claim.claimNumber})`,
        unit: "lot",
        quantity: 1,
        unitPrice: Number(claim.netCertifiedAmount),
        sortOrder: 0,
      },
    ],
  });

  // Mark as invoiced once at least one invoice exists. Multiple invoices are allowed.
  if (claim.status !== "INVOICED") {
    await prisma.progressClaim.update({
      where: { id: claim.id },
      data: { status: "INVOICED" },
    });
  }

  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  revalidatePath(`/projects/${projectId}/invoices`);
  redirect(`/projects/${projectId}/invoices/${invoice.id}`);
}

export async function recalcProgressClaimTotalsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const claimId = String(formData.get("claimId") ?? "");
  const parsed = submitSchema.safeParse({ projectId, claimId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  await recalcProgressClaimTotals({ projectId, claimId, actorUserId: userId });
  revalidatePath(`/projects/${projectId}/claims/${claimId}`);
  redirect(`/projects/${projectId}/claims/${claimId}`);
}
