import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { recomputeQuotationDerivedTotals } from "@/lib/quotations/service";

const lineItemTypeSchema = z.enum([
  "SUPPLY",
  "INSTALL",
  "SUPPLY_AND_INSTALL",
  "LABOR",
  "MATERIAL",
  "SERVICE",
  "CREDIT",
  "OTHER",
]);

const updateSchema = z.object({
  sku: z.string().optional().default(""),
  itemMasterId: z.string().nullable().optional().default(null),
  unitOfMeasureId: z.string().nullable().optional().default(null),
  description: z.string().min(1).max(300),
  specification: z.string().optional().default(""),
  unit: z.string().min(1).max(30).default("lot"),
  quantity: z.coerce.number().min(0).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  costPrice: z.coerce.number().min(0).default(0),
  itemType: lineItemTypeSchema.optional().default("SUPPLY_AND_INSTALL"),
  isIncluded: z.boolean().optional().default(true),
  isOptional: z.boolean().optional().default(false),
  remarks: z.string().optional().default(""),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string; itemId: string }> },
) {
  try {
    const { projectId, quotationId, itemId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const body = await request.json();
    const input = updateSchema.parse(body);

    const item = await prisma.quotationItem.findUnique({
      where: { id: itemId },
      include: { quotationSection: { include: { quotation: { select: { id: true, projectId: true } } } } },
    });
    if (!item || item.quotationSection.quotationId !== quotationId || item.quotationSection.quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.quotationItem.update({
      where: { id: itemId },
      data: {
        sku: input.sku || "",
        itemMasterId: input.itemMasterId ?? null,
        unitOfMeasureId: input.unitOfMeasureId ?? null,
        itemType: input.itemType,
        description: input.description,
        specification: input.specification || null,
        unit: input.unit,
        quantity: new Prisma.Decimal(input.quantity),
        unitPrice: new Prisma.Decimal(input.unitPrice),
        costPrice: new Prisma.Decimal(input.costPrice),
        remarks: input.remarks || null,
        isIncluded: input.isIncluded,
        isOptional: input.isOptional,
        sortOrder: input.sortOrder ?? undefined,
      },
    });

    const { computed } = await recomputeQuotationDerivedTotals({ quotationId });

    await auditLog({
      module: "quotation",
      action: "item_update",
      actorUserId: userId,
      projectId,
      entityType: "QuotationItem",
      entityId: itemId,
      metadata: { quotationId },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Item updated",
      data: { quotationId, itemId, input, computed },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update item";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string; itemId: string }> },
) {
  try {
    const { projectId, quotationId, itemId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const item = await prisma.quotationItem.findUnique({
      where: { id: itemId },
      include: { quotationSection: { include: { quotation: { select: { id: true, projectId: true } } } } },
    });
    if (!item || item.quotationSection.quotationId !== quotationId || item.quotationSection.quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.quotationItem.delete({ where: { id: itemId } });
    const { computed } = await recomputeQuotationDerivedTotals({ quotationId });

    await auditLog({
      module: "quotation",
      action: "item_delete",
      actorUserId: userId,
      projectId,
      entityType: "QuotationItem",
      entityId: itemId,
      metadata: { quotationId },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Item removed",
      data: { quotationId, itemId, computed },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove item";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

