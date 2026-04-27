import "server-only";

import { Prisma, ProgressClaimApprovalStatus, ProgressClaimMethod, ProgressClaimStatus, RetentionEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateProgressClaimNumber } from "@/lib/claims/claim-number";
import { auditLog, createRevision } from "@/lib/audit";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundCurrency(value));
}

export async function getActiveLockedBudget(projectId: string) {
  return await prisma.projectBudget.findFirst({
    where: { projectId, status: "LOCKED", isActive: true },
    orderBy: [{ lockedAt: "desc" }, { versionNo: "desc" }],
    select: { id: true, status: true, isActive: true, totalCost: true, totalRevenue: true, versionNo: true, lockedAt: true },
  });
}

export async function listProgressClaims(projectId: string) {
  return await prisma.progressClaim.findMany({
    where: { projectId },
    orderBy: [{ claimDate: "desc" }, { createdAt: "desc" }],
    include: {
      invoices: {
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: { id: true, invoiceNumber: true, status: true, outstandingAmount: true, totalAmount: true, issueDate: true },
      },
    },
    take: 100,
  });
}

export async function getProgressClaim(params: { projectId: string; claimId: string }) {
  const claim = await prisma.progressClaim.findUnique({
    where: { id: params.claimId },
    include: {
      project: { select: { id: true, name: true, projectCode: true } },
      contract: { select: { id: true, contractNumber: true, status: true, contractValue: true, retentionAmount: true, retentionPercent: true, defectsLiabilityDays: true } },
      budget: { select: { id: true, status: true, isActive: true, versionNo: true } },
      invoices: {
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: { id: true, invoiceNumber: true, status: true, outstandingAmount: true, totalAmount: true, issueDate: true, dueDate: true },
      },
      lines: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          budgetLine: { select: { id: true, tradeKey: true, description: true, costAmount: true, revenueAmount: true } },
          contractMilestone: { select: { id: true, title: true, amount: true, status: true, dueDate: true } },
        },
      },
      approvals: { orderBy: [{ createdAt: "asc" }] },
      retentionEntries: { orderBy: [{ entryDate: "asc" }] },
    },
  });

  if (!claim || claim.projectId !== params.projectId) return null;
  return claim;
}

function computeRetentionDeduction(params: {
  certifiedAmount: number;
  retentionPercent: number;
  retentionCapAmount: number;
  retentionHeldToDate: number;
}) {
  const raw = params.certifiedAmount * params.retentionPercent;
  const remainingCap = Math.max(params.retentionCapAmount - params.retentionHeldToDate, 0);
  const applied = Math.max(Math.min(raw, remainingCap), 0);
  return roundCurrency(applied);
}

async function computeRetentionHeld(projectId: string): Promise<number> {
  const entries = await prisma.retentionLedger.findMany({
    where: { projectId },
    select: { entryType: true, amount: true },
  });

  let held = 0;
  for (const e of entries) {
    const amt = Number(e.amount);
    if (e.entryType === "DEDUCTION") held += amt;
    else held -= amt;
  }
  return roundCurrency(Math.max(held, 0));
}

export async function createProgressClaim(params: {
  projectId: string;
  contractId?: string | null;
  claimDate: Date;
  claimMethod: ProgressClaimMethod;
  percentComplete?: number | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  remarks?: string | null;
  actorUserId: string;
}) {
  const budget = await getActiveLockedBudget(params.projectId);
  if (!budget) {
    throw new Error("Cannot create progress claim. Project has no active locked budget.");
  }

  const contractId =
    params.contractId ??
    (await prisma.contract
      .findFirst({
        where: { projectId: params.projectId, status: { in: ["SIGNED", "FINAL"] } },
        orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      })
      .then((c) => c?.id ?? null)
      .catch(() => null));

  const claimNumber = generateProgressClaimNumber(params.claimDate);

  const created = await prisma.progressClaim.create({
    data: {
      projectId: params.projectId,
      contractId,
      budgetId: budget.id,
      claimNumber,
      claimMethod: params.claimMethod,
      claimDate: params.claimDate,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      percentComplete: params.percentComplete == null ? null : toDecimal(params.percentComplete),
      remarks: params.remarks ?? null,
      status: "DRAFT",
      claimedAmount: toDecimal(0),
      certifiedAmount: toDecimal(0),
      retentionDeductedAmount: toDecimal(0),
      netCertifiedAmount: toDecimal(0),
    },
  });

  await auditLog({
    module: "progress_claim",
    action: "create",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "ProgressClaim",
    entityId: created.id,
    metadata: { claimNumber: created.claimNumber, claimMethod: created.claimMethod },
  });

  await createRevision({
    entityType: "ProgressClaim",
    entityId: created.id,
    projectId: params.projectId,
    actorUserId: params.actorUserId,
    note: "Claim created",
    data: {
      claimNumber: created.claimNumber,
      status: created.status,
      claimDate: created.claimDate,
      claimMethod: created.claimMethod,
    },
  });

  return created;
}

export async function addProgressClaimLine(params: {
  projectId: string;
  claimId: string;
  title: string;
  description?: string | null;
  budgetLineId?: string | null;
  contractMilestoneId?: string | null;
  claimedAmount: number;
  sortOrder: number;
  actorUserId: string;
}) {
  const claim = await prisma.progressClaim.findUnique({ where: { id: params.claimId } });
  if (!claim || claim.projectId !== params.projectId) throw new Error("Claim not found.");
  if (claim.status !== "DRAFT") throw new Error("Only draft claims can be edited.");

  const line = await prisma.progressClaimLine.create({
    data: {
      claimId: claim.id,
      title: params.title,
      description: params.description ?? null,
      budgetLineId: params.budgetLineId ?? null,
      contractMilestoneId: params.contractMilestoneId ?? null,
      claimedAmount: toDecimal(params.claimedAmount),
      certifiedAmount: toDecimal(0),
      sortOrder: params.sortOrder,
    },
  });

  await recalcProgressClaimTotals({ projectId: params.projectId, claimId: claim.id, actorUserId: params.actorUserId });
  return line;
}

export async function recalcProgressClaimTotals(params: { projectId: string; claimId: string; actorUserId?: string }) {
  const claim = await prisma.progressClaim.findUnique({
    where: { id: params.claimId },
    include: { lines: true },
  });
  if (!claim || claim.projectId !== params.projectId) throw new Error("Claim not found.");

  const claimedAmount = claim.lines.reduce((sum, l) => sum + Number(l.claimedAmount), 0);
  const certifiedAmount = claim.lines.reduce((sum, l) => sum + Number(l.certifiedAmount), 0);

  const updated = await prisma.progressClaim.update({
    where: { id: claim.id },
    data: {
      claimedAmount: toDecimal(claimedAmount),
      certifiedAmount: toDecimal(certifiedAmount),
      // retention/net are recomputed when certifying.
    },
  });

  if (params.actorUserId) {
    await auditLog({
      module: "progress_claim",
      action: "recalc",
      actorUserId: params.actorUserId,
      projectId: params.projectId,
      entityType: "ProgressClaim",
      entityId: updated.id,
      metadata: { claimedAmount, certifiedAmount },
    });
  }

  return updated;
}

export async function submitProgressClaim(params: { projectId: string; claimId: string; actorUserId: string }) {
  const claim = await prisma.progressClaim.findUnique({
    where: { id: params.claimId },
    include: { lines: true },
  });
  if (!claim || claim.projectId !== params.projectId) throw new Error("Claim not found.");
  if (claim.status !== "DRAFT") throw new Error("Only draft claims can be submitted.");

  const budget = await getActiveLockedBudget(params.projectId);
  if (!budget) throw new Error("Cannot submit claim. Project has no active locked budget.");

  if (claim.lines.length === 0) throw new Error("Add at least 1 claim line before submitting.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.progressClaim.update({
      where: { id: claim.id },
      data: { status: "SUBMITTED", submittedAt: now, budgetId: budget.id },
    });

    // Create approval placeholders for the workflow.
    const roles: string[] = ["PROJECT_MANAGER", "DIRECTOR", "FINANCE"];
    for (const roleKey of roles) {
      await tx.progressClaimApproval.upsert({
        where: { claimId_roleKey: { claimId: claim.id, roleKey } },
        create: { claimId: claim.id, roleKey, status: "PENDING" },
        update: {},
      });
    }

    return res;
  });

  await auditLog({
    module: "progress_claim",
    action: "submit",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "ProgressClaim",
    entityId: updated.id,
    metadata: { claimNumber: updated.claimNumber, status: updated.status },
  });

  await createRevision({
    entityType: "ProgressClaim",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actorUserId,
    note: "Claim submitted",
    data: { status: updated.status, submittedAt: updated.submittedAt },
  });

  return updated;
}

export async function certifyProgressClaim(params: {
  projectId: string;
  claimId: string;
  certifiedAmount: number;
  retentionPercentOverride?: number | null;
  actorUserId: string;
  actorName?: string | null;
  actorEmail?: string | null;
}) {
  const claim = await prisma.progressClaim.findUnique({
    where: { id: params.claimId },
    include: { contract: true },
  });
  if (!claim || claim.projectId !== params.projectId) throw new Error("Claim not found.");
  if (!["SUBMITTED", "CERTIFIED"].includes(claim.status)) throw new Error("Claim is not in a certifiable state.");

  const contract = claim.contractId
    ? await prisma.contract.findUnique({ where: { id: claim.contractId } })
    : null;

  const retentionPercent =
    params.retentionPercentOverride != null
      ? params.retentionPercentOverride
      : contract
        ? Number(contract.retentionPercent)
        : 0;

  const cap =
    contract && Number(contract.retentionAmount) > 0
      ? Number(contract.retentionAmount)
      : contract
        ? Number(contract.contractValue) * retentionPercent
        : 0;

  const heldToDate = await computeRetentionHeld(params.projectId);
  const retentionDeducted = computeRetentionDeduction({
    certifiedAmount: params.certifiedAmount,
    retentionPercent,
    retentionCapAmount: cap,
    retentionHeldToDate: heldToDate,
  });
  const net = roundCurrency(Math.max(params.certifiedAmount - retentionDeducted, 0));

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.progressClaim.update({
      where: { id: claim.id },
      data: {
        status: "CERTIFIED",
        certifiedAt: now,
        certifiedAmount: toDecimal(params.certifiedAmount),
        retentionDeductedAmount: toDecimal(retentionDeducted),
        netCertifiedAmount: toDecimal(net),
      },
    });

    await tx.progressClaimApproval.updateMany({
      where: { claimId: claim.id, roleKey: "PROJECT_MANAGER" },
      data: {
        status: "APPROVED",
        approverName: params.actorName ?? null,
        approverEmail: params.actorEmail ?? null,
        actedAt: now,
      },
    });

    if (retentionDeducted > 0) {
      await tx.retentionLedger.create({
        data: {
          projectId: params.projectId,
          contractId: claim.contractId ?? null,
          progressClaimId: claim.id,
          entryType: "DEDUCTION",
          entryDate: now,
          amount: toDecimal(retentionDeducted),
          description: `Retention deducted from ${claim.claimNumber}`,
          createdByName: params.actorName ?? null,
          createdByEmail: params.actorEmail ?? null,
        },
      });
    }

    return res;
  });

  await auditLog({
    module: "progress_claim",
    action: "certify",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "ProgressClaim",
    entityId: updated.id,
    metadata: {
      claimNumber: updated.claimNumber,
      certifiedAmount: params.certifiedAmount,
      retentionDeducted,
      netCertifiedAmount: net,
    },
  });

  await createRevision({
    entityType: "ProgressClaim",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actorUserId,
    note: "Claim certified",
    data: { status: updated.status, certifiedAmount: params.certifiedAmount, retentionDeducted, netCertifiedAmount: net },
  });

  return updated;
}

export async function approveProgressClaim(params: {
  projectId: string;
  claimId: string;
  actorUserId: string;
  actorName?: string | null;
  actorEmail?: string | null;
}) {
  const claim = await prisma.progressClaim.findUnique({ where: { id: params.claimId } });
  if (!claim || claim.projectId !== params.projectId) throw new Error("Claim not found.");
  if (claim.status !== "CERTIFIED") throw new Error("Only certified claims can be approved.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.progressClaim.update({
      where: { id: claim.id },
      data: { status: "APPROVED", approvedAt: now },
    });

    await tx.progressClaimApproval.updateMany({
      where: { claimId: claim.id, roleKey: "DIRECTOR" },
      data: {
        status: "APPROVED",
        approverName: params.actorName ?? null,
        approverEmail: params.actorEmail ?? null,
        actedAt: now,
      },
    });

    return res;
  });

  await auditLog({
    module: "progress_claim",
    action: "approve",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "ProgressClaim",
    entityId: updated.id,
    metadata: { claimNumber: updated.claimNumber, status: updated.status },
  });

  await createRevision({
    entityType: "ProgressClaim",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actorUserId,
    note: "Claim approved",
    data: { status: updated.status, approvedAt: updated.approvedAt },
  });

  return updated;
}

export async function rejectProgressClaim(params: {
  projectId: string;
  claimId: string;
  remarks?: string | null;
  actorUserId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  roleKey: "PROJECT_MANAGER" | "DIRECTOR" | "FINANCE";
}) {
  const claim = await prisma.progressClaim.findUnique({ where: { id: params.claimId } });
  if (!claim || claim.projectId !== params.projectId) throw new Error("Claim not found.");
  if (["INVOICED", "PAID", "CANCELLED"].includes(claim.status)) throw new Error("Claim is locked.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.progressClaim.update({
      where: { id: claim.id },
      data: { status: "REJECTED", rejectedAt: now, remarks: params.remarks ?? null },
    });

    await tx.progressClaimApproval.updateMany({
      where: { claimId: claim.id, roleKey: params.roleKey },
      data: {
        status: "REJECTED",
        approverName: params.actorName ?? null,
        approverEmail: params.actorEmail ?? null,
        remarks: params.remarks ?? null,
        actedAt: now,
      },
    });

    return res;
  });

  await auditLog({
    module: "progress_claim",
    action: "reject",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "ProgressClaim",
    entityId: updated.id,
    metadata: { claimNumber: updated.claimNumber, remarks: params.remarks ?? null },
  });

  await createRevision({
    entityType: "ProgressClaim",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actorUserId,
    note: "Claim rejected",
    data: { status: updated.status, rejectedAt: updated.rejectedAt, remarks: updated.remarks },
  });

  return updated;
}

export async function createRetentionRelease(params: {
  projectId: string;
  contractId?: string | null;
  entryType: Exclude<RetentionEntryType, "DEDUCTION">;
  amount: number;
  description?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorUserId: string;
  enforceDlpFinalRelease?: boolean;
}) {
  if (params.amount <= 0) throw new Error("Amount must be positive.");

  if (params.entryType === "RELEASE_FINAL" && params.enforceDlpFinalRelease) {
    const dlp = await prisma.defectLiabilityPeriod.findUnique({
      where: { projectId: params.projectId },
      include: { defects: { select: { id: true, status: true } } },
    });
    if (!dlp) throw new Error("Final retention release blocked: no DLP record found.");
    const open = dlp.defects.filter((d) => d.status !== "CLOSED");
    if (open.length > 0) throw new Error("Final retention release blocked: there are open defects.");
    if (new Date() < dlp.endDate) throw new Error("Final retention release blocked: DLP has not ended.");
  }

  const held = await computeRetentionHeld(params.projectId);
  if (params.amount > held + 0.01) throw new Error("Release amount exceeds retention held.");

  const entry = await prisma.retentionLedger.create({
    data: {
      projectId: params.projectId,
      contractId: params.contractId ?? null,
      entryType: params.entryType,
      entryDate: new Date(),
      amount: toDecimal(params.amount),
      description: params.description ?? null,
      createdByName: params.actorName ?? null,
      createdByEmail: params.actorEmail ?? null,
    },
  });

  await auditLog({
    module: "retention",
    action: "release",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "RetentionLedger",
    entityId: entry.id,
    metadata: { entryType: entry.entryType, amount: params.amount },
  });

  return entry;
}

export async function getRetentionSummary(projectId: string) {
  const entries = await prisma.retentionLedger.findMany({
    where: { projectId },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  let held = 0;
  let deducted = 0;
  let released = 0;
  for (const e of entries) {
    const amt = Number(e.amount);
    if (e.entryType === "DEDUCTION") {
      deducted += amt;
      held += amt;
    } else {
      released += amt;
      held -= amt;
    }
  }

  return {
    held: roundCurrency(Math.max(held, 0)),
    deducted: roundCurrency(deducted),
    released: roundCurrency(released),
    entries,
  };
}

export async function upsertDlp(params: {
  projectId: string;
  contractId?: string | null;
  startDate: Date;
  endDate: Date;
  notes?: string | null;
  actorUserId: string;
}) {
  const dlp = await prisma.defectLiabilityPeriod.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      contractId: params.contractId ?? null,
      startDate: params.startDate,
      endDate: params.endDate,
      notes: params.notes ?? null,
    },
    update: {
      contractId: params.contractId ?? null,
      startDate: params.startDate,
      endDate: params.endDate,
      notes: params.notes ?? null,
    },
  });

  await auditLog({
    module: "dlp",
    action: "upsert",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "DefectLiabilityPeriod",
    entityId: dlp.id,
    metadata: { startDate: dlp.startDate, endDate: dlp.endDate },
  });

  return dlp;
}

export async function createDefectReport(params: {
  projectId: string;
  dlpId?: string | null;
  title: string;
  description?: string | null;
  responsibleVendorId?: string | null;
  responsibleSubcontractId?: string | null;
  actorUserId: string;
}) {
  const defect = await prisma.defectReport.create({
    data: {
      projectId: params.projectId,
      dlpId: params.dlpId ?? null,
      title: params.title,
      description: params.description ?? null,
      status: "OPEN",
      responsibleVendorId: params.responsibleVendorId ?? null,
      responsibleSubcontractId: params.responsibleSubcontractId ?? null,
    },
  });

  await auditLog({
    module: "dlp",
    action: "defect_create",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "DefectReport",
    entityId: defect.id,
    metadata: { title: defect.title, status: defect.status },
  });

  return defect;
}

export async function refreshFinalAccount(params: { projectId: string; actorUserId: string }) {
  const contract = await prisma.contract.findFirst({
    where: { projectId: params.projectId, status: { in: ["SIGNED", "FINAL"] } },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, contractValue: true, totalAmount: true },
  });

  const variations = await prisma.variationOrder.aggregate({
    where: { projectId: params.projectId, status: "APPROVED" },
    _sum: { totalAmount: true },
  });

  const claimsAgg = await prisma.progressClaim.aggregate({
    where: { projectId: params.projectId, status: { in: ["APPROVED", "INVOICED", "PAID"] } },
    _sum: { certifiedAmount: true, retentionDeductedAmount: true },
  });

  const retention = await getRetentionSummary(params.projectId);

  const originalContractSum = contract ? Number(contract.contractValue) : 0;
  const approvedVariationSum = Number(variations._sum.totalAmount ?? 0);
  const certifiedClaimsSum = Number(claimsAgg._sum.certifiedAmount ?? 0);

  const totalContract = originalContractSum + approvedVariationSum;
  const outstandingBalance = roundCurrency(Math.max(totalContract - certifiedClaimsSum, 0));

  const fa = await prisma.finalAccount.upsert({
    where: { projectId: params.projectId },
    create: {
      projectId: params.projectId,
      contractId: contract?.id ?? null,
      status: "DRAFT",
      originalContractSum: toDecimal(originalContractSum),
      approvedVariationSum: toDecimal(approvedVariationSum),
      certifiedClaimsSum: toDecimal(certifiedClaimsSum),
      retentionHeldSum: toDecimal(retention.held),
      retentionReleasedSum: toDecimal(retention.released),
      outstandingBalance: toDecimal(outstandingBalance),
    },
    update: {
      contractId: contract?.id ?? null,
      originalContractSum: toDecimal(originalContractSum),
      approvedVariationSum: toDecimal(approvedVariationSum),
      certifiedClaimsSum: toDecimal(certifiedClaimsSum),
      retentionHeldSum: toDecimal(retention.held),
      retentionReleasedSum: toDecimal(retention.released),
      outstandingBalance: toDecimal(outstandingBalance),
    },
  });

  await auditLog({
    module: "final_account",
    action: "refresh",
    actorUserId: params.actorUserId,
    projectId: params.projectId,
    entityType: "FinalAccount",
    entityId: fa.id,
    metadata: { totalContract, certifiedClaimsSum, retentionHeld: retention.held, outstandingBalance },
  });

  return fa;
}
