import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma, VendorType } from "@prisma/client";
import { createPurchaseOrder, getProjectGstRate, recomputeProjectCostRollups } from "@/lib/suppliers/service";
import { refreshProjectPnlAlerts } from "@/lib/pnl/alerts";
import { auditLog, createRevision } from "@/lib/audit";
import { getActiveLockedBudget, type ExecutionActor } from "@/lib/execution/budget-service";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(roundCurrency(n));
}

function toMoney(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

async function assertApprovedBudgetForProcurement(projectId: string) {
  const budget = await getActiveLockedBudget(projectId);
  if (!budget) throw new Error("Procurement is blocked: no active locked budget baseline.");
  return budget;
}

export async function setProcurementPlannedVendor(params: {
  projectId: string;
  planItemId: string;
  vendorId: string | null;
  actor: ExecutionActor;
}) {
  await assertApprovedBudgetForProcurement(params.projectId);

  const item = await prisma.projectProcurementPlanItem.findUnique({
    where: { id: params.planItemId },
    include: { plan: true },
  });
  if (!item || item.plan.projectId !== params.projectId) throw new Error("Procurement item not found.");

  const updated = await prisma.projectProcurementPlanItem.update({
    where: { id: item.id },
    data: { plannedVendorId: params.vendorId },
  });

  await auditLog({
    module: "execution",
    action: "set_procurement_vendor",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "ProjectProcurementPlanItem",
    entityId: updated.id,
    metadata: { plannedVendorId: params.vendorId },
  });

  return updated;
}

export async function convertProcurementItemToPurchaseOrder(params: {
  projectId: string;
  planItemId: string;
  issueDate: Date;
  expectedDeliveryDate?: Date | null;
  actor: ExecutionActor;
}) {
  const budget = await assertApprovedBudgetForProcurement(params.projectId);

  const item = await prisma.projectProcurementPlanItem.findUnique({
    where: { id: params.planItemId },
    include: {
      plan: true,
      plannedVendor: true,
      sourceBudgetLine: { include: { budget: true } },
    },
  });
  if (!item || item.plan.projectId !== params.projectId) throw new Error("Procurement item not found.");
  if (item.itemType !== "PURCHASE_ORDER") throw new Error("Procurement item is not a purchase order item.");
  if (item.purchaseOrderId) throw new Error("This procurement item is already converted to a PO.");

  if (!item.plannedVendorId) throw new Error("Select a supplier first.");
  if (!item.plannedVendor || (item.plannedVendor.type !== VendorType.SUPPLIER && item.plannedVendor.type !== VendorType.BOTH)) {
    throw new Error("Selected vendor is not a supplier.");
  }

  if (item.sourceBudgetLine?.budgetId && item.sourceBudgetLine.budgetId !== budget.id) {
    throw new Error("Procurement item is not linked to the active locked budget baseline.");
  }

  const lineAmount = toMoney(Number(item.plannedAmount ?? 0));

  const po = await createPurchaseOrder({
    projectId: params.projectId,
    supplierId: item.plannedVendorId,
    issueDate: params.issueDate,
    expectedDeliveryDate: params.expectedDeliveryDate ?? null,
    notes: `Auto-created from procurement plan (trade ${String(item.tradeKey)}).`,
    lines: [
      {
        itemId: null,
        sku: null,
        description: item.title,
        quantity: 1,
        unitCost: lineAmount,
        sortOrder: 0,
      },
    ],
  });

  const updated = await prisma.projectProcurementPlanItem.update({
    where: { id: item.id },
    data: {
      purchaseOrderId: po.id,
      status: "ORDERED",
      committedAmount: po.subtotal,
      committedAt: new Date(),
      committedByName: params.actor.name,
      committedByEmail: params.actor.email,
    },
  });

  // Cost rollups will reflect PO commitment only after the PO is issued (existing business rule).
  await refreshProjectPnlAlerts(params.projectId);

  await auditLog({
    module: "execution",
    action: "convert_procurement_to_po",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "PurchaseOrder",
    entityId: po.id,
    metadata: { procurementPlanItemId: item.id, plannedAmount: lineAmount, poNumber: po.poNumber },
  });

  await createRevision({
    entityType: "ProjectProcurementPlanItem",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Converted to Purchase Order",
    data: { purchaseOrderId: po.id, poNumber: po.poNumber, committedAmount: Number(updated.committedAmount) },
  });

  return { purchaseOrderId: po.id, procurementItemId: updated.id };
}

export async function convertProcurementItemToSubcontract(params: {
  projectId: string;
  planItemId: string;
  actor: ExecutionActor;
}) {
  const budget = await assertApprovedBudgetForProcurement(params.projectId);

  const item = await prisma.projectProcurementPlanItem.findUnique({
    where: { id: params.planItemId },
    include: { plan: true, plannedVendor: true, sourceBudgetLine: { include: { budget: true } } },
  });
  if (!item || item.plan.projectId !== params.projectId) throw new Error("Procurement item not found.");
  if (item.itemType !== "SUBCONTRACT") throw new Error("Procurement item is not a subcontract item.");
  if (item.subcontractId) throw new Error("This procurement item is already converted to a subcontract.");

  if (!item.plannedVendorId) throw new Error("Select a subcontractor first.");
  if (!item.plannedVendor || (item.plannedVendor.type !== VendorType.SUBCONTRACTOR && item.plannedVendor.type !== VendorType.BOTH)) {
    throw new Error("Selected vendor is not a subcontractor.");
  }

  if (item.sourceBudgetLine?.budgetId && item.sourceBudgetLine.budgetId !== budget.id) {
    throw new Error("Procurement item is not linked to the active locked budget baseline.");
  }

  const gstRate = await getProjectGstRate(params.projectId);
  const subtotal = toMoney(Number(item.plannedAmount ?? 0));
  const gstAmount = item.plannedVendor.gstRegistered ? roundCurrency(subtotal * gstRate) : 0;
  const totalAmount = roundCurrency(subtotal + gstAmount);

  const subcontract = await prisma.subcontract.create({
    data: {
      projectId: params.projectId,
      supplierId: item.plannedVendorId,
      title: item.title,
      scopeOfWork: `Auto-created from procurement plan (trade ${String(item.tradeKey)}).`,
      status: "DRAFT",
      contractSubtotal: toDecimal(subtotal),
      gstAmount: toDecimal(gstAmount),
      totalAmount: toDecimal(totalAmount),
      paymentTerms:
        "Payment is subject to inspection, acceptance, and agreed milestones. Retention may apply where appropriate.",
      warrantyTerms:
        "Subcontractor warrants workmanship and materials for the agreed warranty period. Defects to be rectified upon notice.",
      variationPolicy:
        "No variations without written instruction. Variation price and schedule impact to be agreed before execution.",
      defectsPolicy:
        "Defects must be rectified within a reasonable timeframe. Misuse and third-party damage excluded.",
      insurancePolicy:
        "Subcontractor to maintain required insurances (as applicable) and provide evidence upon request.",
    },
  });

  const updated = await prisma.projectProcurementPlanItem.update({
    where: { id: item.id },
    data: {
      subcontractId: subcontract.id,
      status: "AWARDED",
      committedAmount: subcontract.contractSubtotal,
      committedAt: new Date(),
      committedByName: params.actor.name,
      committedByEmail: params.actor.email,
    },
  });

  await recomputeProjectCostRollups(params.projectId);
  await refreshProjectPnlAlerts(params.projectId);

  await auditLog({
    module: "execution",
    action: "convert_procurement_to_subcontract",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "Subcontract",
    entityId: subcontract.id,
    metadata: { procurementPlanItemId: item.id, subtotal, gstAmount, totalAmount },
  });

  await createRevision({
    entityType: "Subcontract",
    entityId: subcontract.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Draft created from procurement plan",
    data: { subcontractId: subcontract.id, title: subcontract.title, subtotal, gstRate, totalAmount },
  });

  await createRevision({
    entityType: "ProjectProcurementPlanItem",
    entityId: updated.id,
    projectId: params.projectId,
    actorUserId: params.actor.userId,
    note: "Converted to Subcontract",
    data: { subcontractId: subcontract.id, committedAmount: Number(updated.committedAmount) },
  });

  return { subcontractId: subcontract.id, procurementItemId: updated.id };
}

