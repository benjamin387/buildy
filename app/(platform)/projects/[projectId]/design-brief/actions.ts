"use server";

import { z } from "zod";
import {
  ClientPresentationStatus,
  DesignBriefStatus,
  DesignRole,
  DesignStyle,
  DesignTaskStatus,
  Permission,
  Prisma,
  PropertyType,
  RoomType,
  VisualGenerationStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { auditLog, createRevision } from "@/lib/audit";
import { toRevisionJson } from "@/lib/audit/serialize";
import { generateFurnitureLayout } from "@/lib/ai/layout-generator";
import {
  addDesignArea,
  addDesignTask,
  addFfeProposal,
  addLayoutPlan,
  addVisualRender,
  createDesignBrief,
  deleteFfeProposal,
  deleteQsBoqDraftItem,
  saveQsBoqDraftItems,
  updateDesignArea,
  updateDesignBriefStatus,
  updateDesignTask,
  upsertPresentation,
} from "@/lib/design-workflow/service";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";
import { recomputeQuotationDerivedTotals } from "@/lib/quotations/service";
import { buildInteriorVisualPrompt, generateInteriorVisual } from "@/lib/ai/visual-generator";
import { generateBOQFromDesign, generateDesignConcept } from "@/lib/ai/design-assistant";
import { optimizeDesignBudget } from "@/lib/ai/budget-optimizer";
import { applyPresentationNarrative } from "@/lib/ai/presentation-generator";
import { computeQsDerived, toDecimalCurrency, toDecimalPct } from "@/lib/design-workflow/qs-math";
import { runDesignToSalesPipeline } from "@/lib/pipeline/design-to-sales";
import crypto from "node:crypto";

function toDateOrNull(value: string): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function clampMeters(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

const createBriefSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(140),
  clientNeeds: z.string().min(1),
  designStyle: z.string().optional().or(z.literal("")).default(""),
  propertyType: z.enum(["HDB", "CONDO", "LANDED", "COMMERCIAL", "OTHER"]),
});

export async function createDesignBriefAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const parsed = createBriefSchema.safeParse({
    projectId,
    title: formData.get("title"),
    clientNeeds: formData.get("clientNeeds"),
    designStyle: formData.get("designStyle"),
    propertyType: formData.get("propertyType"),
  });
  if (!parsed.success) throw new Error("Invalid design brief.");

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found.");

  const lead = await prisma.lead.findFirst({
    where: { convertedProjectId: parsed.data.projectId },
    orderBy: [{ convertedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, preferredDesignStyle: true },
  });

  const brief = await createDesignBrief({
    leadId: lead?.id ?? null,
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    clientNeeds: parsed.data.clientNeeds,
    designStyle: parsed.data.designStyle
      ? (parsed.data.designStyle as DesignStyle)
      : (lead?.preferredDesignStyle ?? null),
    propertyType: parsed.data.propertyType as PropertyType,
    status: "DRAFT",
  });

  await auditLog({
    module: "design_workflow",
    action: "create_brief",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignBrief",
    entityId: brief.id,
    metadata: { title: brief.title, status: brief.status },
  });
  await createRevision({
    entityType: "DesignBrief",
    entityId: brief.id,
    projectId: parsed.data.projectId,
    actorUserId: userId,
    note: "Design brief created",
    data: toRevisionJson(brief),
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${brief.id}`);
}

const updateBriefStatusSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  status: z.nativeEnum(DesignBriefStatus),
});

function isAllowedBriefTransition(from: DesignBriefStatus, to: DesignBriefStatus): boolean {
  if (from === to) return true;
  const allowed: Record<DesignBriefStatus, DesignBriefStatus[]> = {
    DRAFT: ["DESIGN_IN_PROGRESS", "REJECTED"],
    DESIGN_IN_PROGRESS: ["QS_IN_PROGRESS", "READY_FOR_QUOTATION", "REJECTED"],
    QS_IN_PROGRESS: ["PRESENTATION_READY", "READY_FOR_QUOTATION", "REJECTED"],
    READY_FOR_QUOTATION: ["SALES_PACKAGE_READY", "REJECTED"],
    SALES_PACKAGE_READY: ["SENT_TO_CLIENT", "APPROVED", "REJECTED"],
    PRESENTATION_READY: ["SALES_PACKAGE_READY", "SENT_TO_CLIENT", "REJECTED"],
    SENT_TO_CLIENT: ["APPROVED", "REJECTED"],
    APPROVED: [],
    REJECTED: ["DESIGN_IN_PROGRESS"],
  };
  return allowed[from]?.includes(to) ?? false;
}

export async function updateDesignBriefStatusAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateBriefStatusSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const brief = await prisma.designBrief.findUnique({
    where: { id: parsed.data.briefId },
    select: { id: true, projectId: true, status: true },
  });
  if (!brief || brief.projectId !== parsed.data.projectId) throw new Error("Not found.");
  if (!isAllowedBriefTransition(brief.status, parsed.data.status)) {
    throw new Error(`Invalid status transition: ${brief.status} -> ${parsed.data.status}`);
  }

  const updated = await updateDesignBriefStatus({ briefId: brief.id, status: parsed.data.status });

  await auditLog({
    module: "design_workflow",
    action: "update_brief_status",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignBrief",
    entityId: updated.id,
    metadata: { from: brief.status, to: updated.status },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${updated.id}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${updated.id}`);
}

const addTaskSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  role: z.nativeEnum(DesignRole),
  title: z.string().min(1).max(140),
  description: z.string().optional().or(z.literal("")).default(""),
  assignedTo: z.string().optional().or(z.literal("")).default(""),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function addDesignTaskAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = addTaskSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    role: formData.get("role"),
    title: formData.get("title"),
    description: formData.get("description"),
    assignedTo: formData.get("assignedTo"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid task.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const brief = await prisma.designBrief.findUnique({
    where: { id: parsed.data.briefId },
    select: { id: true, projectId: true },
  });
  if (!brief || brief.projectId !== parsed.data.projectId) throw new Error("Not found.");

  const created = await addDesignTask({
    designBriefId: parsed.data.briefId,
    role: parsed.data.role,
    title: parsed.data.title,
    description: parsed.data.description || null,
    assignedTo: parsed.data.assignedTo || null,
    dueDate: parsed.data.dueDate ? toDateOrNull(parsed.data.dueDate) : null,
    notes: parsed.data.notes || null,
  });

  await auditLog({
    module: "design_workflow",
    action: "add_task",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignTask",
    entityId: created.id,
    metadata: { role: created.role, title: created.title },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}`);
}

const updateTaskSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  taskId: z.string().min(1),
  status: z.nativeEnum(DesignTaskStatus),
  assignedTo: z.string().optional().or(z.literal("")).default(""),
  dueDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

function isAllowedTaskTransition(from: DesignTaskStatus, to: DesignTaskStatus): boolean {
  if (from === to) return true;
  const allowed: Record<DesignTaskStatus, DesignTaskStatus[]> = {
    TODO: ["IN_PROGRESS", "BLOCKED"],
    IN_PROGRESS: ["REVIEW", "COMPLETED", "BLOCKED"],
    REVIEW: ["IN_PROGRESS", "COMPLETED", "BLOCKED"],
    BLOCKED: ["TODO", "IN_PROGRESS"],
    COMPLETED: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export async function updateDesignTaskAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateTaskSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    taskId: formData.get("taskId"),
    status: formData.get("status"),
    assignedTo: formData.get("assignedTo"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const existing = await prisma.designTask.findUnique({
    where: { id: parsed.data.taskId },
    include: { designBrief: { select: { id: true, projectId: true } } },
  });
  if (!existing || existing.designBrief.id !== parsed.data.briefId || existing.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }
  if (!isAllowedTaskTransition(existing.status, parsed.data.status)) {
    throw new Error(`Invalid task transition: ${existing.status} -> ${parsed.data.status}`);
  }

  const updated = await updateDesignTask({
    taskId: existing.id,
    status: parsed.data.status,
    assignedTo: parsed.data.assignedTo || null,
    dueDate: parsed.data.dueDate ? toDateOrNull(parsed.data.dueDate) : null,
    notes: parsed.data.notes || null,
  });

  await auditLog({
    module: "design_workflow",
    action: "update_task",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignTask",
    entityId: updated.id,
    metadata: { status: updated.status },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}`);
}

const addAreaSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  name: z.string().min(1).max(140),
  roomType: z.nativeEnum(RoomType),
  clientRequirement: z.string().optional().or(z.literal("")).default(""),
});

export async function addDesignAreaAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = addAreaSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    name: formData.get("name"),
    roomType: formData.get("roomType"),
    clientRequirement: formData.get("clientRequirement"),
  });
  if (!parsed.success) throw new Error("Invalid area.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const created = await addDesignArea({
    designBriefId: parsed.data.briefId,
    name: parsed.data.name,
    roomType: parsed.data.roomType,
    clientRequirement: parsed.data.clientRequirement || null,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${created.id}`);
}

const updateAreaSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  areaId: z.string().min(1),
  name: z.string().min(1).max(140),
  roomType: z.nativeEnum(RoomType),
  clientRequirement: z.string().optional().or(z.literal("")).default(""),
  proposedLayoutNotes: z.string().optional().or(z.literal("")).default(""),
  proposedMaterials: z.string().optional().or(z.literal("")).default(""),
  proposedTheme: z.string().optional().or(z.literal("")).default(""),
});

export async function updateDesignAreaAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = updateAreaSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    areaId: formData.get("areaId"),
    name: formData.get("name"),
    roomType: formData.get("roomType"),
    clientRequirement: formData.get("clientRequirement"),
    proposedLayoutNotes: formData.get("proposedLayoutNotes"),
    proposedMaterials: formData.get("proposedMaterials"),
    proposedTheme: formData.get("proposedTheme"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  const area = await prisma.designArea.findUnique({
    where: { id: parsed.data.areaId },
    include: { designBrief: { select: { id: true, projectId: true } } },
  });
  if (!area || area.designBrief.id !== parsed.data.briefId || area.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  await updateDesignArea({
    areaId: area.id,
    name: parsed.data.name,
    roomType: parsed.data.roomType,
    clientRequirement: parsed.data.clientRequirement || null,
    proposedLayoutNotes: parsed.data.proposedLayoutNotes || null,
    proposedMaterials: parsed.data.proposedMaterials || null,
    proposedTheme: parsed.data.proposedTheme || null,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

const addPlanSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  areaId: z.string().min(1),
  title: z.string().min(1).max(140),
  description: z.string().optional().or(z.literal("")).default(""),
  fileUrl: z.string().optional().or(z.literal("")).default(""),
  generatedNotes: z.string().optional().or(z.literal("")).default(""),
});

export async function addLayoutPlanAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = addPlanSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    areaId: formData.get("areaId"),
    title: formData.get("title"),
    description: formData.get("description"),
    fileUrl: formData.get("fileUrl"),
    generatedNotes: formData.get("generatedNotes"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  await addLayoutPlan({
    designAreaId: parsed.data.areaId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    fileUrl: parsed.data.fileUrl || null,
    generatedNotes: parsed.data.generatedNotes || null,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

export async function generateLayoutPlanAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      title: z.string().min(1).max(140),
      roomWidth: z.coerce.number().min(0).max(100),
      roomLength: z.coerce.number().min(0).max(100),
      doorPosition: z.string().optional().or(z.literal("")).default(""),
      windowPosition: z.string().optional().or(z.literal("")).default(""),
      autoSelect: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      title: formData.get("title"),
      roomWidth: formData.get("roomWidth"),
      roomLength: formData.get("roomLength"),
      doorPosition: formData.get("doorPosition"),
      windowPosition: formData.get("windowPosition"),
      autoSelect: formData.get("autoSelect"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const area = await prisma.designArea.findUnique({
    where: { id: parsed.data.areaId },
    include: {
      designBrief: {
        select: {
          id: true,
          projectId: true,
          clientNeeds: true,
          propertyType: true,
          designStyle: true,
        },
      },
    },
  });
  if (!area || area.designBrief.id !== parsed.data.briefId || area.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  const layout = await generateFurnitureLayout({
    propertyType: area.designBrief.propertyType,
    roomType: area.roomType,
    roomWidth: clampMeters(parsed.data.roomWidth),
    roomLength: clampMeters(parsed.data.roomLength),
    doorPosition: parsed.data.doorPosition || "Not specified",
    windowPosition: parsed.data.windowPosition || "Not specified",
    clientNeeds: [area.designBrief.clientNeeds, area.clientRequirement ?? ""].filter(Boolean).join("\n\n"),
    designStyle: area.designBrief.designStyle ?? null,
  });

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    if (parsed.data.autoSelect === "on") {
      await tx.generatedLayoutPlan.updateMany({
        where: { designAreaId: area.id },
        data: { isSelected: false },
      });
    }

    return tx.generatedLayoutPlan.create({
      data: {
        designAreaId: area.id,
        title: parsed.data.title,
        roomWidth: new Prisma.Decimal(clampMeters(parsed.data.roomWidth)),
        roomLength: new Prisma.Decimal(clampMeters(parsed.data.roomLength)),
        doorPosition: parsed.data.doorPosition || null,
        windowPosition: parsed.data.windowPosition || null,
        layoutSummary: layout.layoutSummary,
        furniturePlacementPlan: layout.furniturePlacementPlan,
        circulationNotes: layout.circulationNotes,
        constraints: layout.constraints,
        promptFor3DVisual: layout.promptFor3DVisual,
        isSelected: parsed.data.autoSelect === "on",
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });
  });

  await auditLog({
    module: "design_workflow",
    action: "generate_layout_plan",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignArea",
    entityId: area.id,
    metadata: { generatedLayoutPlanId: created.id },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}#ai-layout`);
}

export async function selectGeneratedLayoutPlanAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      layoutPlanId: z.string().min(1),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      layoutPlanId: formData.get("layoutPlanId"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const plan = await prisma.generatedLayoutPlan.findUnique({
    where: { id: parsed.data.layoutPlanId },
    include: {
      designArea: {
        include: { designBrief: { select: { id: true, projectId: true } } },
      },
    },
  });
  if (!plan || plan.designAreaId !== parsed.data.areaId) throw new Error("Not found.");
  if (plan.designArea.designBrief.id !== parsed.data.briefId || plan.designArea.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.generatedLayoutPlan.updateMany({
      where: { designAreaId: plan.designAreaId },
      data: { isSelected: false },
    });
    await tx.generatedLayoutPlan.update({
      where: { id: plan.id },
      data: { isSelected: true },
    });
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}#ai-layout`);
}

export async function addVisualRenderAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      title: z.string().min(1).max(140),
      theme: z.string().optional().or(z.literal("")).default(""),
      materialNotes: z.string().optional().or(z.literal("")).default(""),
      fileUrl: z.string().optional().or(z.literal("")).default(""),
      generatedPrompt: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      title: formData.get("title"),
      theme: formData.get("theme"),
      materialNotes: formData.get("materialNotes"),
      fileUrl: formData.get("fileUrl"),
      generatedPrompt: formData.get("generatedPrompt"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  await addVisualRender({
    designAreaId: parsed.data.areaId,
    title: parsed.data.title,
    theme: parsed.data.theme || null,
    materialNotes: parsed.data.materialNotes || null,
    fileUrl: parsed.data.fileUrl || null,
    generatedPrompt: parsed.data.generatedPrompt || null,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

export async function generateVisualRenderAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      title: z.string().optional().or(z.literal("")).default(""),
      promptOverride: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      title: formData.get("title"),
      promptOverride: formData.get("promptOverride"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const area = await prisma.designArea.findUnique({
    where: { id: parsed.data.areaId },
    include: { designBrief: { select: { id: true, projectId: true, designStyle: true } } },
  });
  if (!area || area.designBrief.id !== parsed.data.briefId || area.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  const promptText = buildInteriorVisualPrompt({
    roomType: area.roomType,
    layoutNotes: area.proposedLayoutNotes ?? null,
    materials: area.proposedMaterials ?? null,
    designStyle: area.designBrief.designStyle ?? null,
    promptOverride: parsed.data.promptOverride || null,
  });

  const existingCount = await prisma.visualRender.count({ where: { designAreaId: area.id } });
  const title = parsed.data.title?.trim()
    ? parsed.data.title.trim()
    : `AI Render v${existingCount + 1}`;

  const created = await prisma.visualRender.create({
    data: {
      designAreaId: area.id,
      title,
      theme: area.proposedTheme ?? null,
      materialNotes: area.proposedMaterials ?? null,
      generatedPrompt: promptText,
      promptText,
      generationStatus: VisualGenerationStatus.PROCESSING,
      errorMessage: null,
    },
  });

  try {
    const result = await generateInteriorVisual({
      roomType: area.roomType,
      layoutNotes: area.proposedLayoutNotes ?? null,
      materials: area.proposedMaterials ?? null,
      designStyle: area.designBrief.designStyle ?? null,
      promptOverride: promptText,
    });

    await prisma.visualRender.update({
      where: { id: created.id },
      data: {
        promptText: result.promptText,
        generatedPrompt: result.promptText,
        generatedImageUrl: result.generatedImageUrl,
        fileUrl: result.generatedImageUrl,
        generationStatus: VisualGenerationStatus.COMPLETED,
        errorMessage: null,
      },
    });

    await auditLog({
      module: "design_workflow",
      action: "generate_visual",
      actorUserId: userId,
      projectId: parsed.data.projectId,
      entityType: "VisualRender",
      entityId: created.id,
      metadata: { areaId: area.id, roomType: area.roomType, status: "COMPLETED" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await prisma.visualRender.update({
      where: { id: created.id },
      data: {
        generationStatus: VisualGenerationStatus.FAILED,
        errorMessage: message,
      },
    });

    await auditLog({
      module: "design_workflow",
      action: "generate_visual_failed",
      actorUserId: userId,
      projectId: parsed.data.projectId,
      entityType: "VisualRender",
      entityId: created.id,
      metadata: { areaId: area.id, roomType: area.roomType, error: message },
    });
  }

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}#renders`);
}

export async function generateDesignOptionsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      alsoGenerateBoq: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      alsoGenerateBoq: formData.get("alsoGenerateBoq"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const area = await prisma.designArea.findUnique({
    where: { id: parsed.data.areaId },
    include: {
      designBrief: {
        select: { id: true, projectId: true, clientNeeds: true, propertyType: true, designStyle: true },
      },
    },
  });
  if (!area || area.designBrief.id !== parsed.data.briefId || area.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  const latestSiteVisit = await prisma.siteVisit.findFirst({
    where: { projectId: parsed.data.projectId },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    include: { budgetRange: true },
  });

  const concept = await generateDesignConcept({
    propertyType: area.designBrief.propertyType,
    roomType: area.roomType,
    designStyle: area.designBrief.designStyle ?? null,
    budgetRange: latestSiteVisit?.budgetRange
      ? { min: latestSiteVisit.budgetRange.minAmount ? Number(latestSiteVisit.budgetRange.minAmount) : null, max: latestSiteVisit.budgetRange.maxAmount ? Number(latestSiteVisit.budgetRange.maxAmount) : null, currency: latestSiteVisit.budgetRange.currency }
      : null,
    clientNeeds: `${area.designBrief.clientNeeds}\n\nArea requirement: ${area.clientRequirement ?? "-"}`,
  });

  await prisma.designArea.update({
    where: { id: area.id },
    data: {
      aiLayoutSuggestion: concept.layoutSuggestionText,
      aiMaterialSuggestion: concept.materialSuggestion,
      aiFurnitureSuggestion: concept.furnitureSuggestion,
      aiLightingSuggestion: concept.lightingSuggestion,
      aiSuggestionGeneratedAt: new Date(),
    },
  });

  const optionSetId = crypto.randomUUID();

  // Pre-create placeholders so UI shows PROCESSING immediately even if generation takes time.
  const placeholders = await prisma.$transaction(async (tx) => {
    const basePrompt = buildInteriorVisualPrompt({
      roomType: area.roomType,
      layoutNotes: area.proposedLayoutNotes ?? concept.layoutSuggestionText,
      materials: area.proposedMaterials ?? concept.materialSuggestion,
      designStyle: area.designBrief.designStyle ?? null,
    });

    const opts: Array<"A" | "B" | "C"> = ["A", "B", "C"];
    const created: Array<{ id: string; option: "A" | "B" | "C"; promptText: string }> = [];

    for (const opt of opts) {
      const promptText = `${basePrompt}, ${opt === "A" ? "Option A: warm neutral palette, airy daylight" : opt === "B" ? "Option B: cool neutral palette, cozy evening ambient" : "Option C: bold accent palette, premium dramatic lighting"}`;
      const row = await tx.visualRender.create({
        data: {
          designAreaId: area.id,
          title: `Design Option ${opt}`,
          theme: area.proposedTheme ?? null,
          materialNotes: area.proposedMaterials ?? null,
          promptText,
          generatedPrompt: promptText,
          optionSetId,
          optionLabel: opt,
          generationStatus: VisualGenerationStatus.PROCESSING,
          errorMessage: null,
        },
        select: { id: true },
      });
      created.push({ id: row.id, option: opt, promptText });
    }
    return created;
  });

  // Generate variations (sequential; keeps it stable under rate limits).
  for (const p of placeholders) {
    try {
      const result = await generateInteriorVisual({
        roomType: area.roomType,
        layoutNotes: area.proposedLayoutNotes ?? concept.layoutSuggestionText,
        materials: area.proposedMaterials ?? concept.materialSuggestion,
        designStyle: area.designBrief.designStyle ?? null,
        promptOverride: p.promptText,
      });

      await prisma.visualRender.update({
        where: { id: p.id },
        data: {
          promptText: result.promptText,
          generatedPrompt: result.promptText,
          generatedImageUrl: result.generatedImageUrl,
          fileUrl: result.generatedImageUrl,
          generationStatus: VisualGenerationStatus.COMPLETED,
          errorMessage: null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      await prisma.visualRender.update({
        where: { id: p.id },
        data: { generationStatus: VisualGenerationStatus.FAILED, errorMessage: msg },
      });
    }
  }

  if (parsed.data.alsoGenerateBoq === "on") {
    const boq = await generateBOQFromDesign({
      roomType: area.roomType,
      designStyle: area.designBrief.designStyle ?? null,
      layoutSuggestionText: concept.layoutSuggestionText,
      materialSuggestion: concept.materialSuggestion,
      clientNeeds: area.designBrief.clientNeeds,
    });

    const existingCount = await prisma.qSBoqDraftItem.count({ where: { designAreaId: area.id } });
    const now = new Date();
    await prisma.qSBoqDraftItem.createMany({
      data: boq.items.map((it, idx) => ({
        designAreaId: area.id,
        quotationItemId: null,
        description: it.description,
        unit: it.unit,
        quantity: new Prisma.Decimal(it.quantity),
        recommendedSellingUnitPrice: new Prisma.Decimal(it.recommendedSellingUnitPrice),
        estimatedCostUnitPrice: new Prisma.Decimal(it.estimatedCostUnitPrice),
        sellingTotal: new Prisma.Decimal(0),
        costTotal: new Prisma.Decimal(0),
        profit: new Prisma.Decimal(0),
        marginPercent: new Prisma.Decimal(0),
        isEditable: true,
        sortOrder: existingCount + idx + 1,
        createdAt: now,
        updatedAt: now,
      })),
    });
  }

  await auditLog({
    module: "design_workflow",
    action: "generate_design_options",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignArea",
    entityId: area.id,
    metadata: { optionSetId, roomType: area.roomType },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}#options`);
}

export async function selectDesignOptionAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      visualRenderId: z.string().min(1),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      visualRenderId: formData.get("visualRenderId"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const render = await prisma.visualRender.findUnique({
    where: { id: parsed.data.visualRenderId },
    include: { designArea: { include: { designBrief: { select: { id: true, projectId: true } } } } },
  });
  if (!render || render.designAreaId !== parsed.data.areaId) throw new Error("Not found.");
  if (render.designArea.designBrief.id !== parsed.data.briefId || render.designArea.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  const optionSetId = render.optionSetId;
  if (!optionSetId) throw new Error("This render is not part of an option set.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.visualRender.updateMany({
      where: { designAreaId: render.designAreaId, optionSetId },
      data: { isSelected: false, selectedAt: null },
    });
    await tx.visualRender.update({
      where: { id: render.id },
      data: { isSelected: true, selectedAt: now, isRejected: false, rejectedAt: null },
    });
    await tx.visualRender.updateMany({
      where: { designAreaId: render.designAreaId, optionSetId, id: { not: render.id } },
      data: { isRejected: true, rejectedAt: now },
    });
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}#options`);
}

export async function regenerateDesignOptionAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      sourceRenderId: z.string().min(1),
      promptOverride: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      sourceRenderId: formData.get("sourceRenderId"),
      promptOverride: formData.get("promptOverride"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const source = await prisma.visualRender.findUnique({
    where: { id: parsed.data.sourceRenderId },
    include: {
      designArea: { include: { designBrief: { select: { id: true, projectId: true, designStyle: true } } } },
    },
  });
  if (!source || source.designAreaId !== parsed.data.areaId) throw new Error("Not found.");
  if (source.designArea.designBrief.id !== parsed.data.briefId || source.designArea.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }
  if (!source.optionSetId || !source.optionLabel) throw new Error("Source is not part of an option set.");

  // Mark the source as rejected and create a new render for the same option label in the same set.
  const now = new Date();
  await prisma.visualRender.update({
    where: { id: source.id },
    data: { isRejected: true, rejectedAt: now, isSelected: false, selectedAt: null },
  });

  const promptText = (parsed.data.promptOverride || source.promptText || source.generatedPrompt || "").trim();
  if (!promptText) throw new Error("Prompt is required.");

  const created = await prisma.visualRender.create({
    data: {
      designAreaId: source.designAreaId,
      title: source.title,
      theme: source.theme,
      materialNotes: source.materialNotes,
      promptText,
      generatedPrompt: promptText,
      optionSetId: source.optionSetId,
      optionLabel: source.optionLabel,
      generationStatus: VisualGenerationStatus.PROCESSING,
      errorMessage: null,
    },
  });

  try {
    const result = await generateInteriorVisual({
      roomType: source.designArea.roomType,
      layoutNotes: source.designArea.proposedLayoutNotes ?? null,
      materials: source.designArea.proposedMaterials ?? null,
      designStyle: source.designArea.designBrief.designStyle ?? null,
      promptOverride: promptText,
    });

    await prisma.visualRender.update({
      where: { id: created.id },
      data: {
        promptText: result.promptText,
        generatedPrompt: result.promptText,
        generatedImageUrl: result.generatedImageUrl,
        fileUrl: result.generatedImageUrl,
        generationStatus: VisualGenerationStatus.COMPLETED,
        errorMessage: null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    await prisma.visualRender.update({
      where: { id: created.id },
      data: { generationStatus: VisualGenerationStatus.FAILED, errorMessage: msg },
    });
  }

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}#options`);
}

export async function addFfeProposalAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      title: z.string().min(1).max(140),
      description: z.string().optional().or(z.literal("")).default(""),
      supplierName: z.string().optional().or(z.literal("")).default(""),
      purchaseUrl: z.string().optional().or(z.literal("")).default(""),
      unitPrice: z.coerce.number().optional().default(0),
      quantity: z.coerce.number().optional().default(0),
      leadTimeDays: z.coerce.number().optional().default(NaN),
      availabilityStatus: z.string().optional().or(z.literal("")).default(""),
      remarks: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      title: formData.get("title"),
      description: formData.get("description"),
      supplierName: formData.get("supplierName"),
      purchaseUrl: formData.get("purchaseUrl"),
      unitPrice: formData.get("unitPrice"),
      quantity: formData.get("quantity"),
      leadTimeDays: formData.get("leadTimeDays"),
      availabilityStatus: formData.get("availabilityStatus"),
      remarks: formData.get("remarks"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  await addFfeProposal({
    designAreaId: parsed.data.areaId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    supplierName: parsed.data.supplierName || null,
    purchaseUrl: parsed.data.purchaseUrl || null,
    unitPrice: clampNonNegative(parsed.data.unitPrice),
    quantity: clampNonNegative(parsed.data.quantity),
    leadTimeDays: Number.isFinite(parsed.data.leadTimeDays) ? Math.max(0, Math.floor(parsed.data.leadTimeDays)) : null,
    availabilityStatus: parsed.data.availabilityStatus || null,
    remarks: parsed.data.remarks || null,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

export async function deleteFfeProposalAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      ffeId: z.string().min(1),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      ffeId: formData.get("ffeId"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });
  await deleteFfeProposal(parsed.data.ffeId);

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

const saveQsSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  areaId: z.string().min(1),
  rowsJson: z.string().min(2),
});

export async function saveQsBoqDraftItemsAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = saveQsSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    areaId: formData.get("areaId"),
    rowsJson: formData.get("rowsJson"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const rows = JSON.parse(parsed.data.rowsJson) as unknown;
  const rowSchema = z.array(
    z.object({
      id: z.string().optional().nullable(),
      description: z.string(),
      unit: z.string(),
      quantity: z.number(),
      recommendedSellingUnitPrice: z.number(),
      estimatedCostUnitPrice: z.number(),
      isEditable: z.boolean(),
      sortOrder: z.number(),
    }),
  );
  const safeRows = rowSchema.parse(rows);

  await saveQsBoqDraftItems({ designAreaId: parsed.data.areaId, rows: safeRows });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

export async function deleteQsBoqDraftItemAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      areaId: z.string().min(1),
      itemId: z.string().min(1),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      areaId: formData.get("areaId"),
      itemId: formData.get("itemId"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });
  await deleteQsBoqDraftItem(parsed.data.itemId);

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas/${parsed.data.areaId}`);
}

const pushQsSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  areaId: z.string().min(1),
  selectedIdsJson: z.string().min(2),
});

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

  await tx.quotation.updateMany({
    where: { projectId, isLatest: true },
    data: { isLatest: false },
  });

  const latest = await tx.quotation.findFirst({
    where: { projectId },
    select: { quotationNumber: true, version: true },
    orderBy: { createdAt: "desc" },
  });

  const issueDate = new Date();
  const quotation = await tx.quotation.create({
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
      unitSizeSqft: project.unitSizeSqft ?? null,
      subtotal: new Prisma.Decimal(0),
      discountAmount: new Prisma.Decimal(0),
      gstAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(0),
      estimatedCost: new Prisma.Decimal(0),
      profitAmount: new Prisma.Decimal(0),
      marginPercent: new Prisma.Decimal(0),
      notes: "Draft created from Design Workflow QS push.",
      internalNotes: null,
    },
  });

  return quotation;
}

export async function pushQsToQuotationAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = pushQsSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    areaId: formData.get("areaId"),
    selectedIdsJson: formData.get("selectedIdsJson"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const selectedIds = JSON.parse(parsed.data.selectedIdsJson) as unknown;
  const ids = z.array(z.string().min(1)).parse(selectedIds);
  if (ids.length === 0) throw new Error("Select at least one QS item to push.");

  const area = await prisma.designArea.findUnique({
    where: { id: parsed.data.areaId },
    include: {
      designBrief: { select: { id: true, projectId: true } },
      qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!area || area.designBrief.id !== parsed.data.briefId || area.designBrief.projectId !== parsed.data.projectId) {
    throw new Error("Not found.");
  }

  const rows = area.qsBoqDraftItems.filter((r) => ids.includes(r.id) && !r.quotationItemId);
  if (rows.length === 0) throw new Error("No selectable QS items found (already pushed or missing).");

  const result = await prisma.$transaction(async (tx) => {
    const quotation = await ensureDraftQuotation(tx, parsed.data.projectId);

    const sectionRemarks = `DesignBrief ${area.designBriefId} / DesignArea ${area.id}`;
    const existingSection = await tx.quotationSection.findFirst({
      where: {
        quotationId: quotation.id,
        title: area.name,
        remarks: sectionRemarks,
      },
    });

    const section =
      existingSection ??
      (await tx.quotationSection.create({
        data: {
          quotationId: quotation.id,
          category: "OTHER",
          title: area.name,
          description: `Pushed from Design Workflow (Area: ${area.roomType})`,
          isIncluded: true,
          isOptional: false,
          remarks: sectionRemarks,
          sortOrder: await tx.quotationSection.count({ where: { quotationId: quotation.id } }),
          subtotal: new Prisma.Decimal(0),
        },
      }));

    const existingItemCount = await tx.quotationItem.count({ where: { quotationSectionId: section.id } });

    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const createdItem = await tx.quotationItem.create({
        data: {
          quotationSectionId: section.id,
          itemType: "SUPPLY_AND_INSTALL",
          sku: "",
          itemMasterId: null,
          description: r.description,
          specification: null,
          unit: r.unit,
          unitOfMeasureId: null,
          quantity: r.quantity,
          unitPrice: r.recommendedSellingUnitPrice, // QS sell unit
          costPrice: r.estimatedCostUnitPrice, // QS cost unit
          totalPrice: r.sellingTotal,
          totalCost: r.costTotal,
          profit: r.profit,
          marginPercent: r.marginPercent,
          remarks: "From QS BOQ Draft",
          isIncluded: true,
          isOptional: false,
          sortOrder: existingItemCount + i,
        },
      });

      await tx.qSBoqDraftItem.update({
        where: { id: r.id },
        data: { quotationItemId: createdItem.id },
      });
    }

    await recomputeQuotationDerivedTotals({ quotationId: quotation.id, tx });

    return { quotationId: quotation.id };
  });

  await auditLog({
    module: "design_workflow",
    action: "push_qs_to_quotation",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignArea",
    entityId: area.id,
    metadata: { briefId: parsed.data.briefId, pushedCount: rows.length, quotationId: result.quotationId },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/quotations`);
  redirect(`/projects/${parsed.data.projectId}/quotations/${result.quotationId}/edit`);
}

const upsertPresentationSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  title: z.string().min(1).max(140),
  addressedTo: z.string().min(1).max(140),
  presentationDate: z.string().optional().or(z.literal("")).default(""),
  introductionText: z.string().optional().or(z.literal("")).default(""),
  roomNarrativeText: z.string().optional().or(z.literal("")).default(""),
  materialExplanationText: z.string().optional().or(z.literal("")).default(""),
  budgetExplanationText: z.string().optional().or(z.literal("")).default(""),
  upsellPitchText: z.string().optional().or(z.literal("")).default(""),
  teamIntroduction: z.string().optional().or(z.literal("")).default(""),
  companyPortfolioText: z.string().optional().or(z.literal("")).default(""),
  whyChooseUsText: z.string().optional().or(z.literal("")).default(""),
  nextStepsText: z.string().optional().or(z.literal("")).default(""),
  fileUrl: z.string().optional().or(z.literal("")).default(""),
  status: z.nativeEnum(ClientPresentationStatus),
});

export async function upsertPresentationAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = upsertPresentationSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    title: formData.get("title"),
    addressedTo: formData.get("addressedTo"),
    presentationDate: formData.get("presentationDate"),
    introductionText: formData.get("introductionText"),
    roomNarrativeText: formData.get("roomNarrativeText"),
    materialExplanationText: formData.get("materialExplanationText"),
    budgetExplanationText: formData.get("budgetExplanationText"),
    upsellPitchText: formData.get("upsellPitchText"),
    teamIntroduction: formData.get("teamIntroduction"),
    companyPortfolioText: formData.get("companyPortfolioText"),
    whyChooseUsText: formData.get("whyChooseUsText"),
    nextStepsText: formData.get("nextStepsText"),
    fileUrl: formData.get("fileUrl"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid presentation.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  await upsertPresentation({
    designBriefId: parsed.data.briefId,
    title: parsed.data.title,
    addressedTo: parsed.data.addressedTo,
    presentationDate: parsed.data.presentationDate || null,
    introductionText: parsed.data.introductionText || null,
    roomNarrativeText: parsed.data.roomNarrativeText || null,
    materialExplanationText: parsed.data.materialExplanationText || null,
    budgetExplanationText: parsed.data.budgetExplanationText || null,
    upsellPitchText: parsed.data.upsellPitchText || null,
    teamIntroduction: parsed.data.teamIntroduction || null,
    companyPortfolioText: parsed.data.companyPortfolioText || null,
    whyChooseUsText: parsed.data.whyChooseUsText || null,
    nextStepsText: parsed.data.nextStepsText || null,
    fileUrl: parsed.data.fileUrl || null,
    status: parsed.data.status,
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/presentation`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/presentation`);
}

const generatePresentationNarrativeSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  overwrite: z.enum(["on"]).optional(),
});

export async function generatePresentationNarrativeAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = generatePresentationNarrativeSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    overwrite: formData.get("overwrite") ? "on" : undefined,
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  await applyPresentationNarrative({
    designBriefId: parsed.data.briefId,
    overwrite: Boolean(parsed.data.overwrite),
    actorUserId: userId,
  });

  await auditLog({
    module: "design_workflow",
    action: "generate_presentation_narrative",
    actorUserId: userId,
    projectId,
    entityType: "ClientPresentation",
    entityId: parsed.data.briefId,
    metadata: { overwrite: Boolean(parsed.data.overwrite) },
  });

  revalidatePath(`/projects/${projectId}/design-brief/${parsed.data.briefId}/presentation`);
  revalidatePath(`/projects/${projectId}/design-brief/${parsed.data.briefId}/presentation/print`);
  redirect(`/projects/${projectId}/design-brief/${parsed.data.briefId}/presentation`);
}

const budgetOptimizeSchema = z.object({
  projectId: z.string().min(1),
  briefId: z.string().min(1),
  targetBudget: z.coerce.number().min(0),
  veItemIdsJson: z.string().optional().or(z.literal("")).default("[]"),
});

export async function runBudgetOptimizerAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = budgetOptimizeSchema.safeParse({
    projectId,
    briefId: formData.get("briefId"),
    targetBudget: formData.get("targetBudget"),
    veItemIdsJson: formData.get("veItemIdsJson"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const brief = await prisma.designBrief.findUnique({
    where: { id: parsed.data.briefId },
    include: {
      areas: { include: { qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } },
    },
  });
  if (!brief || brief.projectId !== parsed.data.projectId) throw new Error("Not found.");

  const rawFromForm = formData.getAll("veItemIds").map((v) => String(v));
  const veIds =
    rawFromForm.length > 0
      ? z.array(z.string().min(1)).parse(rawFromForm)
      : z.array(z.string().min(1)).parse(JSON.parse(parsed.data.veItemIdsJson) as unknown);

  const allItems = brief.areas.flatMap((a) =>
    a.qsBoqDraftItems.map((i) => ({
      id: i.id,
      description: i.description,
      unit: i.unit,
      quantity: Number(i.quantity),
      recommendedSellingUnitPrice: Number(i.recommendedSellingUnitPrice),
      estimatedCostUnitPrice: Number(i.estimatedCostUnitPrice),
    })),
  );

  const mustHave = allItems.map((i) => i.id).filter((id) => !veIds.includes(id));

  const result = await optimizeDesignBudget({
    targetBudget: clampNonNegative(parsed.data.targetBudget),
    currentBoqItems: allItems,
    designStyle: brief.designStyle ?? null,
    propertyType: brief.propertyType,
    mustHaveItems: mustHave,
    optionalItems: veIds,
  });

  const scenario = await prisma.budgetOptimizationScenario.create({
    data: {
      designBriefId: brief.id,
      projectId: parsed.data.projectId,
      targetBudget: toDecimalCurrency(result.targetBudget),
      currentEstimatedTotal: toDecimalCurrency(result.currentTotal),
      revisedEstimatedTotal: toDecimalCurrency(result.revisedEstimatedTotal),
      savingsAmount: toDecimalCurrency(Math.max(0, result.currentTotal - result.revisedEstimatedTotal)),
      recommendationSummary: result.valueEngineeringSuggestions[0] ?? "Budget optimization scenario",
      scenarioJson: result as unknown as Prisma.InputJsonValue,
      isSelected: false,
    },
  });

  await auditLog({
    module: "design_workflow",
    action: "budget_optimize",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignBrief",
    entityId: brief.id,
    metadata: {
      scenarioId: scenario.id,
      targetBudget: result.targetBudget,
      revisedEstimatedTotal: result.revisedEstimatedTotal,
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/budget-optimizer`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/budget-optimizer#scenarios`);
}

export async function selectBudgetScenarioAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      scenarioId: z.string().min(1),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      scenarioId: formData.get("scenarioId"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const scenario = await prisma.budgetOptimizationScenario.findUnique({
    where: { id: parsed.data.scenarioId },
    select: { id: true, projectId: true, designBriefId: true },
  });
  if (!scenario || scenario.projectId !== parsed.data.projectId || scenario.designBriefId !== parsed.data.briefId) {
    throw new Error("Not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.budgetOptimizationScenario.updateMany({
      where: { projectId: parsed.data.projectId, designBriefId: parsed.data.briefId },
      data: { isSelected: false },
    });
    await tx.budgetOptimizationScenario.update({
      where: { id: scenario.id },
      data: { isSelected: true },
    });
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/budget-optimizer`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/budget-optimizer#scenarios`);
}

export async function applyBudgetScenarioAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      scenarioId: z.string().min(1),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      scenarioId: formData.get("scenarioId"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const scenario = await prisma.budgetOptimizationScenario.findUnique({
    where: { id: parsed.data.scenarioId },
    select: { id: true, projectId: true, designBriefId: true, scenarioJson: true },
  });
  if (!scenario || scenario.projectId !== parsed.data.projectId || scenario.designBriefId !== parsed.data.briefId) {
    throw new Error("Not found.");
  }

  const parsedScenario = z
    .object({
      adjustments: z.array(
        z.object({
          qsBoqDraftItemId: z.string().min(1),
          newRecommendedSellingUnitPrice: z.number(),
          newEstimatedCostUnitPrice: z.number(),
          note: z.string().optional().default(""),
        }),
      ),
    })
    .parse(scenario.scenarioJson);

  await prisma.$transaction(async (tx) => {
    for (const adj of parsedScenario.adjustments) {
      const row = await tx.qSBoqDraftItem.findUnique({
        where: { id: adj.qsBoqDraftItemId },
        select: { id: true, quantity: true },
      });
      if (!row) continue;
      const derived = computeQsDerived({
        quantity: Number(row.quantity),
        recommendedSellingUnitPrice: clampNonNegative(adj.newRecommendedSellingUnitPrice),
        estimatedCostUnitPrice: clampNonNegative(adj.newEstimatedCostUnitPrice),
      });
      await tx.qSBoqDraftItem.update({
        where: { id: row.id },
        data: {
          recommendedSellingUnitPrice: toDecimalCurrency(clampNonNegative(adj.newRecommendedSellingUnitPrice)),
          estimatedCostUnitPrice: toDecimalCurrency(clampNonNegative(adj.newEstimatedCostUnitPrice)),
          sellingTotal: toDecimalCurrency(derived.sellingTotal),
          costTotal: toDecimalCurrency(derived.costTotal),
          profit: toDecimalCurrency(derived.profit),
          marginPercent: toDecimalPct(derived.marginPercent),
        },
      });
    }

    await tx.budgetOptimizationScenario.updateMany({
      where: { projectId: parsed.data.projectId, designBriefId: parsed.data.briefId },
      data: { isSelected: false },
    });
    await tx.budgetOptimizationScenario.update({
      where: { id: scenario.id },
      data: { isSelected: true },
    });
  });

  await auditLog({
    module: "design_workflow",
    action: "apply_budget_scenario",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "BudgetOptimizationScenario",
    entityId: scenario.id,
    metadata: { adjustments: parsedScenario.adjustments.length },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/areas`);
  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/budget-optimizer`);
  redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/budget-optimizer#scenarios`);
}

export async function generateSalesPackageAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = z
    .object({
      projectId: z.string().min(1),
      briefId: z.string().min(1),
      regenerate: z.string().optional().or(z.literal("")).default(""),
    })
    .safeParse({
      projectId,
      briefId: formData.get("briefId"),
      regenerate: formData.get("regenerate"),
    });
  if (!parsed.success) throw new Error("Invalid request.");

  const { userId } = await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  const pipeline = await runDesignToSalesPipeline({
    projectId: parsed.data.projectId,
    designBriefId: parsed.data.briefId,
    regenerate: parsed.data.regenerate === "on",
  });

  await auditLog({
    module: "design_to_sales",
    action: pipeline.ok ? "generate_sales_package_ok" : "generate_sales_package_failed",
    actorUserId: userId,
    projectId: parsed.data.projectId,
    entityType: "DesignBrief",
    entityId: parsed.data.briefId,
    metadata: {
      ok: pipeline.ok,
      quotationId: pipeline.quotationId ?? null,
      presentationId: pipeline.presentationId ?? null,
      warnings: pipeline.warnings,
      validationErrors: pipeline.validationErrors,
    },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/quotations`);
  revalidatePath(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}/presentation`);

  if (!pipeline.ok) {
    const err = encodeURIComponent(pipeline.validationErrors.join(" | "));
    redirect(`/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}?pipelineError=${err}#sales-package`);
  }

  redirect(
    `/projects/${parsed.data.projectId}/design-brief/${parsed.data.briefId}?salesPackageReady=1&` +
      `quotationId=${pipeline.quotationId ?? ""}#sales-package`,
  );
}
