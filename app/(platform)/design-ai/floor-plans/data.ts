import "server-only";

import { Prisma } from "@prisma/client";
import type {
  CabinetDesign as CabinetDesignRow,
  DesignPerspectives as DesignPerspectivesRow,
  FloorPlanAnalysis as FloorPlanAnalysisRow,
  FloorPlanUpload as FloorPlanUploadRow,
  FurnitureLayout as FurnitureLayoutRow,
  RenovationWorkflow as RenovationWorkflowRow,
} from "@prisma/client";
import {
  buildFloorPlanRecordFromPersistedUpload,
  buildPersistedFloorPlanAnalysisSeed,
  generateMockCabinetDesignPackage,
  generateMockFurnitureLayout,
  generateMockPerspectiveConceptPackage,
  generateMockRenovationWorkflow,
  type FloorPlanCabinetDesignPackage,
  type FloorPlanCabinetInstallationNote,
  type FloorPlanCabinetMaterialSummaryItem,
  type FloorPlanCabinetProductionItem,
  type FloorPlanFurnitureLayoutResult,
  type FloorPlanPerspectiveConceptPackage,
  type FloorPlanPerspectiveRenderImage,
  type FloorPlanPerspectiveStyle,
  type FloorPlanRecord,
  type FloorPlanWorkflowStep,
} from "@/lib/design-ai/floor-plan-engine";
import { generateFloorPlanPerspectiveRenderImages } from "@/lib/design-ai/image";
import { prisma } from "@/lib/prisma";

type FloorPlanUploadWithLatestRelations = Prisma.FloorPlanUploadGetPayload<{
  include: {
    analyses: { orderBy: { createdAt: "desc" }; take: 1 };
    furnitureLayouts: { orderBy: { createdAt: "desc" }; take: 1 };
    designPerspectives: { orderBy: { createdAt: "desc" }; take: 1 };
    cabinetDesigns: { orderBy: { createdAt: "desc" }; take: 1 };
    renovationWorkflows: { orderBy: { createdAt: "desc" }; take: 1 };
  };
}>;

type PersistedCabinetDesignPayload = {
  cabinets: FloorPlanCabinetDesignPackage["cabinets"];
  materialSummary: FloorPlanCabinetMaterialSummaryItem[];
  installationNotes: FloorPlanCabinetInstallationNote[];
};

export type PersistedDesignPerspectivePayload = {
  perspectivePackage: FloorPlanPerspectiveConceptPackage;
  renderImages: FloorPlanPerspectiveRenderImage[];
};

export type FloorPlanGenerationRequest = {
  generateFullDesign: boolean;
  generateFurnitureLayout: boolean;
  generateCabinetDesign: boolean;
  generate3dPerspectives: boolean;
  generateRenderImages: boolean;
  generateRenovationWorkflow: boolean;
  generateBoq: boolean;
  prepareQuotationData: boolean;
  prepareProposalContent: boolean;
  perspectiveStyle: FloorPlanPerspectiveStyle;
};

export type FloorPlanCommercialSnapshot = {
  designBriefId: string | null;
  designConceptId: string | null;
  boqId: string | null;
  quotationId: string | null;
  quotationProjectId: string | null;
  proposalId: string | null;
};

export type PersistedFloorPlanSnapshot = {
  upload: FloorPlanUploadRow;
  analysis: FloorPlanAnalysisRow | null;
  furnitureLayout: FurnitureLayoutRow | null;
  designPerspectives: DesignPerspectivesRow | null;
  cabinetDesign: CabinetDesignRow | null;
  renovationWorkflow: RenovationWorkflowRow | null;
  plan: FloorPlanRecord;
};

export async function listPersistedFloorPlans() {
  const uploads = await prisma.floorPlanUpload.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      furnitureLayouts: { orderBy: { createdAt: "desc" }, take: 1 },
      designPerspectives: { orderBy: { createdAt: "desc" }, take: 1 },
      cabinetDesigns: { orderBy: { createdAt: "desc" }, take: 1 },
      renovationWorkflows: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 100,
  });

  return uploads.map(toPersistedFloorPlanSnapshot);
}

export async function getPersistedFloorPlanSnapshot(id: string) {
  const upload = await prisma.floorPlanUpload.findUnique({
    where: { id },
    include: {
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      furnitureLayouts: { orderBy: { createdAt: "desc" }, take: 1 },
      designPerspectives: { orderBy: { createdAt: "desc" }, take: 1 },
      cabinetDesigns: { orderBy: { createdAt: "desc" }, take: 1 },
      renovationWorkflows: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return upload ? toPersistedFloorPlanSnapshot(upload) : null;
}

export function buildFloorPlanCommercialRef(floorPlanId: string) {
  return `FP-${floorPlanId}`;
}

export function buildFloorPlanCommercialBriefTitle(
  plan: Pick<FloorPlanRecord, "projectName">,
  floorPlanId: string,
) {
  return `${plan.projectName} Commercial Brief · ${buildFloorPlanCommercialRef(floorPlanId)}`;
}

export function buildFloorPlanCommercialRequirementsRef(floorPlanId: string) {
  return `Source floor plan reference: ${buildFloorPlanCommercialRef(floorPlanId)}`;
}

export async function getFloorPlanCommercialSnapshot(
  floorPlanId: string,
): Promise<FloorPlanCommercialSnapshot> {
  const floorPlanRef = buildFloorPlanCommercialRequirementsRef(floorPlanId);

  const brief = await prisma.designBrief.findFirst({
    where: {
      OR: [
        { requirements: { contains: floorPlanRef } },
        { title: { contains: buildFloorPlanCommercialRef(floorPlanId) } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      concepts: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
      boqs: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
      quotations: {
        where: { isLatest: true },
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          projectId: true,
          proposal: {
            select: { id: true },
          },
        },
      },
    },
  });

  const quotation = brief?.quotations[0] ?? null;

  return {
    designBriefId: brief?.id ?? null,
    designConceptId: brief?.concepts[0]?.id ?? null,
    boqId: brief?.boqs[0]?.id ?? null,
    quotationId: quotation?.id ?? null,
    quotationProjectId: quotation?.projectId ?? null,
    proposalId: quotation?.proposal?.id ?? null,
  };
}

export function hasFloorPlanGenerationRequest(request: FloorPlanGenerationRequest) {
  return (
    request.generateFullDesign ||
    request.generateFurnitureLayout ||
    request.generateCabinetDesign ||
    request.generate3dPerspectives ||
    request.generateRenderImages ||
    request.generateRenovationWorkflow ||
    request.generateBoq ||
    request.prepareQuotationData ||
    request.prepareProposalContent
  );
}

export function isPersistedFullDesignComplete(snapshot: PersistedFloorPlanSnapshot) {
  return Boolean(
    snapshot.analysis &&
      snapshot.furnitureLayout &&
      snapshot.designPerspectives &&
      snapshot.cabinetDesign &&
      snapshot.renovationWorkflow,
  );
}

export function parsePersistedFurnitureLayout(record: FurnitureLayoutRow | null) {
  if (!record || !record.layoutJson || typeof record.layoutJson !== "object") {
    return null;
  }

  return record.layoutJson as unknown as FloorPlanFurnitureLayoutResult;
}

export function parsePersistedDesignPerspectives(
  record: DesignPerspectivesRow | null,
): PersistedDesignPerspectivePayload | null {
  if (!record || !record.perspectivesJson || typeof record.perspectivesJson !== "object") {
    return null;
  }

  const payload = record.perspectivesJson as Partial<PersistedDesignPerspectivePayload>;

  if (!payload.perspectivePackage || typeof payload.perspectivePackage !== "object") {
    return null;
  }

  return {
    perspectivePackage:
      payload.perspectivePackage as FloorPlanPerspectiveConceptPackage,
    renderImages: Array.isArray(payload.renderImages)
      ? (payload.renderImages as FloorPlanPerspectiveRenderImage[])
      : [],
  };
}

export function parsePersistedCabinetDesign(record: CabinetDesignRow | null) {
  if (!record || !record.cabinetsJson || typeof record.cabinetsJson !== "object") {
    return null;
  }

  const cabinetPayload = record.cabinetsJson as Partial<PersistedCabinetDesignPayload>;
  const productionList = Array.isArray(record.productionJson)
    ? (record.productionJson as unknown as FloorPlanCabinetProductionItem[])
    : [];

  return {
    cabinets: Array.isArray(cabinetPayload.cabinets)
      ? cabinetPayload.cabinets
      : [],
    productionList,
    materialSummary: Array.isArray(cabinetPayload.materialSummary)
      ? cabinetPayload.materialSummary
      : [],
    installationNotes: Array.isArray(cabinetPayload.installationNotes)
      ? cabinetPayload.installationNotes
      : [],
  } satisfies FloorPlanCabinetDesignPackage;
}

export function parsePersistedRenovationWorkflow(record: RenovationWorkflowRow | null) {
  if (!record || !Array.isArray(record.stepsJson)) {
    return null;
  }

  return record.stepsJson as unknown as FloorPlanWorkflowStep[];
}

export async function persistFloorPlanRequestedOutputs(
  upload: FloorPlanUploadRow,
  request: FloorPlanGenerationRequest,
) {
  const shouldPersistAnalysis = hasFloorPlanGenerationRequest(request);
  let analysisSeed = null as ReturnType<typeof buildPersistedFloorPlanAnalysisSeed> | null;

  if (shouldPersistAnalysis) {
    analysisSeed = buildPersistedFloorPlanAnalysisSeed(upload);

    await prisma.floorPlanAnalysis.create({
      data: {
        floorPlanId: upload.id,
        roomsJson: analysisSeed.roomsJson as Prisma.InputJsonValue,
        notesJson: analysisSeed.notesJson as Prisma.InputJsonValue,
      },
    });
  }

  const plan = buildFloorPlanRecordFromPersistedUpload(
    upload,
    analysisSeed
      ? {
          roomsJson: analysisSeed.roomsJson,
          notesJson: analysisSeed.notesJson,
        }
      : null,
  );
  const shouldGenerateFurnitureLayout =
    request.generateFullDesign ||
    request.generateFurnitureLayout ||
    request.generateBoq ||
    request.prepareQuotationData ||
    request.prepareProposalContent;
  const shouldGenerateCabinetDesign =
    request.generateFullDesign ||
    request.generateCabinetDesign ||
    request.generateBoq ||
    request.prepareQuotationData ||
    request.prepareProposalContent;
  const shouldGeneratePerspectives =
    request.generateFullDesign ||
    request.generate3dPerspectives ||
    request.generateRenderImages ||
    request.prepareProposalContent;
  const shouldGenerateWorkflow =
    request.generateFullDesign ||
    request.generateRenovationWorkflow ||
    request.generateBoq ||
    request.prepareQuotationData ||
    request.prepareProposalContent;

  if (shouldGenerateFurnitureLayout) {
    const furnitureLayout = generateMockFurnitureLayout(plan);

    await prisma.furnitureLayout.create({
      data: {
        floorPlanId: upload.id,
        layoutJson: furnitureLayout as Prisma.InputJsonValue,
      },
    });
  }

  if (shouldGenerateCabinetDesign) {
    const cabinetDesignPackage = generateMockCabinetDesignPackage(plan);

    await prisma.cabinetDesign.create({
      data: {
        floorPlanId: upload.id,
        cabinetsJson: {
          cabinets: cabinetDesignPackage.cabinets,
          materialSummary: cabinetDesignPackage.materialSummary,
          installationNotes: cabinetDesignPackage.installationNotes,
        } as Prisma.InputJsonValue,
        productionJson:
          cabinetDesignPackage.productionList as Prisma.InputJsonValue,
      },
    });
  }

  if (shouldGeneratePerspectives) {
    const perspectivePackage = generateMockPerspectiveConceptPackage(
      plan,
      request.perspectiveStyle,
    );
    const renderImages =
      request.generateFullDesign || request.generateRenderImages
        ? await generateFloorPlanPerspectiveRenderImages(perspectivePackage)
        : [];

    await prisma.designPerspectives.create({
      data: {
        floorPlanId: upload.id,
        perspectivesJson: {
          perspectivePackage,
          renderImages,
        } as Prisma.InputJsonValue,
      },
    });
  }

  if (shouldGenerateWorkflow) {
    const workflow = generateMockRenovationWorkflow(plan);

    await prisma.renovationWorkflow.create({
      data: {
        floorPlanId: upload.id,
        stepsJson: workflow as Prisma.InputJsonValue,
      },
    });
  }
}

function toPersistedFloorPlanSnapshot(
  upload: FloorPlanUploadWithLatestRelations,
): PersistedFloorPlanSnapshot {
  const analysis = upload.analyses[0] ?? null;

  return {
    upload: {
      id: upload.id,
      name: upload.name,
      fileUrl: upload.fileUrl,
      createdAt: upload.createdAt,
    },
    analysis,
    furnitureLayout: upload.furnitureLayouts[0] ?? null,
    designPerspectives: upload.designPerspectives[0] ?? null,
    cabinetDesign: upload.cabinetDesigns[0] ?? null,
    renovationWorkflow: upload.renovationWorkflows[0] ?? null,
    plan: buildFloorPlanRecordFromPersistedUpload(
      {
        id: upload.id,
        name: upload.name,
        fileUrl: upload.fileUrl,
        createdAt: upload.createdAt,
      },
      analysis
        ? {
            roomsJson: analysis.roomsJson,
            notesJson: analysis.notesJson,
            createdAt: analysis.createdAt,
          }
        : null,
    ),
  };
}
