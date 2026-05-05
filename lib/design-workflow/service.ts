import { prisma } from "@/lib/prisma";
import {
  type ClientPresentationStatus,
  type DesignBriefStatus,
  type DesignRole,
  type DesignStyle,
  type DesignTaskStatus,
  type PropertyType,
  type RoomType,
  type VisualGenerationStatus,
} from "@prisma/client";
import { computeQsDerived, toDecimalCurrency, toDecimalPct } from "@/lib/design-workflow/qs-math";

function toDateOrNull(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function listProjectDesignBriefs(projectId: string) {
  return prisma.designBrief.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      tasks: { orderBy: [{ createdAt: "desc" }], take: 200 },
      areas: { orderBy: [{ createdAt: "asc" }], take: 200 },
      presentation: true,
    },
    take: 50,
  });
}

export async function getDesignBriefById(briefId: string) {
  return prisma.designBrief.findUnique({
    where: { id: briefId },
    include: {
      lead: true,
      project: { include: { client: true, commercialProfile: true } },
      tasks: { orderBy: [{ createdAt: "desc" }], take: 500 },
      areas: { orderBy: [{ createdAt: "asc" }], take: 500 },
      presentation: true,
    },
  });
}

export async function createDesignBrief(input: {
  leadId?: string | null;
  projectId?: string | null;
  title: string;
  clientNeeds: string;
  designStyle?: DesignStyle | null;
  propertyType: PropertyType;
  status?: DesignBriefStatus;
}) {
  return prisma.designBrief.create({
    data: {
      leadId: input.leadId ?? null,
      projectId: input.projectId ?? null,
      title: input.title.trim(),
      clientNeeds: input.clientNeeds.trim(),
      designStyle: input.designStyle ?? null,
      propertyType: input.propertyType,
      status: input.status ?? "DRAFT",
    },
  });
}

export async function updateDesignBrief(input: {
  briefId: string;
  title: string;
  clientNeeds: string;
  designStyle?: DesignStyle | null;
  propertyType: PropertyType;
}) {
  return prisma.designBrief.update({
    where: { id: input.briefId },
    data: {
      title: input.title.trim(),
      clientNeeds: input.clientNeeds.trim(),
      designStyle: input.designStyle ?? null,
      propertyType: input.propertyType,
    },
  });
}

export async function updateDesignBriefStatus(input: { briefId: string; status: DesignBriefStatus }) {
  return prisma.designBrief.update({
    where: { id: input.briefId },
    data: { status: input.status },
  });
}

export async function addDesignTask(input: {
  designBriefId: string;
  role: DesignRole;
  title: string;
  description?: string | null;
  status?: DesignTaskStatus;
  assignedTo?: string | null;
  dueDate?: Date | null;
  notes?: string | null;
}) {
  return prisma.designTask.create({
    data: {
      designBriefId: input.designBriefId,
      role: input.role,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.status ?? "TODO",
      assignedTo: input.assignedTo?.trim() || null,
      dueDate: input.dueDate ?? null,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
      notes: input.notes?.trim() || null,
    },
  });
}

export async function updateDesignTask(input: {
  taskId: string;
  status: DesignTaskStatus;
  assignedTo?: string | null;
  dueDate?: Date | null;
  notes?: string | null;
}) {
  return prisma.designTask.update({
    where: { id: input.taskId },
    data: {
      status: input.status,
      assignedTo: input.assignedTo?.trim() || null,
      dueDate: input.dueDate ?? null,
      notes: input.notes?.trim() || null,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
    },
  });
}

export async function addDesignArea(input: {
  designBriefId: string;
  name: string;
  roomType: RoomType;
  clientRequirement?: string | null;
}) {
  return prisma.designArea.create({
    data: {
      designBriefId: input.designBriefId,
      name: input.name.trim(),
      roomType: input.roomType,
      clientRequirement: input.clientRequirement?.trim() || null,
      proposedLayoutNotes: null,
      proposedMaterials: null,
      proposedTheme: null,
    },
  });
}

export async function updateDesignArea(input: {
  areaId: string;
  name: string;
  roomType: RoomType;
  clientRequirement?: string | null;
  proposedLayoutNotes?: string | null;
  proposedMaterials?: string | null;
  proposedTheme?: string | null;
}) {
  return prisma.designArea.update({
    where: { id: input.areaId },
    data: {
      name: input.name.trim(),
      roomType: input.roomType,
      clientRequirement: input.clientRequirement?.trim() || null,
      proposedLayoutNotes: input.proposedLayoutNotes?.trim() || null,
      proposedMaterials: input.proposedMaterials?.trim() || null,
      proposedTheme: input.proposedTheme?.trim() || null,
    },
  });
}

export async function addLayoutPlan(input: {
  designAreaId: string;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  generatedNotes?: string | null;
}) {
  return prisma.layoutPlan.create({
    data: {
      designAreaId: input.designAreaId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      fileUrl: input.fileUrl?.trim() || null,
      generatedNotes: input.generatedNotes?.trim() || null,
    },
  });
}

export async function addVisualRender(input: {
  designAreaId: string;
  title: string;
  theme?: string | null;
  materialNotes?: string | null;
  fileUrl?: string | null;
  generatedPrompt?: string | null;
  promptText?: string | null;
  generatedImageUrl?: string | null;
  generationStatus?: VisualGenerationStatus;
  errorMessage?: string | null;
}) {
  const promptText = input.promptText?.trim() || input.generatedPrompt?.trim() || null;
  const generatedImageUrl = input.generatedImageUrl?.trim() || input.fileUrl?.trim() || null;

  return prisma.visualRender.create({
    data: {
      designAreaId: input.designAreaId,
      title: input.title.trim(),
      theme: input.theme?.trim() || null,
      materialNotes: input.materialNotes?.trim() || null,
      // Keep legacy fields for existing UI/print routes; new fields are preferred going forward.
      fileUrl: input.fileUrl?.trim() || generatedImageUrl,
      generatedPrompt: input.generatedPrompt?.trim() || promptText,
      promptText,
      generatedImageUrl,
      generationStatus: input.generationStatus ?? "PENDING",
      errorMessage: input.errorMessage?.trim() || null,
    },
  });
}

export async function addFfeProposal(input: {
  designAreaId: string;
  title: string;
  description?: string | null;
  supplierName?: string | null;
  purchaseUrl?: string | null;
  unitPrice: number;
  quantity: number;
  leadTimeDays?: number | null;
  availabilityStatus?: string | null;
  remarks?: string | null;
}) {
  const unitPrice = Number.isFinite(input.unitPrice) ? Math.max(0, input.unitPrice) : 0;
  const quantity = Number.isFinite(input.quantity) ? Math.max(0, input.quantity) : 0;
  const leadTimeDays =
    input.leadTimeDays === null || input.leadTimeDays === undefined
      ? null
      : Number.isFinite(input.leadTimeDays)
        ? Math.max(0, Math.floor(input.leadTimeDays))
        : null;

  return prisma.fFEProposal.create({
    data: {
      designAreaId: input.designAreaId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      supplierName: input.supplierName?.trim() || null,
      purchaseUrl: input.purchaseUrl?.trim() || null,
      unitPrice: toDecimalCurrency(unitPrice),
      quantity: toDecimalCurrency(quantity),
      leadTimeDays,
      availabilityStatus: input.availabilityStatus?.trim() || null,
      remarks: input.remarks?.trim() || null,
    },
  });
}

export async function deleteFfeProposal(ffeId: string) {
  return prisma.fFEProposal.delete({ where: { id: ffeId } });
}

export type QsDraftInputRow = {
  id?: string | null;
  description: string;
  unit: string;
  quantity: number;
  recommendedSellingUnitPrice: number;
  estimatedCostUnitPrice: number;
  isEditable: boolean;
  sortOrder: number;
};

export async function saveQsBoqDraftItems(input: { designAreaId: string; rows: QsDraftInputRow[] }) {
  // Normalize & compute derived fields server-side.
  const rows = input.rows
    .map((r, index) => {
      const qty = Number.isFinite(r.quantity) ? Math.max(0, r.quantity) : 0;
      const sell = Number.isFinite(r.recommendedSellingUnitPrice) ? Math.max(0, r.recommendedSellingUnitPrice) : 0;
      const cost = Number.isFinite(r.estimatedCostUnitPrice) ? Math.max(0, r.estimatedCostUnitPrice) : 0;
      const derived = computeQsDerived({ quantity: qty, recommendedSellingUnitPrice: sell, estimatedCostUnitPrice: cost });

      return {
        id: r.id?.trim() || null,
        description: r.description.trim(),
        unit: r.unit.trim() || "lot",
        quantity: qty,
        recommendedSellingUnitPrice: sell,
        estimatedCostUnitPrice: cost,
        sellingTotal: derived.sellingTotal,
        costTotal: derived.costTotal,
        profit: derived.profit,
        marginPercent: derived.marginPercent,
        isEditable: Boolean(r.isEditable),
        sortOrder: Number.isFinite(r.sortOrder) ? r.sortOrder : index,
      };
    })
    .filter((r) => r.description.length > 0);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.qSBoqDraftItem.findMany({
      where: { designAreaId: input.designAreaId },
      select: { id: true },
      take: 2000,
    });
    const existingIds = new Set(existing.map((e) => e.id));
    const keepIds = new Set(
      rows
        .map((r) => r.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0 && existingIds.has(id)),
    );

    // Delete items removed in UI (only if not pushed to quotation yet).
    const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
    if (toDelete.length > 0) {
      await tx.qSBoqDraftItem.deleteMany({
        where: { id: { in: toDelete }, quotationItemId: null },
      });
    }

    for (const row of rows) {
      if (row.id && existingIds.has(row.id)) {
        await tx.qSBoqDraftItem.update({
          where: { id: row.id },
          data: {
            description: row.description,
            unit: row.unit,
            quantity: toDecimalCurrency(row.quantity),
            recommendedSellingUnitPrice: toDecimalCurrency(row.recommendedSellingUnitPrice),
            estimatedCostUnitPrice: toDecimalCurrency(row.estimatedCostUnitPrice),
            sellingTotal: toDecimalCurrency(row.sellingTotal),
            costTotal: toDecimalCurrency(row.costTotal),
            profit: toDecimalCurrency(row.profit),
            marginPercent: toDecimalPct(row.marginPercent),
            isEditable: row.isEditable,
            sortOrder: row.sortOrder,
          },
        });
      } else {
        await tx.qSBoqDraftItem.create({
          data: {
            designAreaId: input.designAreaId,
            quotationItemId: null,
            description: row.description,
            unit: row.unit,
            quantity: toDecimalCurrency(row.quantity),
            recommendedSellingUnitPrice: toDecimalCurrency(row.recommendedSellingUnitPrice),
            estimatedCostUnitPrice: toDecimalCurrency(row.estimatedCostUnitPrice),
            sellingTotal: toDecimalCurrency(row.sellingTotal),
            costTotal: toDecimalCurrency(row.costTotal),
            profit: toDecimalCurrency(row.profit),
            marginPercent: toDecimalPct(row.marginPercent),
            isEditable: row.isEditable,
            sortOrder: row.sortOrder,
          },
        });
      }
    }

    return { saved: rows.length };
  });
}

export async function deleteQsBoqDraftItem(itemId: string) {
  return prisma.qSBoqDraftItem.delete({ where: { id: itemId } });
}

export async function upsertPresentation(input: {
  designBriefId: string;
  title: string;
  addressedTo: string;
  presentationDate: string | null;
  introductionText?: string | null;
  roomNarrativeText?: string | null;
  materialExplanationText?: string | null;
  budgetExplanationText?: string | null;
  upsellPitchText?: string | null;
  teamIntroduction?: string | null;
  companyPortfolioText?: string | null;
  whyChooseUsText?: string | null;
  nextStepsText?: string | null;
  fileUrl?: string | null;
  status?: ClientPresentationStatus;
}) {
  const presentationDate = toDateOrNull(input.presentationDate);
  return prisma.clientPresentation.upsert({
    where: { designBriefId: input.designBriefId },
    create: {
      designBriefId: input.designBriefId,
      title: input.title.trim(),
      addressedTo: input.addressedTo.trim(),
      presentationDate,
      introductionText: input.introductionText?.trim() || null,
      roomNarrativeText: input.roomNarrativeText?.trim() || null,
      materialExplanationText: input.materialExplanationText?.trim() || null,
      budgetExplanationText: input.budgetExplanationText?.trim() || null,
      upsellPitchText: input.upsellPitchText?.trim() || null,
      teamIntroduction: input.teamIntroduction?.trim() || null,
      companyPortfolioText: input.companyPortfolioText?.trim() || null,
      whyChooseUsText: input.whyChooseUsText?.trim() || null,
      nextStepsText: input.nextStepsText?.trim() || null,
      fileUrl: input.fileUrl?.trim() || null,
      status: input.status ?? "DRAFT",
    },
    update: {
      title: input.title.trim(),
      addressedTo: input.addressedTo.trim(),
      presentationDate,
      introductionText: input.introductionText?.trim() || null,
      roomNarrativeText: input.roomNarrativeText?.trim() || null,
      materialExplanationText: input.materialExplanationText?.trim() || null,
      budgetExplanationText: input.budgetExplanationText?.trim() || null,
      upsellPitchText: input.upsellPitchText?.trim() || null,
      teamIntroduction: input.teamIntroduction?.trim() || null,
      companyPortfolioText: input.companyPortfolioText?.trim() || null,
      whyChooseUsText: input.whyChooseUsText?.trim() || null,
      nextStepsText: input.nextStepsText?.trim() || null,
      fileUrl: input.fileUrl?.trim() || null,
      status: input.status ?? "DRAFT",
    },
  });
}
