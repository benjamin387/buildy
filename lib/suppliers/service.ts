import {
  ActualCostCategory,
  Prisma,
  PurchaseOrderStatus,
  SupplierBillStatus,
  SubcontractClaimStatus,
  SubcontractStatus,
  VendorType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeDocumentTotals, toDecimal } from "@/lib/suppliers/engine";
import { generatePurchaseOrderNumber } from "@/lib/suppliers/po-number";
import { generateSupplierBillNumber } from "@/lib/suppliers/bill-number";
import { generateSubcontractClaimNumber } from "@/lib/suppliers/subcontract-claim-number";
import { refreshProjectPnlAlerts } from "@/lib/pnl/alerts";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getProjectGstRate(projectId: string): Promise<number> {
  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  return profile?.gstRate ? Number(profile.gstRate) : 0.09;
}

export async function recomputeProjectCostRollups(projectId: string) {
  const poCommitted = await prisma.purchaseOrder.aggregate({
    where: {
      projectId,
      status: { in: ["ISSUED", "ACKNOWLEDGED", "COMPLETED"] },
    },
    _sum: { subtotal: true },
  });

  const subcontractCommitted = await prisma.subcontract.aggregate({
    where: {
      projectId,
      status: { not: "TERMINATED" },
    },
    _sum: { contractSubtotal: true },
  });

  const actual = await prisma.actualCostEntry.aggregate({
    where: { projectId },
    _sum: { amount: true },
  });

  const committedCost = roundCurrency(
    Number(poCommitted._sum.subtotal ?? 0) + Number(subcontractCommitted._sum.contractSubtotal ?? 0),
  );
  const actualCost = roundCurrency(Number(actual._sum.amount ?? 0));

  await prisma.project.update({
    where: { id: projectId },
    data: {
      committedCost: new Prisma.Decimal(committedCost),
      actualCost: new Prisma.Decimal(actualCost),
    },
  });

  return { committedCost, actualCost };
}

export async function createPurchaseOrder(params: {
  projectId: string;
  supplierId: string;
  issueDate: Date;
  expectedDeliveryDate?: Date | null;
  notes?: string | null;
  lines: Array<{
    itemId?: string | null;
    sku?: string | null;
    description: string;
    quantity: number;
    unitCost: number;
    sortOrder: number;
  }>;
}) {
  const supplier = await prisma.vendor.findUnique({ where: { id: params.supplierId } });
  if (!supplier) throw new Error("Supplier not found.");
  if (supplier.type !== VendorType.SUPPLIER && supplier.type !== VendorType.BOTH) {
    throw new Error("Vendor is not a supplier.");
  }

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeDocumentTotals({
    lines: params.lines.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost })),
    gstRate,
    isGstRegistered: supplier.gstRegistered,
  });

  const poNumber = generatePurchaseOrderNumber(params.issueDate);

  const po = await prisma.purchaseOrder.create({
    data: {
      projectId: params.projectId,
      supplierId: params.supplierId,
      poNumber,
      status: "DRAFT",
      issueDate: params.issueDate,
      expectedDeliveryDate: params.expectedDeliveryDate ?? null,
      subtotal: toDecimal(computed.subtotal),
      taxAmount: toDecimal(computed.taxAmount),
      totalAmount: toDecimal(computed.totalAmount),
      notes: params.notes ?? null,
      lines: {
        create: params.lines.map((l) => ({
          itemId: l.itemId ?? null,
          sku: l.sku ?? null,
          description: l.description,
          quantity: toDecimal(l.quantity),
          unitCost: toDecimal(l.unitCost),
          lineAmount: toDecimal(roundCurrency(l.quantity * l.unitCost)),
          sortOrder: l.sortOrder,
        })),
      },
    },
    include: { lines: true, supplier: true },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return po;
}

export async function updatePurchaseOrderDraft(params: {
  projectId: string;
  purchaseOrderId: string;
  issueDate: Date;
  expectedDeliveryDate?: Date | null;
  notes?: string | null;
  lines: Array<{
    id?: string | null;
    itemId?: string | null;
    sku?: string | null;
    description: string;
    quantity: number;
    unitCost: number;
    sortOrder: number;
  }>;
}) {
  const existing = await prisma.purchaseOrder.findUnique({
    where: { id: params.purchaseOrderId },
    include: { lines: true, supplier: true },
  });
  if (!existing || existing.projectId !== params.projectId) throw new Error("PO not found.");
  if (existing.status !== "DRAFT") throw new Error("Only draft POs can be edited.");

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeDocumentTotals({
    lines: params.lines.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost })),
    gstRate,
    isGstRegistered: existing.supplier.gstRegistered,
  });

  const existingIds = new Set(existing.lines.map((l) => l.id));
  const keepIds = new Set(params.lines.map((l) => l.id).filter((id): id is string => !!id));
  const deleteIds = Array.from(existingIds).filter((id) => !keepIds.has(id));

  return await prisma.$transaction(async (tx) => {
    if (deleteIds.length > 0) {
      await tx.purchaseOrderLine.deleteMany({ where: { id: { in: deleteIds } } });
    }

    for (const line of params.lines) {
      const lineAmount = roundCurrency(line.quantity * line.unitCost);
      if (line.id && existingIds.has(line.id)) {
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            itemId: line.itemId ?? null,
            sku: line.sku ?? null,
            description: line.description,
            quantity: toDecimal(line.quantity),
            unitCost: toDecimal(line.unitCost),
            lineAmount: toDecimal(lineAmount),
            sortOrder: line.sortOrder,
          },
        });
      } else {
        await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: existing.id,
            itemId: line.itemId ?? null,
            sku: line.sku ?? null,
            description: line.description,
            quantity: toDecimal(line.quantity),
            unitCost: toDecimal(line.unitCost),
            lineAmount: toDecimal(lineAmount),
            sortOrder: line.sortOrder,
          },
        });
      }
    }

    return await tx.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        issueDate: params.issueDate,
        expectedDeliveryDate: params.expectedDeliveryDate ?? null,
        notes: params.notes ?? null,
        subtotal: toDecimal(computed.subtotal),
        taxAmount: toDecimal(computed.taxAmount),
        totalAmount: toDecimal(computed.totalAmount),
      },
      include: { lines: { orderBy: { sortOrder: "asc" } }, supplier: true },
    });
  });
}

export async function issuePurchaseOrder(params: { projectId: string; purchaseOrderId: string }) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: params.purchaseOrderId } });
  if (!po || po.projectId !== params.projectId) throw new Error("PO not found.");
  if (po.status !== "DRAFT") throw new Error("Only draft POs can be issued.");

  const updated = await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: "ISSUED" },
  });

  await recomputeProjectCostRollups(params.projectId);
  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}

export async function createSupplierBill(params: {
  projectId: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  subcontractId?: string | null;
  billDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  lines: Array<{
    itemId?: string | null;
    description: string;
    quantity: number;
    unitCost: number;
    sortOrder: number;
  }>;
}) {
  const supplier = await prisma.vendor.findUnique({ where: { id: params.supplierId } });
  if (!supplier) throw new Error("Supplier not found.");

  if (params.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: params.purchaseOrderId } });
    if (!po || po.projectId !== params.projectId) throw new Error("Linked PO not found.");
    if (po.supplierId !== params.supplierId) throw new Error("Linked PO supplier mismatch.");
  }

  if (params.subcontractId) {
    const sc = await prisma.subcontract.findUnique({ where: { id: params.subcontractId } });
    if (!sc || sc.projectId !== params.projectId) throw new Error("Linked subcontract not found.");
    if (sc.supplierId !== params.supplierId) throw new Error("Linked subcontract supplier mismatch.");
  }

  const gstRate = await getProjectGstRate(params.projectId);
  const computed = computeDocumentTotals({
    lines: params.lines.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost })),
    gstRate,
    isGstRegistered: supplier.gstRegistered,
  });

  const billNumber = generateSupplierBillNumber(params.billDate);

  const bill = await prisma.supplierBill.create({
    data: {
      projectId: params.projectId,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId ?? null,
      subcontractId: params.subcontractId ?? null,
      billNumber,
      billDate: params.billDate,
      dueDate: params.dueDate ?? null,
      subtotal: toDecimal(computed.subtotal),
      taxAmount: toDecimal(computed.taxAmount),
      totalAmount: toDecimal(computed.totalAmount),
      outstandingAmount: toDecimal(computed.totalAmount),
      status: "DRAFT",
      notes: params.notes ?? null,
      lines: {
        create: params.lines.map((l) => ({
          itemId: l.itemId ?? null,
          description: l.description,
          quantity: toDecimal(l.quantity),
          unitCost: toDecimal(l.unitCost),
          lineAmount: toDecimal(roundCurrency(l.quantity * l.unitCost)),
          sortOrder: l.sortOrder,
        })),
      },
    },
    include: { supplier: true, lines: true },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return bill;
}

export async function approveSupplierBill(params: { projectId: string; supplierBillId: string }) {
  const bill = await prisma.supplierBill.findUnique({
    where: { id: params.supplierBillId },
    include: { supplier: true },
  });
  if (!bill || bill.projectId !== params.projectId) throw new Error("Bill not found.");
  if (!["DRAFT", "RECEIVED"].includes(bill.status)) throw new Error("Bill cannot be approved.");

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.supplierBill.update({
      where: { id: bill.id },
      data: { status: "APPROVED" },
    });

    // Create an actual cost entry for P&L tracking.
    const category: ActualCostCategory = bill.subcontractId ? "SUBCONTRACT" : "MATERIAL";
    await tx.actualCostEntry.create({
      data: {
        projectId: bill.projectId,
        vendorId: bill.supplierId,
        category,
        occurredAt: bill.billDate,
        description: `Supplier bill ${bill.billNumber}`,
        amount: bill.subtotal,
        notes: bill.notes ?? null,
      },
    });

    return next;
  });

  await recomputeProjectCostRollups(params.projectId);
  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}

export async function createSubcontractClaim(params: {
  projectId: string;
  subcontractId: string;
  claimDate: Date;
  claimedAmount: number;
  certifiedAmount: number;
  notes?: string | null;
}) {
  const subcontract = await prisma.subcontract.findUnique({ where: { id: params.subcontractId } });
  if (!subcontract || subcontract.projectId !== params.projectId) throw new Error("Subcontract not found.");

  const claimNumber = generateSubcontractClaimNumber(params.claimDate);

  const claim = await prisma.subcontractClaim.create({
    data: {
      subcontractId: subcontract.id,
      claimNumber,
      claimDate: params.claimDate,
      claimedAmount: toDecimal(params.claimedAmount),
      certifiedAmount: toDecimal(params.certifiedAmount),
      status: "SUBMITTED",
      notes: params.notes ?? null,
    },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return claim;
}

export async function certifySubcontractClaim(params: {
  projectId: string;
  subcontractClaimId: string;
  certifiedAmount: number;
}) {
  const claim = await prisma.subcontractClaim.findUnique({
    where: { id: params.subcontractClaimId },
    include: { subcontract: true },
  });
  if (!claim || claim.subcontract.projectId !== params.projectId) throw new Error("Claim not found.");
  if (claim.status === "CANCELLED") throw new Error("Claim is cancelled.");

  const updated = await prisma.subcontractClaim.update({
    where: { id: claim.id },
    data: {
      certifiedAmount: toDecimal(params.certifiedAmount),
      status: "CERTIFIED",
    },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}

export async function markSubcontractClaimPaid(params: {
  projectId: string;
  subcontractClaimId: string;
}) {
  const claim = await prisma.subcontractClaim.findUnique({
    where: { id: params.subcontractClaimId },
    include: { subcontract: true },
  });
  if (!claim || claim.subcontract.projectId !== params.projectId) throw new Error("Claim not found.");
  if (claim.status !== "CERTIFIED") throw new Error("Only certified claims can be marked as paid.");

  const updated = await prisma.subcontractClaim.update({
    where: { id: claim.id },
    data: { status: "PAID" },
  });

  await refreshProjectPnlAlerts(params.projectId);
  return updated;
}
