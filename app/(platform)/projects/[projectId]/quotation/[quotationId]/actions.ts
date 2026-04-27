"use server";

import { Permission, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";

const updateCostsSchema = z.object({
  projectId: z.string().min(1),
  quotationId: z.string().min(1),
});

export async function updateQuotationCosts(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const quotationId = String(formData.get("quotationId") ?? "");

  const parsed = updateCostsSchema.safeParse({ projectId, quotationId });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({
    permission: Permission.QUOTE_WRITE,
    projectId,
  });

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      project: { include: { commercialProfile: true } },
      sections: { include: { lineItems: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quotation || quotation.projectId !== projectId) throw new Error("Not found.");

  const gstRate = quotation.project.commercialProfile?.gstRate
    ? Number(quotation.project.commercialProfile.gstRate)
    : 0.09;

  const unitPriceByItemId: Record<string, number> = {};
  const costPriceByItemId: Record<string, number> = {};

  for (const section of quotation.sections) {
    for (const item of section.lineItems) {
      const rawUnitPrice = formData.get(`unitPrice_${item.id}`);
      const rawCostPrice = formData.get(`costPrice_${item.id}`);

      const unitPrice = rawUnitPrice === null || rawUnitPrice === "" ? Number(item.unitPrice) : Number(rawUnitPrice);
      const costPrice = rawCostPrice === null || rawCostPrice === "" ? Number(item.costPrice) : Number(rawCostPrice);

      unitPriceByItemId[item.id] = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0;
      costPriceByItemId[item.id] = Number.isFinite(costPrice) && costPrice >= 0 ? costPrice : 0;
    }
  }

  const builderSections = quotation.sections
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({
      category: section.category,
      title: section.title,
      description: section.description ?? undefined,
      isIncluded: section.isIncluded,
      isOptional: section.isOptional,
      remarks: section.remarks ?? undefined,
      lineItems: section.lineItems
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => ({
          sku: item.sku,
          description: item.description,
          specification: item.specification ?? undefined,
          unit: item.unit,
          quantity: Number(item.quantity),
          unitPrice: unitPriceByItemId[item.id] ?? Number(item.unitPrice),
          costPrice: costPriceByItemId[item.id] ?? Number(item.costPrice),
          remarks: item.remarks ?? undefined,
          itemType: item.itemType,
          isIncluded: item.isIncluded,
          isOptional: item.isOptional,
        })),
    }));

  const computed = computeProjectQuotationSummary({
    sections: builderSections,
    discountAmount: Number(quotation.discountAmount),
    gstRate,
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (let sectionIndex = 0; sectionIndex < quotation.sections.length; sectionIndex++) {
    const section = quotation.sections[sectionIndex];
    ops.push(
      prisma.quotationSection.update({
        where: { id: section.id },
        data: { subtotal: new Prisma.Decimal(computed.sections[sectionIndex]?.subtotal ?? 0) },
      }),
    );

    const items = section.lineItems.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const computedItem = computed.sections[sectionIndex]?.lineItems[itemIndex];
      const unitPrice = unitPriceByItemId[item.id] ?? Number(item.unitPrice);
      const costPrice = costPriceByItemId[item.id] ?? Number(item.costPrice);

      ops.push(
        prisma.quotationItem.update({
          where: { id: item.id },
          data: {
            unitPrice: new Prisma.Decimal(unitPrice),
            costPrice: new Prisma.Decimal(costPrice),
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

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  await auditLog({
    module: "quotation",
    action: "update_items",
    actorUserId: userId,
    projectId,
    entityType: "Quotation",
    entityId: quotationId,
    metadata: { itemCount: Object.keys(unitPriceByItemId).length },
  });

  await createRevision({
    entityType: "Quotation",
    entityId: quotationId,
    projectId,
    actorUserId: userId,
    note: "Updated items",
    data: {
      quotationId,
      unitPriceByItemId,
      costPriceByItemId,
      computed,
    },
  });

  revalidatePath(`/projects/${projectId}/quotation/${quotationId}`);
  revalidatePath(`/projects/${projectId}/quotation`);
}
