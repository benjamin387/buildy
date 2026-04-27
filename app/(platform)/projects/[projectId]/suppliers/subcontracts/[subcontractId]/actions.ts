"use server";

import { Permission } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  certifySubcontractClaim,
  createSubcontractClaim,
  markSubcontractClaimPaid,
} from "@/lib/suppliers/service";

function toDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

const createClaimSchema = z.object({
  projectId: z.string().min(1),
  subcontractId: z.string().min(1),
  claimDate: z.string().min(1),
  claimedAmount: z.coerce.number().finite().min(0),
  certifiedAmount: z.coerce.number().finite().min(0).optional().default(0),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function createSubcontractClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const subcontractId = String(formData.get("subcontractId") ?? "");
  const parsed = createClaimSchema.safeParse({
    projectId,
    subcontractId,
    claimDate: formData.get("claimDate"),
    claimedAmount: formData.get("claimedAmount"),
    certifiedAmount: formData.get("certifiedAmount"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid claim input.");

  const { userId } = await requirePermission({ permission: Permission.SUBCONTRACT_WRITE, projectId });

  const claim = await createSubcontractClaim({
    projectId,
    subcontractId,
    claimDate: toDate(parsed.data.claimDate),
    claimedAmount: parsed.data.claimedAmount,
    certifiedAmount: parsed.data.certifiedAmount ?? 0,
    notes: parsed.data.notes || null,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Subcontract claim submitted: ${claim.claimNumber}`,
      createdById: userId,
      metadata: { subcontractId, claimId: claim.id, claimNumber: claim.claimNumber },
    },
  });

  await auditLog({
    module: "subcontract_claim",
    action: "create",
    actorUserId: userId,
    projectId,
    entityType: "SubcontractClaim",
    entityId: claim.id,
    metadata: { claimNumber: claim.claimNumber, subcontractId },
  });

  await createRevision({
    entityType: "SubcontractClaim",
    entityId: claim.id,
    projectId,
    actorUserId: userId,
    note: "Claim submitted",
    data: {
      claimNumber: claim.claimNumber,
      claimedAmount: Number(claim.claimedAmount),
      certifiedAmount: Number(claim.certifiedAmount),
      status: claim.status,
    },
  });

  revalidatePath(`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`);
  redirect(`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`);
}

const certifyClaimSchema = z.object({
  projectId: z.string().min(1),
  subcontractId: z.string().min(1),
  subcontractClaimId: z.string().min(1),
  certifiedAmount: z.coerce.number().finite().min(0),
});

export async function certifySubcontractClaimAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const subcontractId = String(formData.get("subcontractId") ?? "");
  const parsed = certifyClaimSchema.safeParse({
    projectId,
    subcontractId,
    subcontractClaimId: formData.get("subcontractClaimId"),
    certifiedAmount: formData.get("certifiedAmount"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.SUBCONTRACT_WRITE, projectId });

  const claim = await certifySubcontractClaim({
    projectId,
    subcontractClaimId: parsed.data.subcontractClaimId,
    certifiedAmount: parsed.data.certifiedAmount,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Subcontract claim certified: ${claim.claimNumber}`,
      createdById: userId,
      metadata: { subcontractId, claimId: claim.id, claimNumber: claim.claimNumber },
    },
  });

  await auditLog({
    module: "subcontract_claim",
    action: "certify",
    actorUserId: userId,
    projectId,
    entityType: "SubcontractClaim",
    entityId: claim.id,
    metadata: { claimNumber: claim.claimNumber, certifiedAmount: parsed.data.certifiedAmount },
  });

  await createRevision({
    entityType: "SubcontractClaim",
    entityId: claim.id,
    projectId,
    actorUserId: userId,
    note: "Claim certified",
    data: {
      claimNumber: claim.claimNumber,
      certifiedAmount: Number(claim.certifiedAmount),
      status: claim.status,
    },
  });

  revalidatePath(`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`);
  redirect(`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`);
}

const markPaidSchema = z.object({
  projectId: z.string().min(1),
  subcontractId: z.string().min(1),
  subcontractClaimId: z.string().min(1),
});

export async function markSubcontractClaimPaidAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const subcontractId = String(formData.get("subcontractId") ?? "");
  const parsed = markPaidSchema.safeParse({
    projectId,
    subcontractId,
    subcontractClaimId: formData.get("subcontractClaimId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.SUBCONTRACT_WRITE, projectId });

  const claim = await markSubcontractClaimPaid({
    projectId,
    subcontractClaimId: parsed.data.subcontractClaimId,
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "NOTE",
      title: `Subcontract claim paid: ${claim.claimNumber}`,
      createdById: userId,
      metadata: { subcontractId, claimId: claim.id, claimNumber: claim.claimNumber },
    },
  });

  await auditLog({
    module: "subcontract_claim",
    action: "mark_paid",
    actorUserId: userId,
    projectId,
    entityType: "SubcontractClaim",
    entityId: claim.id,
    metadata: { claimNumber: claim.claimNumber },
  });

  await createRevision({
    entityType: "SubcontractClaim",
    entityId: claim.id,
    projectId,
    actorUserId: userId,
    note: "Claim marked as paid",
    data: { claimNumber: claim.claimNumber, status: claim.status },
  });

  revalidatePath(`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`);
  redirect(`/projects/${projectId}/suppliers/subcontracts/${subcontractId}`);
}

