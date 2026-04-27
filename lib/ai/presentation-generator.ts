import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCompanyBranding } from "@/lib/branding";

export type GeneratedPresentationNarrative = {
  introductionText: string;
  roomNarrativeText: string;
  materialExplanationText: string;
  budgetExplanationText: string;
  upsellPitchText: string;
  whyChooseUsText: string;
  nextStepsText: string;
};

function money(n: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(n);
}

function compactLines(input: string): string {
  return input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join("\n");
}

function pickOrFallback(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return v ? v : fallback;
}

function buildDesignConcept(params: {
  clientNeeds: string;
  designStyle: string | null;
  propertyType: string;
  projectName: string;
  address: string;
  companyName: string;
}): string {
  const style = params.designStyle ?? "a timeless, modern direction";
  return [
    `Thank you for considering ${params.companyName}. This proposal presents a ${style.toLowerCase()} concept tailored for ${params.projectName} in Singapore.`,
    `Project site: ${params.address}`,
    "",
    "Design intent (from your brief):",
    compactLines(params.clientNeeds)
      .split("\n")
      .map((l) => `- ${l}`)
      .join("\n"),
    "",
    "Our concept approach:",
    `- A cohesive palette across spaces to keep the home calm and consistent.`,
    `- Practical detailing suited for ${params.propertyType.toLowerCase()} use and long-term maintenance.`,
    "- Lighting layers (ambient / task / accent) to create warmth, depth, and flexibility for day-to-night living.",
    "- Buildable, site-aware solutions to reduce surprises during execution.",
  ].join("\n");
}

function buildRoomNarrative(areas: Array<{
  name: string;
  roomType: string;
  clientRequirement: string | null;
  proposedTheme: string | null;
  proposedLayoutNotes: string | null;
  proposedMaterials: string | null;
}>): string {
  if (areas.length === 0) {
    return "Room-by-room narrative will appear once areas are added to the design brief.";
  }

  return areas
    .map((a) => {
      const theme = (a.proposedTheme ?? "").trim();
      const req = (a.clientRequirement ?? "").trim();
      const layout = (a.proposedLayoutNotes ?? "").trim();
      const materials = (a.proposedMaterials ?? "").trim();

      return [
        `${a.name} (${a.roomType})`,
        req ? `Client needs: ${req}` : "Client needs: -",
        theme ? `Design direction: ${theme}` : "Design direction: -",
        layout ? `Layout & usage: ${layout}` : "Layout & usage: -",
        materials ? `Materials & finish notes: ${materials}` : "Materials & finish notes: -",
        "Client benefits:",
        "- Better flow and daily usability",
        "- Clear storage strategy and visual calm",
        "- Durable finishes appropriate to the space",
      ].join("\n");
    })
    .join("\n\n");
}

function buildMaterialsExplanation(areas: Array<{ proposedMaterials: string | null; proposedTheme: string | null }>): string {
  const materialLines = areas
    .flatMap((a) => (a.proposedMaterials ?? "").split("\n"))
    .map((l) => l.trim())
    .filter(Boolean);

  const themes = Array.from(
    new Set(
      areas
        .map((a) => (a.proposedTheme ?? "").trim())
        .filter(Boolean),
    ),
  );

  const topMaterials = Array.from(new Set(materialLines)).slice(0, 10);
  const materialBullets = topMaterials.length ? topMaterials.map((m) => `- ${m}`).join("\n") : "- To be confirmed during material selection.";

  return [
    themes.length ? `Theme direction: ${themes.slice(0, 3).join(" / ")}` : "Theme direction: To be confirmed",
    "",
    "Material palette overview (indicative):",
    materialBullets,
    "",
    "Notes:",
    "- Final selections will be aligned to site conditions, availability, and your approved budget.",
    "- Wet areas and kitchens prioritise durability, moisture resistance, and ease of cleaning.",
    "- We will propose alternatives where needed to protect timeline and performance without compromising the concept.",
  ].join("\n");
}

function buildBudgetExplanation(params: {
  qsSellingTotal: number;
  quotationTotal: number | null;
  ffeTotal: number;
}): string {
  const qs = params.qsSellingTotal;
  const q = params.quotationTotal;
  const headline = q !== null ? `Current quotation total (if issued): ${money(q)}` : "Quotation pricing will be finalised after scope confirmation.";

  return [
    "Investment summary (client-facing):",
    `- Preliminary build estimate (from QS draft): ${money(qs)}`,
    `- FF&E allowance (if applicable): ${money(params.ffeTotal)}`,
    `- ${headline}`,
    "",
    "What this includes:",
    "- Works described in the design brief areas and preliminary BOQ drafts.",
    "",
    "What can change the budget:",
    "- Final measurements and site conditions",
    "- Material/brand selections and lead time constraints",
    "- Any variation or scope changes after approval",
    "",
    "How we protect your budget:",
    "- Clear scope definition and staged confirmations",
    "- Variation orders for changes before execution",
    "- Transparent documentation for progressive billing",
  ].join("\n");
}

function buildUpsellPitch(upsells: Array<{ title: string; pitchText: string | null }>): string {
  if (upsells.length === 0) {
    return [
      "Optional upgrades (if desired):",
      "- Smart home readiness (lighting / aircon / blinds)",
      "- Feature lighting & mood scenes",
      "- Storage optimisation and premium carpentry details",
    ].join("\n");
  }

  return [
    "Optional upgrades (recommended):",
    ...upsells.slice(0, 6).map((u) => `- ${u.title}: ${pickOrFallback(u.pitchText, "Optional enhancement to improve comfort and quality.")}`),
  ].join("\n");
}

function buildWhyChooseUs(params: { companyName: string }): string {
  return [
    `Why choose ${params.companyName}:`,
    "- Clear scope definition with structured change control",
    "- Dedicated design + QS + project management workflow",
    "- Progressive billing transparency and documentation",
    "- Warranty/defects support and handover controls",
    "",
    "Our commitment:",
    "- Design with buildability in mind to reduce surprises during execution.",
    "- Communicate clearly via documented correspondence and agreed milestones.",
    "- Deliver a refined finish with practical details that last.",
  ].join("\n");
}

function buildNextSteps(): string {
  return [
    "Next steps:",
    "1. Confirm scope and preferred design direction (areas, themes, materials).",
    "2. Finalise measurements and site conditions.",
    "3. Align the BOQ and convert to official quotation for final pricing (including GST where applicable).",
    "4. Review and approve the quotation; proceed to contract signing.",
    "5. Schedule mobilisation and project start date.",
  ].join("\n");
}

export async function generatePresentationNarrative(params: {
  designBriefId: string;
}): Promise<GeneratedPresentationNarrative> {
  const brief = await prisma.designBrief.findUnique({
    where: { id: params.designBriefId },
    include: {
      project: { include: { client: true } },
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          qsBoqDraftItems: { select: { sellingTotal: true } },
          ffeProposals: { select: { unitPrice: true, quantity: true } },
        },
      },
      upsellRecommendations: { orderBy: [{ priority: "desc" }, { createdAt: "desc" }], take: 20 },
    },
  });
  if (!brief) throw new Error("Design brief not found.");

  const projectName = brief.project?.name ?? "Project";
  const address = brief.project?.siteAddress || brief.project?.addressLine1 || "-";
  const branding = await getCompanyBranding();
  const companyName = branding.companyName;

  const qsSellingTotal = brief.areas.reduce(
    (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, i) => s2 + Number(i.sellingTotal), 0),
    0,
  );
  const ffeTotal = brief.areas.reduce(
    (sum, a) => sum + a.ffeProposals.reduce((s2, p) => s2 + Number(p.unitPrice) * Number(p.quantity), 0),
    0,
  );

  const quotation = brief.projectId
    ? await prisma.quotation.findFirst({
        where: { projectId: brief.projectId, isLatest: true },
        orderBy: [{ createdAt: "desc" }],
        select: { totalAmount: true },
      })
    : null;

  const upsells = brief.upsellRecommendations.filter((u) => u.status !== "REJECTED");

  const intro = buildDesignConcept({
    clientNeeds: brief.clientNeeds,
    designStyle: (brief.designStyle as unknown as string) ?? null,
    propertyType: (brief.propertyType as unknown as string) ?? "RESIDENTIAL",
    projectName,
    address,
    companyName,
  });

  const roomNarrative = buildRoomNarrative(
    brief.areas.map((a) => ({
      name: a.name,
      roomType: String(a.roomType),
      clientRequirement: a.clientRequirement ?? null,
      proposedTheme: a.proposedTheme ?? null,
      proposedLayoutNotes: a.proposedLayoutNotes ?? null,
      proposedMaterials: a.proposedMaterials ?? null,
    })),
  );

  const materialExplanation = buildMaterialsExplanation(
    brief.areas.map((a) => ({ proposedMaterials: a.proposedMaterials ?? null, proposedTheme: a.proposedTheme ?? null })),
  );

  const budgetExplanation = buildBudgetExplanation({
    qsSellingTotal,
    quotationTotal: quotation?.totalAmount !== null && quotation?.totalAmount !== undefined ? Number(quotation.totalAmount) : null,
    ffeTotal,
  });

  const upsellPitch = buildUpsellPitch(upsells.map((u) => ({ title: u.title, pitchText: u.pitchText ?? null })));
  const whyChoose = buildWhyChooseUs({ companyName });
  const nextSteps = buildNextSteps();

  return {
    introductionText: intro,
    roomNarrativeText: roomNarrative,
    materialExplanationText: materialExplanation,
    budgetExplanationText: budgetExplanation,
    upsellPitchText: upsellPitch,
    whyChooseUsText: whyChoose,
    nextStepsText: nextSteps,
  };
}

export async function applyPresentationNarrative(params: {
  designBriefId: string;
  overwrite?: boolean;
  actorUserId?: string | null;
}): Promise<{ ok: true; presentationId: string }> {
  const overwrite = Boolean(params.overwrite);

  const brief = await prisma.designBrief.findUnique({
    where: { id: params.designBriefId },
    include: { project: { include: { client: true } }, presentation: true },
  });
  if (!brief) throw new Error("Design brief not found.");

  const generated = await generatePresentationNarrative({ designBriefId: params.designBriefId });

  const title = brief.presentation?.title ?? `${brief.project?.name ?? "Project"} Presentation`;
  const addressedTo = brief.presentation?.addressedTo ?? (brief.project?.client?.name ?? brief.project?.clientName ?? "Client");

  const existing = brief.presentation;
  const data: Prisma.ClientPresentationUpsertArgs["create"] & Prisma.ClientPresentationUpsertArgs["update"] = {
    designBriefId: brief.id,
    title,
    addressedTo,
    presentationDate: existing?.presentationDate ?? null,
    introductionText: overwrite ? generated.introductionText : (existing?.introductionText?.trim() ? existing.introductionText : generated.introductionText),
    roomNarrativeText: overwrite ? generated.roomNarrativeText : (existing?.roomNarrativeText?.trim() ? existing.roomNarrativeText : generated.roomNarrativeText),
    materialExplanationText: overwrite ? generated.materialExplanationText : (existing?.materialExplanationText?.trim() ? existing.materialExplanationText : generated.materialExplanationText),
    budgetExplanationText: overwrite ? generated.budgetExplanationText : (existing?.budgetExplanationText?.trim() ? existing.budgetExplanationText : generated.budgetExplanationText),
    upsellPitchText: overwrite ? generated.upsellPitchText : (existing?.upsellPitchText?.trim() ? existing.upsellPitchText : generated.upsellPitchText),
    whyChooseUsText: overwrite ? generated.whyChooseUsText : (existing?.whyChooseUsText?.trim() ? existing.whyChooseUsText : generated.whyChooseUsText),
    nextStepsText: overwrite ? generated.nextStepsText : (existing?.nextStepsText?.trim() ? existing.nextStepsText : generated.nextStepsText),
    teamIntroduction: existing?.teamIntroduction ?? null,
    companyPortfolioText: existing?.companyPortfolioText ?? null,
    fileUrl: existing?.fileUrl ?? null,
    status: existing?.status ?? "DRAFT",
  } as any;

  const upserted = await prisma.clientPresentation.upsert({
    where: { designBriefId: brief.id },
    create: data as any,
    update: data as any,
    select: { id: true },
  });

  return { ok: true, presentationId: upserted.id };
}
