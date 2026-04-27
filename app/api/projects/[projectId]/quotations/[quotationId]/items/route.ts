import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";

const createSchema = z.object({
  sectionId: z.string().min(1),
  sku: z.string().optional().default(""),
  itemMasterId: z.string().optional().nullable().default(null),
  unitOfMeasureId: z.string().optional().nullable().default(null),
  description: z.string().min(1).max(300),
  unit: z.string().min(1).max(30).default("lot"),
  quantity: z.coerce.number().min(0).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  costPrice: z.coerce.number().min(0).default(0),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; quotationId: string }> },
) {
  try {
    const { projectId, quotationId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const body = await request.json();
    const input = createSchema.parse(body);

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        project: { include: { commercialProfile: true } },
        sections: { include: { lineItems: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!quotation || quotation.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const section = quotation.sections.find((s) => s.id === input.sectionId);
    if (!section) {
      return NextResponse.json({ success: false, error: "Section not found" }, { status: 404 });
    }

    const sortOrder = section.lineItems.length;

    const gstRate = quotation.project.commercialProfile?.gstRate
      ? Number(quotation.project.commercialProfile.gstRate)
      : 0.09;

    // Create the item.
    const item = await prisma.quotationItem.create({
      data: {
        quotationSectionId: section.id,
        sku: input.sku || "",
        itemMasterId: input.itemMasterId ?? null,
        unitOfMeasureId: input.unitOfMeasureId ?? null,
        itemType: "SUPPLY_AND_INSTALL",
        description: input.description,
        specification: null,
        unit: input.unit,
        quantity: new Prisma.Decimal(input.quantity),
        unitPrice: new Prisma.Decimal(input.unitPrice),
        costPrice: new Prisma.Decimal(input.costPrice),
        totalPrice: 0,
        totalCost: 0,
        profit: 0,
        marginPercent: 0,
        remarks: null,
        isIncluded: true,
        isOptional: false,
        sortOrder,
      },
    });

    // Recompute quotation totals and derived fields (including new item).
    const refreshed = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { sections: { include: { lineItems: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!refreshed) throw new Error("Not found.");

    const builderSections = refreshed.sections.map((s) => ({
      category: s.category,
      title: s.title,
      description: s.description ?? undefined,
      isIncluded: s.isIncluded,
      isOptional: s.isOptional,
      remarks: s.remarks ?? undefined,
      lineItems: s.lineItems.map((li) => ({
        sku: li.sku,
        description: li.description,
        specification: li.specification ?? undefined,
        unit: li.unit,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        costPrice: Number(li.costPrice),
        remarks: li.remarks ?? undefined,
        itemType: li.itemType,
        isIncluded: li.isIncluded,
        isOptional: li.isOptional,
      })),
    }));

    const computed = computeProjectQuotationSummary({
      sections: builderSections,
      discountAmount: Number(refreshed.discountAmount),
      gstRate,
    });

    // Persist derived fields.
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (let sectionIndex = 0; sectionIndex < refreshed.sections.length; sectionIndex++) {
      const s = refreshed.sections[sectionIndex];
      ops.push(
        prisma.quotationSection.update({
          where: { id: s.id },
          data: { subtotal: new Prisma.Decimal(computed.sections[sectionIndex]?.subtotal ?? 0) },
        }),
      );

      for (let itemIndex = 0; itemIndex < s.lineItems.length; itemIndex++) {
        const li = s.lineItems[itemIndex];
        const computedItem = computed.sections[sectionIndex]?.lineItems[itemIndex];
        ops.push(
          prisma.quotationItem.update({
            where: { id: li.id },
            data: {
              totalPrice: new Prisma.Decimal(computedItem?.totalPrice ?? 0),
              totalCost: new Prisma.Decimal(computedItem?.totalCost ?? 0),
              profit: new Prisma.Decimal(computedItem?.profit ?? 0),
              marginPercent: new Prisma.Decimal(computedItem?.marginPercent ?? 0),
            },
          }),
        );
      }
    }

    ops.push(
      prisma.quotation.update({
        where: { id: quotationId },
        data: {
          subtotal: new Prisma.Decimal(computed.subtotal),
          gstAmount: new Prisma.Decimal(computed.gstAmount),
          totalAmount: new Prisma.Decimal(computed.totalAmount),
          estimatedCost: new Prisma.Decimal(computed.estimatedCost),
          profitAmount: new Prisma.Decimal(computed.profitAmount),
          marginPercent: new Prisma.Decimal(computed.marginPercent ?? 0),
        },
      }),
    );

    await prisma.$transaction(ops);

    await auditLog({
      module: "quotation",
      action: "item_create",
      actorUserId: userId,
      projectId,
      entityType: "QuotationItem",
      entityId: item.id,
      metadata: { quotationId, sectionId: section.id, sku: item.sku },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotationId,
      projectId,
      actorUserId: userId,
      note: "Item created",
      data: { quotationId, itemId: item.id, sku: item.sku, computed },
    });

    return NextResponse.json({ success: true, data: { id: item.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add item";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
