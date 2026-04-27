import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma, type DesignBriefStatus, type Quotation, type QuotationStatus } from "@prisma/client";
import { recomputeQuotationDerivedTotals } from "@/lib/quotations/service";
import { generateQuoteReference } from "@/lib/quotation-engine/quote-reference";

export type DesignToSalesPipelineResult = {
  ok: boolean;
  quotationId?: string;
  presentationId?: string | null;
  statusBefore?: DesignBriefStatus;
  statusAfter?: DesignBriefStatus;
  warnings: string[];
  validationErrors: string[];
};

export async function runDesignToSalesPipeline(input: {
  projectId: string;
  designBriefId: string;
  regenerate?: boolean;
}): Promise<DesignToSalesPipelineResult> {
  const warnings: string[] = [];
  const validationErrors: string[] = [];

  const brief = await prisma.designBrief.findUnique({
    where: { id: input.designBriefId },
    include: {
      project: { include: { client: true, commercialProfile: true } },
      presentation: true,
      budgetOptimizationScenarios: { orderBy: [{ createdAt: "desc" }], take: 30 },
      upsellRecommendations: { orderBy: [{ priority: "desc" }, { createdAt: "desc" }], take: 50 },
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          generatedLayoutPlans: { orderBy: [{ createdAt: "desc" }], take: 50 },
          visualRenders: { orderBy: [{ createdAt: "desc" }], take: 50 },
          qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 2000 },
        },
      },
    },
  });

  if (!brief || brief.projectId !== input.projectId) {
    throw new Error("Design brief not found.");
  }
  if (!brief.project) {
    throw new Error("Design brief is not linked to a project.");
  }

  const statusBefore = brief.status;

  if (brief.status === "DRAFT") {
    validationErrors.push("Design brief is in DRAFT. Move it to DESIGN_IN_PROGRESS / READY_FOR_QUOTATION before generating a sales package.");
  } else if (brief.status !== "READY_FOR_QUOTATION" && brief.status !== "SALES_PACKAGE_READY") {
    warnings.push(`Design brief status is ${brief.status}. Recommended status before packaging is READY_FOR_QUOTATION.`);
  }

  if (brief.areas.length === 0) validationErrors.push("No design areas found. Create at least one area.");

  for (const area of brief.areas) {
    const selectedLayout =
      area.generatedLayoutPlans.find((p) => p.isSelected) ?? null;
    if (!selectedLayout) {
      validationErrors.push(`Missing selected layout plan for area: ${area.name}. Generate and select a layout plan.`);
    }

    const selectedVisual =
      area.visualRenders.find((r) => r.isSelected) ??
      area.visualRenders.find((r) => r.generationStatus === "COMPLETED") ??
      null;
    if (!selectedVisual) {
      validationErrors.push(`Missing selected 3D visual for area: ${area.name}. Generate and select a visual option.`);
    }

    if (area.qsBoqDraftItems.length === 0) {
      validationErrors.push(`Missing QS BOQ draft for area: ${area.name}. Add QS BOQ items before generating quotation.`);
    }
  }

  if (validationErrors.length > 0) {
    return {
      ok: false,
      warnings,
      validationErrors,
      statusBefore,
      statusAfter: statusBefore,
    };
  }

  const project = brief.project;

  const result = await prisma.$transaction(async (tx) => {
    const gstRate = project.commercialProfile?.gstRate
      ? Number(project.commercialProfile.gstRate)
      : 0.09;

    // 5-7. Auto create quotation draft (safe versioning; do not overwrite).
    const draft = await ensureDraftQuotationForBrief({
      tx,
      projectId: input.projectId,
      designBriefId: input.designBriefId,
    });

    // 6. Populate quotation sections/items from QS BOQ.
    for (const area of brief.areas) {
      const sectionKey = `AUTO_PIPELINE:${brief.id}:${area.id}`;

      const section =
        (await tx.quotationSection.findFirst({
          where: { quotationId: draft.id, remarks: sectionKey },
        })) ??
        (await tx.quotationSection.create({
          data: {
            quotationId: draft.id,
            category: "OTHER",
            title: area.name,
            description: `Auto-generated from Design Brief (Area: ${area.roomType})`,
            isIncluded: true,
            isOptional: false,
            remarks: sectionKey,
            sortOrder: await tx.quotationSection.count({ where: { quotationId: draft.id } }),
            subtotal: new Prisma.Decimal(0),
          },
        }));

      if (input.regenerate) {
        const existing = await tx.quotationItem.findMany({
          where: { quotationSectionId: section.id, remarks: { startsWith: `AUTO_PIPELINE_QS:` } },
          select: { id: true },
          take: 5000,
        });
        const ids = existing.map((e) => e.id);
        if (ids.length) {
          await tx.qSBoqDraftItem.updateMany({
            where: { quotationItemId: { in: ids } },
            data: { quotationItemId: null },
          });
          await tx.quotationItem.deleteMany({
            where: { id: { in: ids } },
          });
        }
      }

      const existingItemCount = await tx.quotationItem.count({ where: { quotationSectionId: section.id } });
      let sortOffset = existingItemCount;

      for (const qs of area.qsBoqDraftItems) {
        const marker = `AUTO_PIPELINE_QS:${qs.id}`;
        const exists = await tx.quotationItem.findFirst({
          where: { quotationSectionId: section.id, remarks: marker },
          select: { id: true },
        });
        if (exists) continue;

        const created = await tx.quotationItem.create({
          data: {
            quotationSectionId: section.id,
            itemType: "SUPPLY_AND_INSTALL",
            sku: "",
            itemMasterId: null,
            description: qs.description,
            specification: null,
            unit: qs.unit,
            unitOfMeasureId: null,
            quantity: qs.quantity,
            unitPrice: qs.recommendedSellingUnitPrice,
            costPrice: qs.estimatedCostUnitPrice,
            totalPrice: new Prisma.Decimal(0),
            totalCost: new Prisma.Decimal(0),
            profit: new Prisma.Decimal(0),
            marginPercent: new Prisma.Decimal(0),
            remarks: marker,
            isIncluded: true,
            isOptional: false,
            sortOrder: sortOffset++,
          },
          select: { id: true },
        });

        // Only attach QS -> quotation mapping if it's not already linked to something else.
        if (!qs.quotationItemId) {
          await tx.qSBoqDraftItem.update({
            where: { id: qs.id },
            data: { quotationItemId: created.id },
          });
        }
      }
    }

    await recomputeQuotationDerivedTotals({ quotationId: draft.id, tx });

    // 8-9. Auto create presentation draft (content + rely on selected layout/visuals/QS/upsells for print).
    const selectedScenario = brief.budgetOptimizationScenarios.find((s) => s.isSelected) ?? null;
    const upsells = brief.upsellRecommendations.filter((u) => u.status !== "REJECTED").slice(0, 10);

    const introLines: string[] = [];
    introLines.push(`Project: ${project.name}`);
    introLines.push(`Property: ${brief.propertyType}${brief.designStyle ? ` · Style: ${brief.designStyle}` : ""}`);
    introLines.push("");
    introLines.push("Client needs:");
    introLines.push(brief.clientNeeds);
    introLines.push("");
    introLines.push("Design summary:");
    introLines.push("This proposal consolidates selected layouts and 3D visuals per area, together with a preliminary QS BOQ budget summary.");
    if (selectedScenario) {
      introLines.push("");
      introLines.push(
        `Budget option selected: Target ${Number(selectedScenario.targetBudget).toFixed(2)} · Revised ${Number(selectedScenario.revisedEstimatedTotal).toFixed(2)}.`,
      );
      introLines.push(selectedScenario.recommendationSummary);
    }
    if (upsells.length > 0) {
      introLines.push("");
      introLines.push("Optional upgrades:");
      for (const u of upsells) {
        introLines.push(`- ${u.title}: ${u.pitchText}`);
      }
    }

    const presentation = await tx.clientPresentation.upsert({
      where: { designBriefId: brief.id },
      create: {
        designBriefId: brief.id,
        title: brief.presentation?.title ?? `${project.name} Presentation`,
        addressedTo: brief.presentation?.addressedTo ?? project.client.name,
        presentationDate: brief.presentation?.presentationDate ?? new Date(),
        introductionText: introLines.join("\n"),
        teamIntroduction:
          brief.presentation?.teamIntroduction ??
          "Project team: Designer, 3D Visualiser, QS, and Admin will coordinate deliverables and milestones.",
        companyPortfolioText:
          brief.presentation?.companyPortfolioText ??
          "Portfolio and capabilities are available upon request. This deck focuses on your project-specific proposal.",
        whyChooseUsText:
          brief.presentation?.whyChooseUsText ??
          "Why choose us:\n- Clear scope and BOQ structure\n- Design-led process with QS control\n- Transparent progressive billing and collections discipline\n\nNext steps:\n1) Review presentation\n2) Confirm preferred options and any upsells\n3) Approve quotation draft for contract generation",
        fileUrl: brief.presentation?.fileUrl ?? null,
        status: "READY",
      },
      update: {
        title: brief.presentation?.title ?? `${project.name} Presentation`,
        addressedTo: brief.presentation?.addressedTo ?? project.client.name,
        presentationDate: brief.presentation?.presentationDate ?? new Date(),
        introductionText: introLines.join("\n"),
        teamIntroduction:
          brief.presentation?.teamIntroduction ??
          "Project team: Designer, 3D Visualiser, QS, and Admin will coordinate deliverables and milestones.",
        companyPortfolioText:
          brief.presentation?.companyPortfolioText ??
          "Portfolio and capabilities are available upon request. This deck focuses on your project-specific proposal.",
        whyChooseUsText:
          brief.presentation?.whyChooseUsText ??
          "Why choose us:\n- Clear scope and BOQ structure\n- Design-led process with QS control\n- Transparent progressive billing and collections discipline\n\nNext steps:\n1) Review presentation\n2) Confirm preferred options and any upsells\n3) Approve quotation draft for contract generation",
        fileUrl: brief.presentation?.fileUrl ?? null,
        status: "READY",
      },
      select: { id: true },
    });

    // 5. Move status forward when sales package is generated.
    const statusAfter: DesignBriefStatus = "SALES_PACKAGE_READY";
    await tx.designBrief.update({
      where: { id: brief.id },
      data: { status: statusAfter },
    });

    // Keep quotation clearly in DRAFT stage.
    if (draft.status !== ("DRAFT" as QuotationStatus)) {
      await tx.quotation.update({ where: { id: draft.id }, data: { status: "DRAFT" } });
    }

    // Capture linkage.
    await tx.quotation.update({
      where: { id: draft.id },
      data: { designBriefId: brief.id },
    });

    // Optional reminders.
    if (gstRate <= 0) warnings.push("GST rate is 0. Confirm commercial profile GST rate for accurate totals.");

    return { quotationId: draft.id, presentationId: presentation.id, statusAfter };
  });

  return {
    ok: true,
    quotationId: result.quotationId,
    presentationId: result.presentationId,
    warnings,
    validationErrors: [],
    statusBefore,
    statusAfter: result.statusAfter,
  };
}

async function ensureDraftQuotationForBrief(input: {
  tx: Prisma.TransactionClient;
  projectId: string;
  designBriefId: string;
}): Promise<Quotation> {
  const existingDraft = await input.tx.quotation.findFirst({
    where: { projectId: input.projectId, status: "DRAFT", isLatest: true },
    orderBy: [{ createdAt: "desc" }],
  });
  if (existingDraft) return existingDraft;

  const project = await input.tx.project.findUnique({
    where: { id: input.projectId },
    include: { client: true, commercialProfile: true },
  });
  if (!project) throw new Error("Project not found.");

  const latest = await input.tx.quotation.findFirst({
    where: { projectId: input.projectId, isLatest: true },
    select: { quotationNumber: true, version: true },
    orderBy: { createdAt: "desc" },
  });

  await input.tx.quotation.updateMany({
    where: { projectId: input.projectId, isLatest: true },
    data: { isLatest: false },
  });

  const issueDate = new Date();
  const quotationNumber = latest?.quotationNumber ?? generateQuoteReference(issueDate);
  const version = (latest?.version ?? 0) + 1;

  return input.tx.quotation.create({
    data: {
      clientId: project.clientId,
      projectId: project.id,
      designBriefId: input.designBriefId,
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

      subtotal: new Prisma.Decimal(0),
      discountAmount: new Prisma.Decimal(0),
      gstAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(0),
      estimatedCost: new Prisma.Decimal(0),
      profitAmount: new Prisma.Decimal(0),
      marginPercent: new Prisma.Decimal(0),
      notes: "Draft created by Design-to-Sales pipeline.",
      internalNotes: null,
    },
  });
}
