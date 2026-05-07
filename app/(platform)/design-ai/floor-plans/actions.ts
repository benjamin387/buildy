"use server";

import { DesignBriefStatus, PropertyType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { buildMockDesignConcept } from "@/lib/design-ai/concept";
import { getMockFloorPlanById, type FloorPlanRecord } from "@/lib/design-ai/floor-plan-engine";
import { prisma } from "@/lib/prisma";
import { generateDesignBOQ } from "@/app/(platform)/design-ai/actions";
import {
  buildFloorPlanCommercialBriefTitle,
  buildFloorPlanCommercialRequirementsRef,
  getPersistedFloorPlanSnapshot,
} from "@/app/(platform)/design-ai/floor-plans/data";

export async function createFloorPlanUpload(formData: FormData) {
  const projectName = String(formData.get("projectName") ?? "").trim();
  const fileValue = formData.get("floorPlanFile");
  const fileName = fileValue instanceof File ? fileValue.name.trim() : "";

  if (!projectName && !fileName) {
    redirect(
      `/design-ai/floor-plans/new?error=${encodeURIComponent(
        "Add a project name or choose a floor plan file before saving.",
      )}`,
    );
  }

  const name = projectName || stripFileExtension(fileName) || "Untitled Floor Plan";
  const storedFileName = fileName || `${name}.pdf`;
  const created = await prisma.floorPlanUpload.create({
    data: {
      name,
      fileUrl: `upload://${encodeURIComponent(storedFileName)}`,
    },
  });

  revalidatePath("/design-ai/floor-plans");
  redirect(`/design-ai/floor-plans/${created.id}`);
}

export async function createCommercialBoqFromFloorPlan(formData: FormData) {
  await requireUser();

  const floorPlanId = String(formData.get("floorPlanId") ?? "").trim();
  if (!floorPlanId) throw new Error("Missing floor plan id.");

  const { conceptId } = await ensureFloorPlanCommercialBridge(floorPlanId);
  const boqRequest = new FormData();
  boqRequest.set("conceptId", conceptId);

  await generateDesignBOQ(boqRequest);
}

function stripFileExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}

async function ensureFloorPlanCommercialBridge(floorPlanId: string) {
  const plan = await resolveFloorPlanRecord(floorPlanId);
  const title = buildFloorPlanCommercialBriefTitle(plan, floorPlanId);
  const existingBrief = await prisma.designBrief.findFirst({
    where: {
      OR: [
        { title },
        { requirements: { contains: buildFloorPlanCommercialRequirementsRef(floorPlanId) } },
      ],
    },
    include: {
      concepts: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const brief =
    existingBrief ??
    (await prisma.designBrief.create({
      data: buildFloorPlanCommercialBriefData(plan, floorPlanId),
    }));

  const existingConcept = existingBrief?.concepts[0] ?? null;
  const concept =
    existingConcept ??
    (await prisma.designConcept.create({
      data: {
        designBriefId: brief.id,
        ...buildMockDesignConcept({
          clientName: normalizeClientName(plan.clientName, plan.projectName),
          propertyType: plan.propertyType,
          preferredStyle: inferPreferredStyle(plan),
          aiSummary: plan.summary,
        }),
      },
    }));

  if (!existingConcept) {
    await prisma.designBrief.update({
      where: { id: brief.id },
      data: { status: DesignBriefStatus.QS_IN_PROGRESS },
    });
  }

  return {
    briefId: brief.id,
    conceptId: concept.id,
  };
}

async function resolveFloorPlanRecord(floorPlanId: string): Promise<FloorPlanRecord> {
  const mockPlan = getMockFloorPlanById(floorPlanId);
  if (mockPlan) return mockPlan;

  const persisted = await getPersistedFloorPlanSnapshot(floorPlanId);
  if (persisted) return persisted.plan;

  throw new Error("Floor plan not found.");
}

function buildFloorPlanCommercialBriefData(
  plan: FloorPlanRecord,
  floorPlanId: string,
) {
  const clientName = normalizeClientName(plan.clientName, plan.projectName);
  const rooms = plan.roomDetections
    .map((room) => `${room.name} (${room.type})`)
    .join(", ");
  const projectScope = [
    `Generated from floor plan pipeline for ${plan.projectName}.`,
    `Site: ${plan.siteLabel}.`,
    `Source file: ${plan.sourceFileName}.`,
    `Floor area: ${plan.floorArea}.`,
    rooms ? `Detected rooms: ${rooms}.` : null,
    plan.carpentryNotes.length > 0
      ? `Key carpentry notes: ${plan.carpentryNotes
          .slice(0, 4)
          .map((note) => `${note.zone} - ${note.title}`)
          .join("; ")}.`
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return {
    title: buildFloorPlanCommercialBriefTitle(plan, floorPlanId),
    clientNeeds: projectScope,
    propertyType: mapFloorPlanPropertyType(plan.propertyType),
    status: DesignBriefStatus.QS_IN_PROGRESS,
    clientName,
    propertyAddress: plan.siteLabel,
    floorArea: plan.floorArea,
    rooms: rooms || null,
    preferredStyle: inferPreferredStyle(plan),
    requirements: `${projectScope}\n${buildFloorPlanCommercialRequirementsRef(floorPlanId)}`,
    aiSummary: plan.summary,
    aiRecommendedStyle: inferPreferredStyle(plan),
    aiBudgetRisk: "Pending commercial validation after BOQ generation.",
    aiNextAction:
      "Generate a design BOQ from the linked floor plan brief, then convert the approved BOQ into quotation and proposal modules.",
  };
}

function normalizeClientName(clientName: string, projectName: string) {
  const trimmed = clientName.trim();
  if (!trimmed || /^client\b/i.test(trimmed) || /pending/i.test(trimmed)) {
    return projectName.trim() || "Floor Plan Client";
  }

  return trimmed;
}

function inferPreferredStyle(plan: FloorPlanRecord) {
  return plan.propertyType.toLowerCase().includes("commercial")
    ? "Contemporary Workplace"
    : "Contemporary Luxe";
}

function mapFloorPlanPropertyType(propertyType: string): PropertyType {
  const normalized = propertyType.trim().toLowerCase();

  if (normalized.includes("hdb")) return PropertyType.HDB;
  if (
    normalized.includes("condo") ||
    normalized.includes("condominium") ||
    normalized.includes("penthouse")
  ) {
    return PropertyType.CONDO;
  }
  if (normalized.includes("landed")) return PropertyType.LANDED;
  if (normalized.includes("commercial")) return PropertyType.COMMERCIAL;

  return PropertyType.OTHER;
}
