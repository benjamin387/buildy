import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";

export async function recomputeQuotationDerivedTotals(input: {
  quotationId: string;
  tx?: Prisma.TransactionClient;
}) {
  const tx = input.tx ?? prisma;
  const inInteractiveTx = Boolean(input.tx);

  const quotation = await tx.quotation.findUnique({
    where: { id: input.quotationId },
    include: {
      project: { include: { commercialProfile: true } },
      sections: {
        include: { lineItems: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!quotation) throw new Error("Quotation not found.");

  const gstRate = quotation.project.commercialProfile?.gstRate
    ? Number(quotation.project.commercialProfile.gstRate)
    : 0.09;

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
          unitPrice: Number(item.unitPrice),
          costPrice: Number(item.costPrice),
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
      tx.quotationSection.update({
        where: { id: section.id },
        data: { subtotal: new Prisma.Decimal(computed.sections[sectionIndex]?.subtotal ?? 0) },
      }),
    );

    const items = section.lineItems.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const computedItem = computed.sections[sectionIndex]?.lineItems[itemIndex];
      ops.push(
        tx.quotationItem.update({
          where: { id: item.id },
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
    tx.quotation.update({
      where: { id: input.quotationId },
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
    if (inInteractiveTx) {
      for (const op of ops) {
        await op;
      }
    } else {
      await prisma.$transaction(ops);
    }
  }

  return { computed };
}
