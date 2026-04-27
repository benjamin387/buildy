import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";
import { Prisma } from "@prisma/client";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";

const propertyTypeSchema = z.enum([
  "HDB",
  "CONDO",
  "LANDED",
  "COMMERCIAL",
  "OTHER",
]);

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

const createQuotationSchema = z.object({
  clientName: z.string().min(1),
  companyName: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  contactPhone: z.string().optional().default(""),
  contactEmail: z.string().email().optional().or(z.literal("")).default(""),
  projectName: z.string().min(1),
  projectAddress1: z.string().min(1),
  projectAddress2: z.string().optional().default(""),
  projectPostalCode: z.string().optional().default(""),
  propertyType: propertyTypeSchema,
  unitSizeSqft: z.coerce.number().min(0).optional().default(0),
  quotationDate: z.string().min(1),
  issueDate: z.string().optional(),
  validityDays: z.coerce.number().int().min(1).max(180).default(14),
  paymentTerms: z.string().optional().default(""),
  exclusions: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  discountAmount: z.coerce.number().min(0).default(0),
  sections: z.array(sectionSchema).min(1),
});

export async function GET() {
  try {
    const quotations = await prisma.quotation.findMany({
      include: {
        client: true,
        project: true,
        sections: {
          include: {
            lineItems: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: quotations,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch quotations",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = createQuotationSchema.parse(body);

    const computed = computeProjectQuotationSummary({
      sections: input.sections,
      discountAmount: input.discountAmount,
      gstRate: 0.09,
    });

    const issueDate = new Date(input.issueDate ?? input.quotationDate);

    const client = await prisma.client.create({
      data: {
        name: input.clientName,
        companyName: input.companyName || null,
        contactPerson: input.contactPerson || null,
        email: input.contactEmail || null,
        phone: input.contactPhone || null,
        mobile: input.contactPhone || null,
      },
    });

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: input.projectName,
        addressLine1: input.projectAddress1,
        addressLine2: input.projectAddress2 || null,
        postalCode: input.projectPostalCode || null,
        propertyType: input.propertyType,
        unitSizeSqft: input.unitSizeSqft || 0,
        contactPerson: input.contactPerson || null,
        contactPhone: input.contactPhone || null,
        contactEmail: input.contactEmail || null,
        notes: input.notes || null,
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        clientId: client.id,
        projectId: project.id,
        quotationNumber: generateQuoteReference(issueDate),
        isLatest: true,
        issueDate,
        validityDays: input.validityDays,
        status: "PREPARED",
        clientNameSnapshot: input.clientName,
        companyNameSnapshot: input.companyName || null,
        contactPersonSnapshot: input.contactPerson || null,
        contactPhoneSnapshot: input.contactPhone || null,
        contactEmailSnapshot: input.contactEmail || null,
        projectNameSnapshot: input.projectName,
        projectAddress1: input.projectAddress1,
        projectAddress2: input.projectAddress2 || null,
        projectPostalCode: input.projectPostalCode || null,
        propertyType: input.propertyType,
        unitSizeSqft: input.unitSizeSqft || 0,
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
        client: true,
        project: true,
        sections: {
          include: {
            lineItems: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create quotation",
      },
      { status: 400 },
    );
  }
}
