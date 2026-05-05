"use server";

import {
  DesignBriefStatus,
  LineItemType,
  Permission,
  Prisma,
  ProjectStatus,
  PropertyType,
  ScopeCategory,
} from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createProjectWithTx } from "@/lib/projects/service";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";
import { computeProjectQuotationSummary } from "@/lib/quotation-engine/project-quotation-math";
import { generateBriefSummaryAi, generateDesignConceptAi } from "@/lib/design-ai/engine";
import { DESIGN_BOQ_CATEGORIES, generateDesignBoqAi } from "@/lib/design-ai/boq-engine";

const createDesignBriefSchema = z.object({
  clientName: z.string().trim().min(2).max(140),
  clientPhone: z.string().trim().max(60).optional(),
  clientEmail: z.string().trim().email().optional().or(z.literal("")),
  propertyType: z.nativeEnum(PropertyType),
  propertyAddress: z.string().trim().min(3).max(280),
  floorArea: z.string().trim().max(60).optional(),
  rooms: z.string().trim().max(120).optional(),
  budgetMin: z.string().trim().optional(),
  budgetMax: z.string().trim().optional(),
  preferredStyle: z.string().trim().max(120).optional(),
  timeline: z.string().trim().max(140).optional(),
  requirements: z.string().trim().min(10).max(6000),
});

const updateDesignBriefSchema = z.object({
  briefId: z.string().trim().min(1),
  clientName: z.string().trim().min(2).max(140),
  clientPhone: z.string().trim().max(60).optional(),
  clientEmail: z.string().trim().email().optional().or(z.literal("")),
  propertyType: z.nativeEnum(PropertyType),
  propertyAddress: z.string().trim().min(3).max(280),
  floorArea: z.string().trim().max(60).optional(),
  rooms: z.string().trim().max(120).optional(),
  budgetMin: z.string().trim().optional(),
  budgetMax: z.string().trim().optional(),
  timeline: z.string().trim().max(140).optional(),
  requirements: z.string().trim().min(10).max(6000),
});

const updateBoqItemSchema = z.object({
  boqId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  room: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().min(0),
  unit: z.string().trim().min(1).max(30),
  costRate: z.coerce.number().min(0),
  sellingRate: z.coerce.number().min(0),
  supplierType: z.string().trim().max(80).optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  aiNotes: z.string().trim().max(2000).optional(),
});

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function parseStrictMoney(value: string | undefined, label: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid non-negative amount.`);
  }
  return Math.round(parsed * 100) / 100;
}

function parseNullableFloat(value: string | undefined, label: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid non-negative number.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function parseNullableInt(value: string | undefined, label: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a whole number.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid non-negative whole number.`);
  }
  return parsed;
}

function numberToNullableString(value: number | null): string | null {
  return value === null ? null : value.toString();
}

function asNumber(value: { toString(): string } | number | null): number | null {
  if (value === null) return null;
  return Number(value.toString());
}

type DesignBriefProjectSource = {
  id: string;
  title: string;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  propertyType: PropertyType;
  propertyAddress: string | null;
  floorArea: string | null;
  rooms: string | null;
  preferredStyle: string | null;
  timeline: string | null;
  requirements: string | null;
};

function deriveProjectTypeFromPropertyType(propertyType: PropertyType): "RESIDENTIAL" | "COMMERCIAL" {
  return propertyType === PropertyType.COMMERCIAL ? "COMMERCIAL" : "RESIDENTIAL";
}

function buildProjectNotesFromDesignBrief(brief: DesignBriefProjectSource): string | null {
  const notes = [
    `Generated from design brief: ${brief.title}`,
    `Property type: ${brief.propertyType}`,
    brief.floorArea ? `Floor area: ${brief.floorArea}` : null,
    brief.rooms ? `Rooms: ${brief.rooms}` : null,
    brief.preferredStyle ? `Preferred style: ${brief.preferredStyle}` : null,
    brief.timeline ? `Timeline: ${brief.timeline}` : null,
    brief.requirements ? `Requirements: ${brief.requirements}` : null,
  ].filter((value): value is string => Boolean(value));

  return notes.length > 0 ? notes.join("\n") : null;
}

async function ensureProjectForDesignBrief(params: {
  brief: DesignBriefProjectSource;
  actorUserId: string;
}) {
  const clientName = params.brief.clientName?.trim() || params.brief.title.trim() || "Design Project";
  const siteAddress = params.brief.propertyAddress?.trim() || params.brief.title.trim() || "Address pending";
  const projectName = params.brief.clientName?.trim()
    ? `${params.brief.clientName.trim()} Project`
    : params.brief.title.trim() || "Design Project";

  return prisma.$transaction(async (tx) => {
    const current = await tx.designBrief.findUnique({
      where: { id: params.brief.id },
      select: { projectId: true },
    });
    if (!current) throw new Error("Design brief not found.");
    if (current.projectId) {
      return { projectId: current.projectId, created: false };
    }

    const { project, client } = await createProjectWithTx(tx, {
      projectCode: undefined,
      name: projectName,
      projectType: deriveProjectTypeFromPropertyType(params.brief.propertyType),
      status: ProjectStatus.LEAD,
      clientName,
      clientCompany: null,
      clientEmail: params.brief.clientEmail?.trim().toLowerCase() || null,
      clientPhone: params.brief.clientPhone?.trim() || null,
      siteAddress,
      startDate: null,
      targetCompletionDate: null,
      actualCompletionDate: null,
      contractValue: 0,
      revisedContractValue: 0,
      estimatedCost: 0,
      committedCost: 0,
      actualCost: 0,
      notes: buildProjectNotesFromDesignBrief(params.brief),
      addressLine1: siteAddress,
      addressLine2: null,
      postalCode: null,
      propertyType: params.brief.propertyType,
      unitSizeSqft: null,
    });

    const linked = await tx.designBrief.updateMany({
      where: { id: params.brief.id, projectId: null },
      data: { projectId: project.id },
    });

    if (linked.count === 0) {
      const existing = await tx.designBrief.findUnique({
        where: { id: params.brief.id },
        select: { projectId: true },
      });
      await tx.client.delete({ where: { id: client.id } });
      if (!existing?.projectId) {
        throw new Error("Design brief is not linked to a project.");
      }
      return { projectId: existing.projectId, created: false };
    }

    await tx.projectCommercialProfile.create({
      data: { projectId: project.id, status: "LEAD" },
    });

    await tx.projectTimelineItem.create({
      data: {
        projectId: project.id,
        type: "NOTE",
        title: "Project auto-created from design brief",
        description: `Generated while converting BOQ "${params.brief.title}" to quotation.`,
        createdById: params.actorUserId,
        metadata: {
          designBriefId: params.brief.id,
          designBriefTitle: params.brief.title,
          propertyType: params.brief.propertyType,
        },
      },
    });

    return { projectId: project.id, created: true };
  });
}

function briefPayload(brief: {
  clientName: string | null;
  propertyType: PropertyType;
  floorArea: string | null;
  rooms: string | null;
  budgetMin: { toString(): string } | number | null;
  budgetMax: { toString(): string } | number | null;
  preferredStyle: string | null;
  timeline: string | null;
  requirements: string | null;
}) {
  return {
    clientName: brief.clientName || "Client",
    propertyType: brief.propertyType,
    floorArea: brief.floorArea,
    rooms: brief.rooms,
    budgetMin: asNumber(brief.budgetMin),
    budgetMax: asNumber(brief.budgetMax),
    preferredStyle: brief.preferredStyle,
    timeline: brief.timeline,
    requirements: brief.requirements,
  };
}

function roundCurrency(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function marginPct(totalSellingPrice: number, totalCost: number): number {
  if (totalSellingPrice <= 0) return 0;
  return Math.round((((totalSellingPrice - totalCost) / totalSellingPrice) * 100 + Number.EPSILON) * 10000) / 10000;
}

function categoryToScopeCategory(category: string): ScopeCategory {
  const c = category.trim().toLowerCase();
  if (c === "hacking") return ScopeCategory.HACKING_DEMOLITION;
  if (c === "masonry") return ScopeCategory.MASONRY_WORKS;
  if (c === "ceiling") return ScopeCategory.CEILING_PARTITION;
  if (c === "flooring") return ScopeCategory.FLOORING;
  if (c === "carpentry") return ScopeCategory.CARPENTRY;
  if (c === "electrical") return ScopeCategory.ELECTRICAL_WORKS;
  if (c === "plumbing") return ScopeCategory.PLUMBING_WORKS;
  if (c === "painting") return ScopeCategory.PAINTING_WORKS;
  if (c === "glass & aluminium") return ScopeCategory.GLASS_ALUMINIUM;
  if (c === "cleaning") return ScopeCategory.CLEANING_DISPOSAL;
  return ScopeCategory.OTHER;
}

function designBriefHref(briefId: string): string {
  return `/design-ai/briefs/${briefId}`;
}

function designBriefEditHref(briefId: string): string {
  return `/design-ai/briefs/${briefId}/edit`;
}

async function recomputeDesignBoqTotals(boqId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const items = await tx.designBOQItem.findMany({ where: { designBOQId: boqId } });

  const totalCost = roundCurrency(items.reduce((sum, item) => sum + Number(item.totalCost), 0));
  const totalSellingPrice = roundCurrency(items.reduce((sum, item) => sum + Number(item.totalSellingPrice), 0));
  const grossProfit = roundCurrency(totalSellingPrice - totalCost);
  const grossMargin = marginPct(totalSellingPrice, totalCost);

  await tx.designBOQ.update({
    where: { id: boqId },
    data: {
      totalCost: new Prisma.Decimal(totalCost),
      totalSellingPrice: new Prisma.Decimal(totalSellingPrice),
      grossProfit: new Prisma.Decimal(grossProfit),
      grossMargin: new Prisma.Decimal(grossMargin),
    },
  });
}

export async function createDesignBrief(formData: FormData) {
  await requireUser();

  const parsed = createDesignBriefSchema.safeParse({
    clientName: formData.get("clientName"),
    clientPhone: formData.get("clientPhone") || undefined,
    clientEmail: formData.get("clientEmail") || "",
    propertyType: formData.get("propertyType"),
    propertyAddress: formData.get("propertyAddress"),
    floorArea: formData.get("floorArea") || undefined,
    rooms: formData.get("rooms") || undefined,
    budgetMin: formData.get("budgetMin")?.toString() || "",
    budgetMax: formData.get("budgetMax")?.toString() || "",
    preferredStyle: formData.get("preferredStyle") || undefined,
    timeline: formData.get("timeline") || undefined,
    requirements: formData.get("requirements"),
  });

  if (!parsed.success) {
    throw new Error("Invalid design brief input.");
  }

  const budgetMin = parseMoney(parsed.data.budgetMin);
  const budgetMax = parseMoney(parsed.data.budgetMax);

  const title = `${parsed.data.clientName} - ${parsed.data.propertyType} Design Brief`;

  const created = await prisma.designBrief.create({
    data: {
      title,
      clientNeeds: parsed.data.requirements,
      propertyType: parsed.data.propertyType,
      status: DesignBriefStatus.DRAFT,
      clientName: parsed.data.clientName,
      clientPhone: parsed.data.clientPhone || null,
      clientEmail: parsed.data.clientEmail || null,
      propertyAddress: parsed.data.propertyAddress,
      floorArea: parsed.data.floorArea || null,
      rooms: parsed.data.rooms || null,
      budgetMin,
      budgetMax,
      preferredStyle: parsed.data.preferredStyle || null,
      timeline: parsed.data.timeline || null,
      requirements: parsed.data.requirements,
    },
  });

  revalidatePath("/design-ai");
  revalidatePath("/design-ai/briefs");
  redirect(`/design-ai/briefs/${created.id}`);
}

export async function updateDesignBrief(formData: FormData) {
  await requireUser();

  const parsed = updateDesignBriefSchema.safeParse({
    briefId: formData.get("briefId"),
    clientName: formData.get("clientName"),
    clientPhone: formData.get("clientPhone") || undefined,
    clientEmail: formData.get("clientEmail") || "",
    propertyType: formData.get("propertyType"),
    propertyAddress: formData.get("propertyAddress"),
    floorArea: formData.get("floorArea") || undefined,
    rooms: formData.get("rooms") || undefined,
    budgetMin: formData.get("budgetMin")?.toString() || "",
    budgetMax: formData.get("budgetMax")?.toString() || "",
    timeline: formData.get("timeline") || undefined,
    requirements: formData.get("requirements"),
  });

  if (!parsed.success) {
    redirect(`${designBriefEditHref(String(formData.get("briefId") ?? "").trim())}?error=${encodeURIComponent("Invalid design brief input.")}`);
  }

  let updatedId = parsed.data.briefId;

  try {
    const floorArea = parseNullableFloat(parsed.data.floorArea, "Floor area");
    const rooms = parseNullableInt(parsed.data.rooms, "Rooms");
    const budgetMin = parseStrictMoney(parsed.data.budgetMin, "Budget min");
    const budgetMax = parseStrictMoney(parsed.data.budgetMax, "Budget max");

    if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
      throw new Error("Budget max must be greater than or equal to budget min.");
    }

    const title = `${parsed.data.clientName} - ${parsed.data.propertyType} Design Brief`;

    const updated = await prisma.designBrief.update({
      where: { id: parsed.data.briefId },
      data: {
        title,
        clientNeeds: parsed.data.requirements,
        clientName: parsed.data.clientName,
        clientPhone: parsed.data.clientPhone || null,
        clientEmail: parsed.data.clientEmail || null,
        propertyType: parsed.data.propertyType,
        propertyAddress: parsed.data.propertyAddress,
        floorArea: numberToNullableString(floorArea),
        rooms: numberToNullableString(rooms),
        budgetMin,
        budgetMax,
        timeline: parsed.data.timeline || null,
        requirements: parsed.data.requirements,
      },
      select: { id: true },
    });
    updatedId = updated.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update design brief.";
    redirect(`${designBriefEditHref(parsed.data.briefId)}?error=${encodeURIComponent(message.slice(0, 180))}`);
  }

  revalidatePath("/design-ai");
  revalidatePath("/design-ai/briefs");
  revalidatePath(designBriefHref(updatedId));
  revalidatePath(designBriefEditHref(updatedId));
  revalidatePath("/design-ai/boq");
  revalidatePath("/design-ai/concepts");
  redirect(designBriefHref(updatedId));
}

export async function deleteDesignBrief(formData: FormData) {
  await requireUser();

  const briefId = String(formData.get("briefId") ?? "").trim();
  if (!briefId) throw new Error("Missing design brief id.");

  await prisma.designBrief.delete({
    where: { id: briefId },
  });

  revalidatePath("/design-ai");
  revalidatePath("/design-ai/briefs");
  revalidatePath("/design-ai/boq");
  revalidatePath("/design-ai/concepts");
  redirect("/design-ai/briefs");
}

export async function generateDesignBriefSummary(formData: FormData) {
  await requireUser();

  const briefId = String(formData.get("briefId") ?? "").trim();
  if (!briefId) throw new Error("Missing design brief id.");

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    select: {
      id: true,
      clientName: true,
      propertyType: true,
      floorArea: true,
      rooms: true,
      budgetMin: true,
      budgetMax: true,
      preferredStyle: true,
      timeline: true,
      requirements: true,
    },
  });

  if (!brief) throw new Error("Design brief not found.");

  const ai = await generateBriefSummaryAi(briefPayload(brief));

  await prisma.designBrief.update({
    where: { id: brief.id },
    data: {
      aiSummary: ai.aiSummary,
      aiRecommendedStyle: ai.aiRecommendedStyle,
      aiBudgetRisk: ai.aiBudgetRisk,
      aiNextAction: ai.aiNextAction,
      status: DesignBriefStatus.DESIGN_IN_PROGRESS,
    },
  });

  revalidatePath("/design-ai");
  revalidatePath("/design-ai/briefs");
  revalidatePath(`/design-ai/briefs/${brief.id}`);
}

export async function generateDesignConcept(formData: FormData) {
  await requireUser();

  const briefId = String(formData.get("briefId") ?? "").trim();
  if (!briefId) throw new Error("Missing design brief id.");

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    select: {
      id: true,
      clientName: true,
      propertyType: true,
      floorArea: true,
      rooms: true,
      budgetMin: true,
      budgetMax: true,
      preferredStyle: true,
      timeline: true,
      requirements: true,
      aiSummary: true,
    },
  });

  if (!brief) throw new Error("Design brief not found.");

  const ai = await generateDesignConceptAi({
    ...briefPayload(brief),
    aiSummary: brief.aiSummary,
  });

  const concept = await prisma.designConcept.create({
    data: {
      designBriefId: brief.id,
      title: ai.title,
      theme: ai.theme,
      conceptSummary: ai.conceptSummary,
      livingRoomConcept: ai.livingRoomConcept,
      bedroomConcept: ai.bedroomConcept,
      kitchenConcept: ai.kitchenConcept,
      bathroomConcept: ai.bathroomConcept,
      materialPalette: ai.materialPalette,
      lightingPlan: ai.lightingPlan,
      furnitureDirection: ai.furnitureDirection,
      renovationScope: ai.renovationScope,
    },
  });

  await prisma.designBrief.update({
    where: { id: brief.id },
    data: {
      status: DesignBriefStatus.QS_IN_PROGRESS,
    },
  });

  revalidatePath("/design-ai");
  revalidatePath("/design-ai/briefs");
  revalidatePath(`/design-ai/briefs/${brief.id}`);
  revalidatePath(`/design-ai/concepts/${concept.id}`);
  redirect(`/design-ai/concepts/${concept.id}`);
}

export async function generateDesignBOQ(formData: FormData) {
  await requireUser();

  const conceptId = String(formData.get("conceptId") ?? "").trim();
  if (!conceptId) throw new Error("Missing design concept id.");

  const concept = await prisma.designConcept.findUnique({
    where: { id: conceptId },
    include: {
      designBrief: true,
    },
  });

  if (!concept) throw new Error("Design concept not found.");

  const brief = concept.designBrief;

  const ai = await generateDesignBoqAi({
    clientName: brief.clientName || "Client",
    propertyType: brief.propertyType,
    preferredStyle: brief.preferredStyle,
    timeline: brief.timeline,
    requirements: brief.requirements,
    budgetMin: asNumber(brief.budgetMin),
    budgetMax: asNumber(brief.budgetMax),
    conceptTitle: concept.title,
    conceptSummary: concept.conceptSummary,
    livingRoomConcept: concept.livingRoomConcept,
    bedroomConcept: concept.bedroomConcept,
    kitchenConcept: concept.kitchenConcept,
    bathroomConcept: concept.bathroomConcept,
    materialPalette: concept.materialPalette,
    renovationScope: concept.renovationScope,
  });

  const created = await prisma.$transaction(async (tx) => {
    const boq = await tx.designBOQ.create({
      data: {
        designBriefId: brief.id,
        designConceptId: concept.id,
        title: ai.title,
        status: "DRAFT",
        aiRiskNotes: ai.aiRiskNotes || null,
      },
    });

    await tx.designBOQItem.createMany({
      data: ai.items.map((item, index) => {
        const quantity = roundCurrency(item.quantity);
        const costRate = roundCurrency(item.costRate);
        const sellingRate = roundCurrency(item.sellingRate);
        const totalCost = roundCurrency(quantity * costRate);
        const totalSellingPrice = roundCurrency(quantity * sellingRate);

        return {
          designBOQId: boq.id,
          room: item.room,
          category: DESIGN_BOQ_CATEGORIES.includes(item.category as (typeof DESIGN_BOQ_CATEGORIES)[number])
            ? item.category
            : "Project Management",
          description: item.description,
          quantity: new Prisma.Decimal(quantity),
          unit: item.unit,
          costRate: new Prisma.Decimal(costRate),
          sellingRate: new Prisma.Decimal(sellingRate),
          totalCost: new Prisma.Decimal(totalCost),
          totalSellingPrice: new Prisma.Decimal(totalSellingPrice),
          margin: new Prisma.Decimal(marginPct(totalSellingPrice, totalCost)),
          supplierType: item.supplierType,
          riskLevel: item.riskLevel,
          aiNotes: item.aiNotes,
          sortOrder: index,
        };
      }),
    });

    await recomputeDesignBoqTotals(boq.id, tx);

    return boq;
  });

  await prisma.designBrief.update({
    where: { id: brief.id },
    data: { status: DesignBriefStatus.READY_FOR_QUOTATION },
  });

  revalidatePath("/design-ai");
  revalidatePath("/design-ai/boq");
  revalidatePath(`/design-ai/concepts/${concept.id}`);
  revalidatePath(`/design-ai/briefs/${brief.id}`);
  redirect(`/design-ai/boq/${created.id}`);
}

export async function updateDesignBOQItem(formData: FormData) {
  await requireUser();

  const parsed = updateBoqItemSchema.safeParse({
    boqId: formData.get("boqId"),
    itemId: formData.get("itemId"),
    room: formData.get("room"),
    category: formData.get("category"),
    description: formData.get("description"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    costRate: formData.get("costRate"),
    sellingRate: formData.get("sellingRate"),
    supplierType: formData.get("supplierType") || undefined,
    riskLevel: formData.get("riskLevel") || undefined,
    aiNotes: formData.get("aiNotes") || undefined,
  });

  if (!parsed.success) throw new Error("Invalid BOQ item input.");

  const totalCost = roundCurrency(parsed.data.quantity * parsed.data.costRate);
  const totalSellingPrice = roundCurrency(parsed.data.quantity * parsed.data.sellingRate);
  const margin = marginPct(totalSellingPrice, totalCost);

  await prisma.$transaction(async (tx) => {
    await tx.designBOQItem.update({
      where: { id: parsed.data.itemId },
      data: {
        room: parsed.data.room,
        category: parsed.data.category,
        description: parsed.data.description,
        quantity: new Prisma.Decimal(roundCurrency(parsed.data.quantity)),
        unit: parsed.data.unit,
        costRate: new Prisma.Decimal(roundCurrency(parsed.data.costRate)),
        sellingRate: new Prisma.Decimal(roundCurrency(parsed.data.sellingRate)),
        totalCost: new Prisma.Decimal(totalCost),
        totalSellingPrice: new Prisma.Decimal(totalSellingPrice),
        margin: new Prisma.Decimal(margin),
        supplierType: parsed.data.supplierType || null,
        riskLevel: parsed.data.riskLevel || null,
        aiNotes: parsed.data.aiNotes || null,
      },
    });

    await recomputeDesignBoqTotals(parsed.data.boqId, tx);
  });

  revalidatePath("/design-ai/boq");
  revalidatePath(`/design-ai/boq/${parsed.data.boqId}`);
}

export async function deleteDesignBOQItem(formData: FormData) {
  await requireUser();

  const boqId = String(formData.get("boqId") ?? "").trim();
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!boqId || !itemId) throw new Error("Missing BOQ item id.");

  await prisma.$transaction(async (tx) => {
    await tx.designBOQItem.delete({ where: { id: itemId } });
    await recomputeDesignBoqTotals(boqId, tx);
  });

  revalidatePath("/design-ai/boq");
  revalidatePath(`/design-ai/boq/${boqId}`);
}

export async function createQuotationFromDesignBOQ(formData: FormData) {
  const user = await requireUser();
  const boqId = String(formData.get("boqId") ?? "").trim();
  if (!boqId) throw new Error("Missing BOQ id.");

  const boq = await prisma.designBOQ.findUnique({
    where: { id: boqId },
    include: {
      designBrief: true,
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!boq) throw new Error("BOQ not found.");

  let projectId = boq.designBrief.projectId;
  let createdProject = false;

  if (!projectId) {
    await requirePermission({ permission: Permission.PROJECT_WRITE });
    const ensured = await ensureProjectForDesignBrief({
      brief: boq.designBrief,
      actorUserId: user.id,
    });
    projectId = ensured.projectId;
    createdProject = ensured.created;
  }

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true, commercialProfile: true },
  });
  if (!project) throw new Error("Project not found.");

  const sectionMap = new Map<string, typeof boq.items>();
  for (const item of boq.items) {
    const key = item.category.trim() || "Project Management";
    const arr = sectionMap.get(key) ?? [];
    arr.push(item);
    sectionMap.set(key, arr);
  }

  const sections = Array.from(sectionMap.entries()).map(([category, items]) => ({
    category: categoryToScopeCategory(category),
    title: category,
    description: `${category} works generated from AI BOQ`,
    isIncluded: true,
    isOptional: false,
    remarks: "",
    lineItems: items.map((item) => ({
      sku: "",
      description: `${item.room}: ${item.description}`,
      specification: item.aiNotes ?? "",
      unit: item.unit,
      quantity: Number(item.quantity),
      unitPrice: Number(item.sellingRate),
      costPrice: Number(item.costRate),
      remarks: item.supplierType ?? "",
      itemType: LineItemType.SUPPLY_AND_INSTALL,
      isIncluded: true,
      isOptional: false,
    })),
  }));

  if (sections.length === 0) {
    throw new Error("BOQ has no items to convert.");
  }

  const gstRate = project.commercialProfile?.gstRate ? Number(project.commercialProfile.gstRate) : 0.09;
  const computed = computeProjectQuotationSummary({ sections, discountAmount: 0, gstRate });

  const issueDate = new Date();
  const latest = await prisma.quotation.findFirst({
    where: { projectId, isLatest: true },
    select: { quotationNumber: true, version: true },
    orderBy: { createdAt: "desc" },
  });

  const quotationNumber = latest?.quotationNumber ?? generateQuoteReference(issueDate);
  const version = (latest?.version ?? 0) + 1;

  const quotation = await prisma.$transaction(async (tx) => {
    await tx.quotation.updateMany({ where: { projectId, isLatest: true }, data: { isLatest: false } });

    return tx.quotation.create({
      data: {
        clientId: project.clientId,
        projectId,
        designBriefId: boq.designBriefId,
        quotationNumber,
        version,
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

        subtotal: new Prisma.Decimal(computed.subtotal),
        discountAmount: new Prisma.Decimal(0),
        gstAmount: new Prisma.Decimal(computed.gstAmount),
        totalAmount: new Prisma.Decimal(computed.totalAmount),
        estimatedCost: new Prisma.Decimal(computed.estimatedCost),
        profitAmount: new Prisma.Decimal(computed.profitAmount),
        marginPercent: new Prisma.Decimal(computed.marginPercent ?? 0),
        notes: `Generated from AI Design BOQ (${boq.title})`,

        sections: {
          create: sections.map((section, sectionIndex) => ({
            category: section.category,
            title: section.title,
            description: section.description,
            isIncluded: true,
            isOptional: false,
            sortOrder: sectionIndex,
            subtotal: new Prisma.Decimal(computed.sections[sectionIndex]?.subtotal ?? 0),
            lineItems: {
              create: section.lineItems.map((item, itemIndex) => ({
                sku: item.sku,
                itemType: item.itemType,
                description: item.description,
                specification: item.specification || null,
                unit: item.unit,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: new Prisma.Decimal(item.unitPrice),
                costPrice: new Prisma.Decimal(item.costPrice),
                totalPrice: new Prisma.Decimal(computed.sections[sectionIndex]?.lineItems[itemIndex]?.totalPrice ?? 0),
                totalCost: new Prisma.Decimal(computed.sections[sectionIndex]?.lineItems[itemIndex]?.totalCost ?? 0),
                profit: new Prisma.Decimal(computed.sections[sectionIndex]?.lineItems[itemIndex]?.profit ?? 0),
                marginPercent: new Prisma.Decimal(computed.sections[sectionIndex]?.lineItems[itemIndex]?.marginPercent ?? 0),
                remarks: item.remarks || null,
                isIncluded: true,
                isOptional: false,
                sortOrder: itemIndex,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
  });

  await prisma.designBOQ.update({ where: { id: boqId }, data: { status: "CONVERTED" } });

  await prisma.projectTimelineItem.create({
    data: {
      projectId,
      type: "QUOTATION",
      title: `Quotation created from AI BOQ: ${boq.title}`,
      createdById: userId,
      metadata: { quotationId: quotation.id, boqId },
    },
  });

  revalidatePath("/design-ai/boq");
  revalidatePath(`/design-ai/boq/${boqId}`);
  revalidatePath(`/design-ai/briefs/${boq.designBriefId}`);
  if (createdProject) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath(`/projects/${projectId}/quotations`);

  redirect(`/projects/${projectId}/quotations/${quotation.id}`);
}
