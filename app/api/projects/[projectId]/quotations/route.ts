import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Permission, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";
import { auditLog, createRevision } from "@/lib/audit";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";
import { toPaymentTermCreateMany, validatePaymentTerms } from "@/lib/quotations/payment-terms";

const scopeCategorySchema = z.enum([
  "HACKING_DEMOLITION",
  "MASONRY_WORKS",
  "CARPENTRY",
  "ELECTRICAL_WORKS",
  "PLUMBING_WORKS",
  "CEILING_PARTITION",
  "FLOORING",
  "PAINTING_WORKS",
  "GLASS_ALUMINIUM",
  "CLEANING_DISPOSAL",
  "OTHER",
]);

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

const lineItemSchema = z.object({
  sku: z.string().optional().default(""),
  itemMasterId: z.string().optional().nullable().default(null),
  unitOfMeasureId: z.string().optional().nullable().default(null),
  description: z.string().min(1),
  specification: z.string().optional().default(""),
  unit: z.string().min(1),
  quantity: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).default(0),
  remarks: z.string().optional().default(""),
  itemType: lineItemTypeSchema,
  isIncluded: z.boolean().default(true),
  isOptional: z.boolean().default(false),
});

const sectionSchema = z.object({
  category: scopeCategorySchema,
  title: z.string().min(1),
  description: z.string().optional().default(""),
  isIncluded: z.boolean().default(true),
  isOptional: z.boolean().default(false),
  remarks: z.string().optional().default(""),
  lineItems: z.array(lineItemSchema).min(1),
});

const createSchema = z.object({
  issueDate: z.string().min(1),
  validityDays: z.coerce.number().int().min(1).max(180).default(14),
  paymentTerms: z.string().optional().default(""),
  paymentTermsV2: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        percent: z.coerce.number().min(0).max(100).nullable().optional().default(null),
        amount: z.coerce.number().min(0).nullable().optional().default(null),
        triggerType: z.string().max(60).nullable().optional().default(null),
        dueDays: z.coerce.number().int().min(0).nullable().optional().default(null),
        sortOrder: z.coerce.number().int().min(0).optional(),
      }),
    )
    .optional()
    .default([]),
  exclusions: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  discountAmount: z.coerce.number().min(0).default(0),
  sections: z.array(sectionSchema).min(1),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    await requirePermission({ permission: Permission.QUOTE_READ, projectId });

    const quotations = await prisma.quotation.findMany({
      where: { projectId },
      include: {
        sections: {
          include: { lineItems: { include: { cost: true } } },
          orderBy: { sortOrder: "asc" },
        },
        acceptance: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: quotations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch quotations";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const { userId } = await requirePermission({
      permission: Permission.QUOTE_WRITE,
      projectId,
    });

    const body = await request.json();
    const input = createSchema.parse(body);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true, commercialProfile: true },
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const issueDate = new Date(input.issueDate);
    const gstRate = project.commercialProfile?.gstRate
      ? Number(project.commercialProfile.gstRate)
      : 0.09;

    const computed = computeProjectQuotationSummary({
      sections: input.sections,
      discountAmount: input.discountAmount,
      gstRate,
    });

    const latest = await prisma.quotation.findFirst({
      where: { projectId, isLatest: true },
      select: { quotationNumber: true, version: true },
      orderBy: { createdAt: "desc" },
    });
    const quotationNumber = latest?.quotationNumber ?? generateQuoteReference(issueDate);
    const version = (latest?.version ?? 0) + 1;

    const paymentValidation = validatePaymentTerms({
      terms: input.paymentTermsV2.map((t, index) => ({
        title: t.title,
        percent: t.percent === null ? null : Number(t.percent),
        amount: t.amount === null ? null : Number(t.amount),
        triggerType: t.triggerType ?? null,
        dueDays: t.dueDays ?? null,
        sortOrder: t.sortOrder ?? index,
      })),
      subtotal: computed.subtotal,
    });
    if (!paymentValidation.ok) {
      return NextResponse.json({ success: false, error: paymentValidation.error }, { status: 400 });
    }

    const quotation = await prisma.$transaction(async (tx) => {
      await tx.quotation.updateMany({
        where: { projectId, isLatest: true },
        data: { isLatest: false },
      });

      return await tx.quotation.create({
        data: {
        clientId: project.clientId,
        projectId: project.id,
        quotationNumber,
        version,
        isLatest: true,
        issueDate,
        validityDays: input.validityDays,
        status: "DRAFT",

        clientNameSnapshot: project.client.name,
        companyNameSnapshot: project.client.companyName ?? null,
        contactPersonSnapshot: project.client.contactPerson ?? null,
        contactPhoneSnapshot: project.client.phone ?? null,
        contactEmailSnapshot: project.client.email ?? null,

        projectNameSnapshot: project.name,
        projectAddress1: project.addressLine1,
        projectAddress2: project.addressLine2 ?? null,
        projectPostalCode: project.postalCode ?? null,
        propertyType: project.propertyType,
        unitSizeSqft: project.unitSizeSqft ?? new Prisma.Decimal(0),

        subtotal: new Prisma.Decimal(computed.subtotal),
        discountAmount: new Prisma.Decimal(computed.discountAmount),
        gstAmount: new Prisma.Decimal(computed.gstAmount),
        totalAmount: new Prisma.Decimal(computed.totalAmount),
        estimatedCost: new Prisma.Decimal(computed.estimatedCost),
        profitAmount: new Prisma.Decimal(computed.profitAmount),
        marginPercent: new Prisma.Decimal(computed.marginPercent ?? 0),

        paymentTerms: input.paymentTerms || null,
        exclusions: input.exclusions || null,
        notes: input.notes || null,
        paymentTermsV2: paymentValidation.normalized.length
          ? { create: toPaymentTermCreateMany({ terms: paymentValidation.normalized }) }
          : undefined,

        sections: {
          create: input.sections.map((section, sectionIndex) => ({
            category: section.category,
            title: section.title,
            description: section.description || null,
            isIncluded: section.isIncluded,
            isOptional: section.isOptional,
            remarks: section.remarks || null,
            sortOrder: sectionIndex,
            subtotal: new Prisma.Decimal(computed.sections[sectionIndex]?.subtotal ?? 0),
            lineItems: {
              create: section.lineItems.map((item, itemIndex) => {
                const computedItem = computed.sections[sectionIndex]?.lineItems[itemIndex];

                return {
                  sku: item.sku || "",
                  itemMasterId: item.itemMasterId ?? null,
                  unitOfMeasureId: item.unitOfMeasureId ?? null,
                  itemType: item.itemType,
                  description: item.description,
                  specification: item.specification || null,
                  unit: item.unit,
                  quantity: new Prisma.Decimal(item.quantity),
                  unitPrice: new Prisma.Decimal(item.unitPrice),
                  costPrice: new Prisma.Decimal(item.costPrice),
                  totalPrice: new Prisma.Decimal(computedItem?.totalPrice ?? 0),
                  totalCost: new Prisma.Decimal(computedItem?.totalCost ?? 0),
                  profit: new Prisma.Decimal(computedItem?.profit ?? 0),
                  marginPercent: new Prisma.Decimal(computedItem?.marginPercent ?? 0),
                  remarks: item.remarks || null,
                  isIncluded: item.isIncluded,
                  isOptional: item.isOptional,
                  sortOrder: itemIndex,
                };
              }),
            },
          })),
        },
        },
        include: {
          sections: {
            include: { lineItems: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    });

    await prisma.projectTimelineItem.create({
      data: {
        projectId,
        type: "QUOTATION",
        title: `Quotation created: ${quotation.quotationNumber}`,
        createdById: userId,
        metadata: { quotationId: quotation.id },
      },
    });

    await auditLog({
      module: "quotation",
      action: "create",
      actorUserId: userId,
      projectId,
      entityType: "Quotation",
      entityId: quotation.id,
      metadata: { quotationNumber: quotation.quotationNumber },
    });

    await createRevision({
      entityType: "Quotation",
      entityId: quotation.id,
      projectId,
      actorUserId: userId,
      note: "Created",
      data: {
        quotationId: quotation.id,
        quotationNumber: quotation.quotationNumber,
        version,
        computed,
      },
    });

    return NextResponse.json({ success: true, data: { id: quotation.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quotation";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
