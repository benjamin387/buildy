"use server";

import { z } from "zod";
import { Permission, Prisma, UpsellPriority, UpsellStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog } from "@/lib/audit";
import { generateUpsellRecommendations } from "@/lib/ai/upsell-engine";
import { recomputeQuotationDerivedTotals } from "@/lib/quotations/service";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";
import { toDecimalCurrency } from "@/lib/design-workflow/qs-math";

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

async function ensureDraftQuotation(tx: Prisma.TransactionClient, projectId: string) {
  const existing = await tx.quotation.findFirst({
    where: { projectId, status: "DRAFT", isLatest: true },
    orderBy: [{ createdAt: "desc" }],
    include: { project: { include: { client: true } } },
  });
  if (existing) return existing;

  const project = await tx.project.findUnique({
    where: { id: projectId },
    include: { client: true, commercialProfile: true },
  });
  if (!project) throw new Error("Project not found.");

  const latest = await tx.quotation.findFirst({
    where: { projectId },
    select: { quotationNumber: true, version: true },
    orderBy: { createdAt: "desc" },
  });

  await tx.quotation.updateMany({
    where: { projectId, isLatest: true },
    data: { isLatest: false },
  });

  const issueDate = new Date();
  return tx.quotation.create({
    data: {
      clientId: project.clientId,
      projectId,
      quotationNumber: latest?.quotationNumber ?? generateQuoteReference(issueDate),
      version: (latest?.version ?? 0) + 1,
      isLatest: true,
      issueDate,
      validityDays: 14,
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

      subtotal: new Prisma.Decimal(0),
      discountAmount: new Prisma.Decimal(0),
      gstAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(0),
      estimatedCost: new Prisma.Decimal(0),
      profitAmount: new Prisma.Decimal(0),
      marginPercent: new Prisma.Decimal(0),
      notes: "Draft created for upsell additions.",
      internalNotes: null,
    },
    include: { project: { include: { client: true } } },
  });
}

const generateSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().optional().or(z.literal("")).default(""),
  quotationId: z.string().optional().or(z.literal("")).default(""),
  currentBudgetOverride: z.coerce.number().optional().default(NaN),
});

export async function generateUpsellRecommendationsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = generateSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    quotationId: formData.get("quotationId"),
    currentBudgetOverride: formData.get("currentBudgetOverride"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const briefId = parsed.data.briefId || null;
  const quotationId = parsed.data.quotationId || null;

  let propertyType: string | null = null;
  let designStyle: string | null = null;
  let clientNeeds = "";
  let currentBudget = 0;
  const descriptions: Array<{ description: string }> = [];

  if (briefId) {
    const brief = await prisma.designBrief.findUnique({
      where: { id: briefId },
      include: { areas: { include: { qsBoqDraftItems: true } } },
    });
    if (!brief || brief.projectId !== parsed.data.projectId) throw new Error("Not found.");
    propertyType = brief.propertyType;
    designStyle = brief.designStyle;
    clientNeeds = brief.clientNeeds;
    for (const a of brief.areas) {
      for (const it of a.qsBoqDraftItems) descriptions.push({ description: it.description });
    }
    currentBudget = brief.areas.reduce(
      (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, it) => s2 + Number(it.sellingTotal), 0),
      0,
    );
  } else if (quotationId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        project: true,
        sections: { include: { lineItems: true } },
      },
    });
    if (!quotation || quotation.projectId !== parsed.data.projectId) throw new Error("Not found.");
    propertyType = quotation.propertyType;
    designStyle = null;
    clientNeeds = quotation.notes ?? "";
    for (const s of quotation.sections) {
      for (const it of s.lineItems) descriptions.push({ description: it.description });
    }
    currentBudget = Number(quotation.subtotal);
  } else {
    const latestBrief = await prisma.designBrief.findFirst({
      where: { projectId: parsed.data.projectId },
      orderBy: [{ createdAt: "desc" }],
      include: { areas: { include: { qsBoqDraftItems: true } } },
    });
    if (latestBrief) {
      propertyType = latestBrief.propertyType;
      designStyle = latestBrief.designStyle;
      clientNeeds = latestBrief.clientNeeds;
      for (const a of latestBrief.areas) {
        for (const it of a.qsBoqDraftItems) descriptions.push({ description: it.description });
      }
      currentBudget = latestBrief.areas.reduce(
        (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, it) => s2 + Number(it.sellingTotal), 0),
        0,
      );
    }
  }

  if (!propertyType) {
    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { propertyType: true, notes: true },
    });
    if (!project) throw new Error("Project not found.");
    propertyType = project.propertyType;
    clientNeeds = project.notes ?? "";
  }

  const overrideBudget = Number.isFinite(parsed.data.currentBudgetOverride)
    ? clampNonNegative(parsed.data.currentBudgetOverride)
    : null;
  const budget = overrideBudget ?? clampNonNegative(currentBudget);

  const upsell = await generateUpsellRecommendations({
    propertyType: propertyType as any,
    designStyle: designStyle as any,
    currentBoqItems: descriptions,
    currentBudget: budget,
    clientNeeds,
  });

  const created = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const existing = await tx.upsellRecommendation.findMany({
      where: {
        projectId: parsed.data.projectId,
        status: { not: UpsellStatus.REJECTED },
        createdAt: { gte: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30) },
      },
      select: { category: true, title: true },
      take: 200,
    });
    const existingKey = new Set(existing.map((e) => `${e.category}::${e.title}`));

    const ops: Array<Prisma.PrismaPromise<unknown>> = [];
    for (const o of upsell.upsellOpportunities) {
      const key = `${o.category}::${o.title}`;
      if (existingKey.has(key)) continue;
      ops.push(
        tx.upsellRecommendation.create({
          data: {
            projectId: parsed.data.projectId,
            designBriefId: briefId,
            title: o.title,
            description: o.description,
            category: o.category,
            estimatedRevenueIncrease: toDecimalCurrency(o.estimatedRevenueIncrease),
            estimatedCostIncrease: toDecimalCurrency(o.estimatedCostIncrease),
            estimatedProfitIncrease: toDecimalCurrency(o.estimatedProfitIncrease),
            priority: o.priority === "HIGH" ? UpsellPriority.HIGH : o.priority === "LOW" ? UpsellPriority.LOW : UpsellPriority.MEDIUM,
            status: UpsellStatus.SUGGESTED,
            pitchText: o.pitchText,
            createdAt: now,
            updatedAt: now,
          },
          select: { id: true },
        }),
      );
    }
    const rows = await Promise.all(ops);
    return rows.length;
  });

  await auditLog({
    module: "design_intelligence",
    action: "generate_upsells",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: briefId ? "DesignBrief" : quotationId ? "Quotation" : "Project",
    entityId: briefId ?? quotationId ?? parsed.data.projectId,
    metadata: { createdCount: created, budget },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/quotations`);
  revalidatePath(`/projects/${parsed.data.projectId}/design-brief`);

  if (briefId) {
    redirect(`/projects/${parsed.data.projectId}/design-brief/${briefId}/upsell-engine`);
  }
  if (quotationId) {
    redirect(`/projects/${parsed.data.projectId}/quotations/${quotationId}#upsell`);
  }
  redirect(`/projects/${parsed.data.projectId}`);
}

const updateStatusSchema = z.object({
  projectId: z.string().min(1),
  upsellId: z.string().min(1),
  status: z.nativeEnum(UpsellStatus),
  returnTo: z.string().optional().or(z.literal("")).default(""),
});

export async function updateUpsellStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateStatusSchema.safeParse({
    projectId,
    upsellId: formData.get("upsellId"),
    status: formData.get("status"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const upsell = await prisma.upsellRecommendation.findUnique({
    where: { id: parsed.data.upsellId },
    select: { id: true, projectId: true },
  });
  if (!upsell || upsell.projectId !== parsed.data.projectId) throw new Error("Not found.");

  await prisma.upsellRecommendation.update({
    where: { id: upsell.id },
    data: { status: parsed.data.status },
  });

  revalidatePath(`/projects/${parsed.data.projectId}`);
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
  redirect(`/projects/${parsed.data.projectId}`);
}

const pushSchema = z.object({
  projectId: z.string().min(1),
  upsellId: z.string().min(1),
  returnTo: z.string().optional().or(z.literal("")).default(""),
});

export async function pushUpsellToQuotationAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = pushSchema.safeParse({
    projectId,
    upsellId: formData.get("upsellId"),
    returnTo: formData.get("returnTo"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const upsell = await prisma.upsellRecommendation.findUnique({
    where: { id: parsed.data.upsellId },
  });
  if (!upsell || upsell.projectId !== parsed.data.projectId) throw new Error("Not found.");

  const result = await prisma.$transaction(async (tx) => {
    const quotation = await ensureDraftQuotation(tx, parsed.data.projectId);

    const sectionTitle = "Upsell Opportunities";
    const section =
      (await tx.quotationSection.findFirst({
        where: { quotationId: quotation.id, title: sectionTitle },
        orderBy: [{ sortOrder: "asc" }],
      })) ??
      (await tx.quotationSection.create({
        data: {
          quotationId: quotation.id,
          category: "OTHER",
          title: sectionTitle,
          description: "Optional add-ons to increase value.",
          isIncluded: true,
          isOptional: true,
          remarks: "AUTO_UPSELL_SECTION",
          sortOrder: await tx.quotationSection.count({ where: { quotationId: quotation.id } }),
          subtotal: new Prisma.Decimal(0),
        },
      }));

    const existing = await tx.quotationItem.findFirst({
      where: { quotationSectionId: section.id, remarks: `From UpsellRecommendation ${upsell.id}` },
      select: { id: true },
    });
    if (existing) return { quotationId: quotation.id, created: false };

    const itemCount = await tx.quotationItem.count({ where: { quotationSectionId: section.id } });
    await tx.quotationItem.create({
      data: {
        quotationSectionId: section.id,
        itemType: "SERVICE",
        sku: "",
        itemMasterId: null,
        description: upsell.title,
        specification: upsell.description,
        unit: "LS",
        unitOfMeasureId: null,
        quantity: new Prisma.Decimal(1),
        unitPrice: upsell.estimatedRevenueIncrease,
        costPrice: upsell.estimatedCostIncrease,
        totalPrice: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
        profit: new Prisma.Decimal(0),
        marginPercent: new Prisma.Decimal(0),
        remarks: `From UpsellRecommendation ${upsell.id}`,
        isIncluded: true,
        isOptional: true,
        sortOrder: itemCount,
      },
    });

    await tx.upsellRecommendation.update({
      where: { id: upsell.id },
      data: { status: UpsellStatus.ACCEPTED },
    });

    await recomputeQuotationDerivedTotals({ quotationId: quotation.id, tx });

    return { quotationId: quotation.id, created: true };
  });

  await auditLog({
    module: "design_intelligence",
    action: "push_upsell_to_quotation",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "UpsellRecommendation",
    entityId: upsell.id,
    metadata: { quotationId: result.quotationId, created: result.created },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/quotations`);
  if (parsed.data.returnTo) redirect(parsed.data.returnTo);
  redirect(`/projects/${parsed.data.projectId}/quotations/${result.quotationId}/edit`);
}
