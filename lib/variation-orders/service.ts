import "server-only";

import { Permission, Prisma, type VariationApprovalStatus, type VariationOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeVariationTotals, toDecimal, type VariationItemInput } from "@/lib/variation-orders/engine";
import { generateVariationOrderReference } from "@/lib/variation-orders/reference";
import { getProjectGstRate } from "@/lib/invoices/service";
import { createManualInvoice } from "@/lib/invoices/service";
import { auditLog, createRevision } from "@/lib/audit";
import { refreshProjectPnlAlerts } from "@/lib/pnl/alerts";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { createBudgetRevisionFromApprovedVariation } from "@/lib/execution/budget-service";
import { refreshProjectExecutionAlerts } from "@/lib/execution/alerts";

function canEditStatus(status: VariationOrderStatus): boolean {
  return status === "DRAFT";
}

function canSubmitStatus(status: VariationOrderStatus): boolean {
  return status === "DRAFT";
}

function canApproveStatus(status: VariationOrderStatus): boolean {
  return status === "PENDING_APPROVAL";
}

function canInvoiceStatus(status: VariationOrderStatus): boolean {
  return status === "APPROVED" || status === "INVOICED";
}

export async function getVariationById(params: { projectId: string; variationId: string }) {
  const vo = await prisma.variationOrder.findUnique({
    where: { id: params.variationId },
    include: {
      project: { include: { client: true, commercialProfile: true } },
      contract: true,
      quotation: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      approvals: { orderBy: [{ createdAt: "asc" }] },
      invoices: { orderBy: [{ createdAt: "desc" }] },
    },
  });
  if (!vo || vo.projectId !== params.projectId) return null;
  return vo;
}

export async function listVariationsByProject(projectId: string) {
  const vos = await prisma.variationOrder.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      approvals: true,
      invoices: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } },
    },
    take: 200,
  });
  return vos;
}

export async function createVariationDraft(params: {
  projectId: string;
  title: string;
  description?: string | null;
  reason?: string | null;
  requestedBy?: string | null;
  contractId?: string | null;
  quotationId?: string | null;
  timeImpactDays?: number | null;
  items: VariationItemInput[];
}) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId: params.projectId });

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeVariationTotals({ items: params.items, gstRate });

  const now = new Date();
  const vo = await prisma.variationOrder.create({
    data: {
      projectId: params.projectId,
      referenceNumber: generateVariationOrderReference(now),
      status: "DRAFT",
      title: params.title,
      description: params.description ?? null,
      reason: params.reason ?? null,
      requestedBy: params.requestedBy ?? null,
      contractId: params.contractId ?? null,
      quotationId: params.quotationId ?? null,
      timeImpactDays: Math.max(0, Math.floor(params.timeImpactDays ?? 0)),
      costImpact: toDecimal(computed.totals.costImpact),
      subtotal: toDecimal(computed.totals.subtotal),
      gstAmount: toDecimal(computed.totals.gstAmount),
      totalAmount: toDecimal(computed.totals.totalAmount),
      costSubtotal: toDecimal(computed.totals.costSubtotal),
      lineItems: {
        create: computed.items.map((i) => ({
          itemId: i.itemId ?? null,
          sku: i.sku?.trim() ? i.sku.trim() : null,
          description: i.description,
          unit: i.unit || "lot",
          quantity: toDecimal(i.quantity),
          unitPrice: toDecimal(i.unitPrice),
          totalPrice: toDecimal(i.totalPrice),
          costPrice: toDecimal(i.costPrice),
          totalCost: toDecimal(i.totalCost),
          profitAmount: toDecimal(i.profitAmount),
          marginPercent: new Prisma.Decimal(i.marginPercent),
          sortOrder: i.sortOrder,
        })),
      },
    },
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId: params.projectId,
      type: "VARIATION_ORDER",
      title: `VO drafted: ${vo.referenceNumber}`,
      createdById: userId,
      metadata: { variationOrderId: vo.id, referenceNumber: vo.referenceNumber },
    },
  });

  await auditLog({
    module: "vo",
    action: "create",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: vo.id,
    metadata: { referenceNumber: vo.referenceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: vo.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: "Draft created",
    data: {
      status: vo.status,
      title: vo.title,
      subtotal: computed.totals.subtotal,
      costSubtotal: computed.totals.costSubtotal,
      gstAmount: computed.totals.gstAmount,
      totalAmount: computed.totals.totalAmount,
      timeImpactDays: vo.timeImpactDays,
    },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return vo;
}

export async function updateVariationDraft(params: {
  projectId: string;
  variationId: string;
  title: string;
  description?: string | null;
  reason?: string | null;
  requestedBy?: string | null;
  contractId?: string | null;
  quotationId?: string | null;
  timeImpactDays?: number | null;
  items: VariationItemInput[];
}) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId: params.projectId });

  const existing = await prisma.variationOrder.findUnique({
    where: { id: params.variationId },
    include: { lineItems: true },
  });
  if (!existing || existing.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (!canEditStatus(existing.status)) throw new Error("Variation order is locked.");

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeVariationTotals({ items: params.items, gstRate });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.variationOrderItem.deleteMany({ where: { variationOrderId: existing.id } });

    return tx.variationOrder.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        description: params.description ?? null,
        reason: params.reason ?? null,
        requestedBy: params.requestedBy ?? null,
        contractId: params.contractId ?? null,
        quotationId: params.quotationId ?? null,
        timeImpactDays: Math.max(0, Math.floor(params.timeImpactDays ?? 0)),
        costImpact: toDecimal(computed.totals.costImpact),
        subtotal: toDecimal(computed.totals.subtotal),
        gstAmount: toDecimal(computed.totals.gstAmount),
        totalAmount: toDecimal(computed.totals.totalAmount),
        costSubtotal: toDecimal(computed.totals.costSubtotal),
        lineItems: {
          create: computed.items.map((i) => ({
            itemId: i.itemId ?? null,
            sku: i.sku?.trim() ? i.sku.trim() : null,
            description: i.description,
            unit: i.unit || "lot",
            quantity: toDecimal(i.quantity),
            unitPrice: toDecimal(i.unitPrice),
            totalPrice: toDecimal(i.totalPrice),
            costPrice: toDecimal(i.costPrice),
            totalCost: toDecimal(i.totalCost),
            profitAmount: toDecimal(i.profitAmount),
            marginPercent: new Prisma.Decimal(i.marginPercent),
            sortOrder: i.sortOrder,
          })),
        },
      },
    });
  });

  await auditLog({
    module: "vo",
    action: "update",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: updated.id,
    metadata: { referenceNumber: updated.referenceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: "Draft updated",
    data: {
      title: updated.title,
      subtotal: computed.totals.subtotal,
      costSubtotal: computed.totals.costSubtotal,
      gstAmount: computed.totals.gstAmount,
      totalAmount: computed.totals.totalAmount,
      timeImpactDays: updated.timeImpactDays,
    },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}

export async function submitVariationForApproval(params: {
  projectId: string;
  variationId: string;
  approverName: string;
  approverEmail: string;
  approverRole: string;
}) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId: params.projectId });

  const existing = await prisma.variationOrder.findUnique({
    where: { id: params.variationId },
    include: { approvals: true },
  });
  if (!existing || existing.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (!canSubmitStatus(existing.status)) throw new Error("Cannot submit this variation order.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.variationOrder.update({
      where: { id: existing.id },
      data: { status: "PENDING_APPROVAL", submittedAt: now, rejectedAt: null },
    });

    const hasApprover = existing.approvals.some((a) => a.approverEmail.toLowerCase() === params.approverEmail.toLowerCase());
    if (!hasApprover) {
      await tx.variationApproval.create({
        data: {
          variationOrderId: existing.id,
          approverName: params.approverName,
          approverEmail: params.approverEmail,
          role: params.approverRole,
          status: "PENDING",
        },
      });
    }

    return next;
  });

  await prisma.projectTimelineItem.create({
    data: {
      projectId: params.projectId,
      type: "VARIATION_ORDER",
      title: `VO submitted: ${updated.referenceNumber}`,
      createdById: userId,
      metadata: { variationOrderId: updated.id, referenceNumber: updated.referenceNumber },
    },
  });

  await auditLog({
    module: "vo",
    action: "submit",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: updated.id,
    metadata: { referenceNumber: updated.referenceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: "Submitted for approval",
    data: { status: updated.status, submittedAt: now.toISOString() },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}

export async function approveVariationInternal(params: { projectId: string; variationId: string }) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_APPROVE, projectId: params.projectId });
  const actorUser = await requireUser().catch(() => null);
  const existing = await prisma.variationOrder.findUnique({ where: { id: params.variationId } });
  if (!existing || existing.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (![ "PENDING_APPROVAL", "APPROVED", "INVOICED" ].includes(existing.status)) throw new Error("Invalid status.");

  const now = new Date();
  const normalizedImpact =
    Number(existing.costImpact) > 0 ? Number(existing.costImpact) : Number(existing.subtotal);
  const updated = await prisma.variationOrder.update({
    where: { id: existing.id },
    data: { status: "APPROVED", approvedAt: now, rejectedAt: null, costImpact: toDecimal(normalizedImpact) },
  });

  // Update revised contract value (best-effort, based on approved/invoiced VOs).
  const voAgg = await prisma.variationOrder.aggregate({
    where: { projectId: params.projectId, status: { in: ["APPROVED", "INVOICED"] } },
    _sum: { costImpact: true },
  });
  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { contractValue: true } });
  if (project) {
    const revised = Number(project.contractValue) + Number(voAgg._sum.costImpact ?? 0);
    await prisma.project.update({ where: { id: params.projectId }, data: { revisedContractValue: toDecimal(revised) } });
  }

  await prisma.projectTimelineItem.create({
    data: {
      projectId: params.projectId,
      type: "VARIATION_ORDER",
      title: `VO approved: ${updated.referenceNumber}`,
      createdById: userId,
      metadata: { variationOrderId: updated.id, referenceNumber: updated.referenceNumber },
    },
  });

  await auditLog({
    module: "vo",
    action: "approve",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: updated.id,
    metadata: { referenceNumber: updated.referenceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: "Approved",
    data: { status: updated.status, approvedAt: now.toISOString() },
  });

  await refreshProjectPnlAlerts(params.projectId);

  // Post-award execution control: approved VO creates a new locked budget version (best-effort).
  if (actorUser) {
    await createBudgetRevisionFromApprovedVariation({
      projectId: params.projectId,
      variationOrderId: updated.id,
      actor: {
        userId: actorUser.id,
        name: actorUser.name ?? null,
        email: actorUser.email ?? null,
        roleKeys: actorUser.roleKeys,
        isAdmin: actorUser.isAdmin,
      },
    }).catch(() => null);
  }

  await refreshProjectExecutionAlerts(params.projectId).catch(() => null);
  return updated;
}

export async function rejectVariationInternal(params: { projectId: string; variationId: string; remarks?: string | null }) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_APPROVE, projectId: params.projectId });
  const existing = await prisma.variationOrder.findUnique({ where: { id: params.variationId } });
  if (!existing || existing.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (![ "PENDING_APPROVAL", "APPROVED" ].includes(existing.status)) throw new Error("Invalid status.");

  const now = new Date();
  const updated = await prisma.variationOrder.update({
    where: { id: existing.id },
    data: { status: "REJECTED", rejectedAt: now },
  });

  await auditLog({
    module: "vo",
    action: "reject",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: updated.id,
    metadata: { referenceNumber: updated.referenceNumber, remarks: params.remarks ?? null },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: "Rejected",
    data: { status: updated.status, rejectedAt: now.toISOString(), remarks: params.remarks ?? null },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}

export async function upsertApprovalDecisionByToken(params: {
  token: string;
  decision: "APPROVE" | "REJECT";
  approverName: string;
  approverEmail: string;
  remarks?: string | null;
}) {
  const link = await prisma.publicDocumentLink.findUnique({ where: { token: params.token } });
  if (!link) return null;
  if (!link.isActive) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  if (link.documentType !== "VARIATION_ORDER") return null;

  const vo = await prisma.variationOrder.findUnique({
    where: { id: link.documentId },
    include: { approvals: true },
  });
  if (!vo) return null;

  const nextStatus: VariationOrderStatus =
    params.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const approvalStatus: VariationApprovalStatus =
    params.decision === "APPROVE" ? "APPROVED" : "REJECTED";

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const existingApproval = vo.approvals.find((a) => a.approverEmail.toLowerCase() === params.approverEmail.toLowerCase());

    if (existingApproval) {
      await tx.variationApproval.update({
        where: { id: existingApproval.id },
        data: {
          status: approvalStatus,
          remarks: params.remarks ?? null,
          approvedAt: params.decision === "APPROVE" ? now : null,
        },
      });
    } else {
      await tx.variationApproval.create({
        data: {
          variationOrderId: vo.id,
          approverName: params.approverName,
          approverEmail: params.approverEmail,
          role: "CLIENT",
          status: approvalStatus,
          remarks: params.remarks ?? null,
          approvedAt: params.decision === "APPROVE" ? now : null,
        },
      });
    }

    return tx.variationOrder.update({
      where: { id: vo.id },
      data:
        params.decision === "APPROVE"
          ? {
              status: "APPROVED",
              approvedAt: now,
              rejectedAt: null,
              costImpact: toDecimal(Number(vo.costImpact) > 0 ? Number(vo.costImpact) : Number(vo.subtotal)),
            }
          : { status: "REJECTED", rejectedAt: now },
    });
  });

  if (params.decision === "APPROVE") {
    const [agg, project] = await Promise.all([
      prisma.variationOrder.aggregate({
        where: { projectId: updated.projectId, status: { in: ["APPROVED", "INVOICED"] } },
        _sum: { costImpact: true },
      }),
      prisma.project.findUnique({ where: { id: updated.projectId }, select: { contractValue: true } }),
    ]);
    if (project) {
      const revised = Number(project.contractValue) + Number(agg._sum.costImpact ?? 0);
      await prisma.project.update({ where: { id: updated.projectId }, data: { revisedContractValue: toDecimal(revised) } });
    }
  }

  await createRevision({
    entityType: "VariationOrder",
    entityId: updated.id,
    projectId: updated.projectId,
    actorUserId: null,
    note: params.decision === "APPROVE" ? "Approved by client (public link)" : "Rejected by client (public link)",
    data: { status: updated.status, remarks: params.remarks ?? null },
  });

  await refreshProjectPnlAlerts(updated.projectId);
  return { link, variation: updated };
}

export async function createVariationInvoice(params: { projectId: string; variationId: string; dueDate?: Date | null }) {
  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId: params.projectId });

  const vo = await prisma.variationOrder.findUnique({
    where: { id: params.variationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!vo || vo.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (vo.status !== "APPROVED") throw new Error("Variation must be approved before invoicing.");

  const existingInvoiced = await prisma.invoice.aggregate({
    where: { projectId: params.projectId, variationOrderId: vo.id, status: { not: "VOID" } },
    _sum: { subtotal: true },
  });
  const alreadyBilled = Number(existingInvoiced._sum.subtotal ?? 0);
  if (alreadyBilled >= Number(vo.subtotal)) {
    throw new Error("This variation is already fully invoiced.");
  }

  const invoice = await createManualInvoice({
    projectId: params.projectId,
    contractId: vo.contractId ?? null,
    quotationId: vo.quotationId ?? null,
    variationOrderId: vo.id,
    invoiceType: "VARIATION",
    issueDate: new Date(),
    dueDate: params.dueDate ?? null,
    discountAmount: 0,
    title: `Variation Order ${vo.referenceNumber}`,
    notes: vo.description ?? null,
    lines: vo.lineItems.map((l) => ({
      itemId: l.itemId ?? null,
      sku: l.sku ?? null,
      description: l.description,
      unit: l.unit,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      sortOrder: l.sortOrder,
    })),
  });

  await prisma.variationOrder.update({
    where: { id: vo.id },
    data: { status: "INVOICED" },
  });

  await auditLog({
    module: "vo",
    action: "invoice",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: vo.id,
    metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: vo.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: "Variation invoiced",
    data: { status: "INVOICED", invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return invoice;
}

export async function reviseRejectedVariation(params: { projectId: string; variationId: string }) {
  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId: params.projectId });
  const existing = await prisma.variationOrder.findUnique({
    where: { id: params.variationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!existing || existing.projectId !== params.projectId) throw new Error("Variation order not found.");
  if (existing.status !== "REJECTED") throw new Error("Only rejected variations can be revised.");

  const gstRate = await getProjectGstRate(params.projectId);
  const baseItems: VariationItemInput[] = existing.lineItems.map((l) => ({
    itemId: l.itemId ?? null,
    sku: l.sku ?? null,
    description: l.description,
    unit: l.unit,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    costPrice: Number(l.costPrice),
    sortOrder: l.sortOrder,
  }));
  const computed = computeVariationTotals({ items: baseItems, gstRate });

  const now = new Date();
  const next = await prisma.variationOrder.create({
    data: {
      projectId: params.projectId,
      referenceNumber: generateVariationOrderReference(now),
      status: "DRAFT",
      title: existing.title,
      description: existing.description,
      reason: existing.reason,
      requestedBy: existing.requestedBy,
      contractId: existing.contractId,
      quotationId: existing.quotationId,
      timeImpactDays: existing.timeImpactDays,
      costImpact: toDecimal(computed.totals.costImpact),
      subtotal: toDecimal(computed.totals.subtotal),
      gstAmount: toDecimal(computed.totals.gstAmount),
      totalAmount: toDecimal(computed.totals.totalAmount),
      costSubtotal: toDecimal(computed.totals.costSubtotal),
      lineItems: {
        create: computed.items.map((i) => ({
          itemId: i.itemId ?? null,
          sku: i.sku?.trim() ? i.sku.trim() : null,
          description: i.description,
          unit: i.unit || "lot",
          quantity: toDecimal(i.quantity),
          unitPrice: toDecimal(i.unitPrice),
          totalPrice: toDecimal(i.totalPrice),
          costPrice: toDecimal(i.costPrice),
          totalCost: toDecimal(i.totalCost),
          profitAmount: toDecimal(i.profitAmount),
          marginPercent: new Prisma.Decimal(i.marginPercent),
          sortOrder: i.sortOrder,
        })),
      },
    },
  });

  await auditLog({
    module: "vo",
    action: "revise",
    actorUserId: userId,
    projectId: params.projectId,
    entityType: "VariationOrder",
    entityId: next.id,
    metadata: { revisedFrom: existing.id, previousReference: existing.referenceNumber, referenceNumber: next.referenceNumber },
  });

  await createRevision({
    entityType: "VariationOrder",
    entityId: next.id,
    projectId: params.projectId,
    actorUserId: userId,
    note: `Revised from ${existing.referenceNumber}`,
    data: { revisedFrom: existing.id },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return next;
}
