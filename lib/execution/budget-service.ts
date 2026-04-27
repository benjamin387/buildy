import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auditLog, createRevision } from "@/lib/audit";

export type ExecutionActor = {
  userId: string | null;
  name: string | null;
  email: string | null;
  roleKeys: string[];
  isAdmin: boolean;
};

function toMoney(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export async function listProjectBudgets(projectId: string) {
  return prisma.projectBudget.findMany({
    where: { projectId },
    orderBy: [{ versionNo: "desc" }, { createdAt: "desc" }],
    include: {
      lines: { select: { id: true } },
      bidCostVersion: { select: { id: true, versionNo: true, status: true } },
    },
    take: 50,
  });
}

export async function getActiveLockedBudget(projectId: string) {
  const active = await prisma.projectBudget.findFirst({
    where: { projectId, status: "LOCKED", isActive: true },
    orderBy: [{ lockedAt: "desc" }, { versionNo: "desc" }],
    include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (active) return active;

  return prisma.projectBudget.findFirst({
    where: { projectId, status: "LOCKED" },
    orderBy: [{ lockedAt: "desc" }, { versionNo: "desc" }],
    include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
}

export async function createBudgetRevisionFromActiveLocked(params: {
  projectId: string;
  actor: ExecutionActor;
  note?: string | null;
}) {
  const baseline = await getActiveLockedBudget(params.projectId);
  if (!baseline) throw new Error("No locked budget baseline found for this project.");

  const nextVersion = (await prisma.projectBudget.aggregate({
    where: { projectId: params.projectId },
    _max: { versionNo: true },
  }))._max.versionNo ?? 0;

  const created = await prisma.projectBudget.create({
    data: {
      projectId: params.projectId,
      sourceType: baseline.sourceType,
      bidOpportunityId: baseline.bidOpportunityId ?? null,
      bidCostVersionId: baseline.bidCostVersionId ?? null,
      quotationId: baseline.quotationId ?? null,
      createdFromBudgetId: baseline.id,
      versionNo: nextVersion + 1,
      status: "DRAFT",
      isActive: false,
      lockedAt: null,
      lockedByName: null,
      lockedByEmail: null,
      unlockedAt: null,
      unlockedByName: null,
      unlockedByEmail: null,
      unlockReason: null,
      createdByName: params.actor.name,
      createdByEmail: params.actor.email,
      totalCost: baseline.totalCost,
      totalRevenue: baseline.totalRevenue,
      notes: params.note ?? `Revision created from budget v${baseline.versionNo}.`,
      lines: {
        create: baseline.lines.map((l, idx) => ({
          tradeKey: l.tradeKey,
          description: l.description,
          costAmount: l.costAmount,
          revenueAmount: l.revenueAmount,
          sourceCostVersionLineId: l.sourceCostVersionLineId ?? null,
          sortOrder: l.sortOrder ?? idx,
          notes: l.notes ?? null,
        })),
      },
    },
  });

  await auditLog({
    module: "execution",
    action: "create_budget_revision",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "ProjectBudget",
    entityId: created.id,
    metadata: { fromBudgetId: baseline.id, fromVersion: baseline.versionNo, newVersion: created.versionNo },
  });

  await createRevision({
    entityType: "ProjectBudget",
    entityId: created.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Budget revision created",
    data: {
      versionNo: created.versionNo,
      status: created.status,
      totalCost: Number(created.totalCost),
      totalRevenue: Number(created.totalRevenue),
      createdFromBudgetId: baseline.id,
    },
  });

  return created;
}

export async function lockBudget(params: {
  projectId: string;
  budgetId: string;
  actor: ExecutionActor;
}) {
  const budget = await prisma.projectBudget.findUnique({ where: { id: params.budgetId } });
  if (!budget || budget.projectId !== params.projectId) throw new Error("Budget not found.");
  if (budget.status === "LOCKED" && budget.isActive) return budget;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectBudget.updateMany({
      where: { projectId: params.projectId, isActive: true },
      data: { isActive: false },
    });

    return tx.projectBudget.update({
      where: { id: params.budgetId },
      data: {
        status: "LOCKED",
        isActive: true,
        lockedAt: new Date(),
        lockedByName: params.actor.name,
        lockedByEmail: params.actor.email,
        unlockedAt: null,
        unlockedByName: null,
        unlockedByEmail: null,
        unlockReason: null,
      },
    });
  });

  await auditLog({
    module: "execution",
    action: "lock_budget",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "ProjectBudget",
    entityId: updated.id,
    metadata: { versionNo: updated.versionNo },
  });

  await createRevision({
    entityType: "ProjectBudget",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Budget locked",
    data: { status: updated.status, lockedAt: updated.lockedAt?.toISOString() ?? null, isActive: updated.isActive },
  });

  return updated;
}

export async function unlockBudget(params: {
  projectId: string;
  budgetId: string;
  actor: ExecutionActor;
  reason: string;
}) {
  const budget = await prisma.projectBudget.findUnique({ where: { id: params.budgetId } });
  if (!budget || budget.projectId !== params.projectId) throw new Error("Budget not found.");
  if (budget.status !== "LOCKED") throw new Error("Only locked budgets can be unlocked.");

  const updated = await prisma.projectBudget.update({
    where: { id: budget.id },
    data: {
      status: "DRAFT",
      isActive: false,
      unlockedAt: new Date(),
      unlockedByName: params.actor.name,
      unlockedByEmail: params.actor.email,
      unlockReason: params.reason.trim(),
    },
  });

  await auditLog({
    module: "execution",
    action: "unlock_budget",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "ProjectBudget",
    entityId: updated.id,
    metadata: { versionNo: updated.versionNo, reason: params.reason.trim() },
  });

  await createRevision({
    entityType: "ProjectBudget",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Budget unlocked",
    data: { status: updated.status, unlockedAt: updated.unlockedAt?.toISOString() ?? null, reason: params.reason.trim() },
  });

  return updated;
}

export async function createBudgetRevisionFromApprovedVariation(params: {
  projectId: string;
  variationOrderId: string;
  actor: ExecutionActor;
}) {
  const vo = await prisma.variationOrder.findUnique({
    where: { id: params.variationOrderId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!vo || vo.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (vo.status !== "APPROVED" && vo.status !== "INVOICED") throw new Error("Variation order is not approved.");

  const baseline = await getActiveLockedBudget(params.projectId);
  if (!baseline) return null; // execution baseline not in use for this project

  const nextVersion = (await prisma.projectBudget.aggregate({
    where: { projectId: params.projectId },
    _max: { versionNo: true },
  }))._max.versionNo ?? 0;

  const voRevenue = toMoney(Number(vo.subtotal ?? 0));
  const voCost = toMoney(Number(vo.costSubtotal ?? 0));

  const created = await prisma.$transaction(async (tx) => {
    await tx.projectBudget.updateMany({
      where: { projectId: params.projectId, isActive: true },
      data: { isActive: false },
    });

    const next = await tx.projectBudget.create({
      data: {
        projectId: params.projectId,
        sourceType: baseline.sourceType,
        bidOpportunityId: baseline.bidOpportunityId ?? null,
        bidCostVersionId: baseline.bidCostVersionId ?? null,
        quotationId: baseline.quotationId ?? null,
        createdFromBudgetId: baseline.id,
        versionNo: nextVersion + 1,
        status: "LOCKED",
        isActive: true,
        lockedAt: new Date(),
        lockedByName: params.actor.name,
        lockedByEmail: params.actor.email,
        createdByName: params.actor.name,
        createdByEmail: params.actor.email,
        totalCost: new Prisma.Decimal(toMoney(Number(baseline.totalCost) + voCost)),
        totalRevenue: new Prisma.Decimal(toMoney(Number(baseline.totalRevenue) + voRevenue)),
        notes: `Auto revision from approved VO ${vo.referenceNumber}.`,
        lines: {
          create: [
            ...baseline.lines.map((l, idx) => ({
              tradeKey: l.tradeKey,
              description: l.description,
              costAmount: l.costAmount,
              revenueAmount: l.revenueAmount,
              sourceCostVersionLineId: l.sourceCostVersionLineId ?? null,
              sortOrder: l.sortOrder ?? idx,
              notes: l.notes ?? null,
            })),
            {
              tradeKey: "OTHER",
              description: `Approved VO ${vo.referenceNumber}: ${vo.title}`,
              costAmount: new Prisma.Decimal(voCost),
              revenueAmount: new Prisma.Decimal(voRevenue),
              sourceCostVersionLineId: null,
              sortOrder: 10_000,
              notes: "Auto-added from approved variation order.",
            },
          ],
        },
      },
    });

    return next;
  });

  await auditLog({
    module: "execution",
    action: "budget_revision_from_vo",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "ProjectBudget",
    entityId: created.id,
    metadata: { fromBudgetId: baseline.id, fromVersion: baseline.versionNo, newVersion: created.versionNo, variationOrderId: vo.id },
  });

  await createRevision({
    entityType: "ProjectBudget",
    entityId: created.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Auto budget revision from approved VO",
    data: {
      variationOrderId: vo.id,
      referenceNumber: vo.referenceNumber,
      voRevenue,
      voCost,
      totalRevenue: Number(created.totalRevenue),
      totalCost: Number(created.totalCost),
    },
  });

  return created;
}

