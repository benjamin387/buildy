import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPortalProject } from "@/lib/client-portal/auth";
import { getCompanyBranding } from "@/lib/branding";
import { ProposalPresentation, type ProposalPresentationData } from "@/app/components/proposal/proposal-presentation";

export const dynamic = "force-dynamic";

function formatLongDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "long", day: "2-digit" }).format(value);
}

export default async function ClientPortalPresentationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireClientPortalProject({ projectId });

  const branding = await getCompanyBranding();

  // Client presentation is rendered from the latest design brief for the project.
  const brief = await prisma.designBrief.findFirst({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      project: { include: { client: true } },
      presentation: true,
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          layoutPlans: { orderBy: [{ createdAt: "desc" }], take: 1 },
          visualRenders: { orderBy: [{ createdAt: "desc" }], take: 1 },
          ffeProposals: { orderBy: [{ createdAt: "desc" }], take: 100 },
          qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }], take: 2000 },
        },
      },
    },
  });
  if (!brief) notFound();

  const title = brief.presentation?.title ?? `${brief.project?.name ?? "Project"} Presentation`;
  const clientName = brief.presentation?.addressedTo ?? brief.project?.client?.name ?? brief.project?.clientName ?? "Client";
  const projectName = brief.project?.name ?? "Project";
  const projectAddress = brief.project?.siteAddress || brief.project?.addressLine1 || "-";

  // Client-safe: show selling totals only (no internal cost/profit).
  const preliminaryBuild = brief.areas.reduce(
    (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, i) => s2 + Number(i.sellingTotal), 0),
    0,
  );
  const ffeAllowance = brief.areas.reduce(
    (sum, a) => sum + a.ffeProposals.reduce((s2, p) => s2 + Number(p.unitPrice) * Number(p.quantity), 0),
    0,
  );

  const areas = brief.areas.map((a) => {
    const layoutTitle = a.layoutPlans[0]?.title ?? null;
    const visual = a.visualRenders[0];
    const imageUrl = (visual?.generatedImageUrl || visual?.fileUrl || "").trim();
    const visuals = imageUrl ? [{ url: imageUrl, caption: visual?.title ?? null }] : [];

    return {
      id: a.id,
      name: a.name,
      roomType: String(a.roomType),
      clientRequirement: a.clientRequirement ?? null,
      proposedTheme: a.proposedTheme ?? null,
      proposedLayoutNotes: a.proposedLayoutNotes ?? null,
      proposedMaterials: a.proposedMaterials ?? null,
      layoutTitle,
      visuals,
    };
  });

  const ffeItems = brief.areas.flatMap((a) =>
    a.ffeProposals.map((p) => ({
      areaName: a.name,
      title: p.title,
      description: p.description ?? null,
      supplierName: p.supplierName ?? null,
      purchaseUrl: p.purchaseUrl ?? null,
      unitPrice: Number(p.unitPrice),
      quantity: Number(p.quantity),
      leadTimeDays: p.leadTimeDays ?? null,
      availabilityStatus: p.availabilityStatus ?? null,
      remarks: p.remarks ?? null,
    })),
  );

  const boqRows = brief.areas.map((a) => ({
    id: a.id,
    name: a.name,
    roomType: String(a.roomType),
    sellingTotal: a.qsBoqDraftItems.reduce((s, i) => s + Number(i.sellingTotal), 0),
  }));

  const heroImageUrl =
    areas
      .flatMap((a) => a.visuals)
      .map((v) => v.url)
      .find((u) => Boolean(u && u.trim())) ?? null;

  const data: ProposalPresentationData = {
    branding,
    title,
    subtitle: `Design presentation · ${String(brief.propertyType)} · ${String(brief.designStyle ?? "STYLE")}`,
    addressedTo: clientName,
    projectName,
    projectAddress,
    dateLabel: formatLongDate(brief.presentation?.presentationDate ?? new Date()),
    heroImageUrl,
    designConceptText: brief.presentation?.introductionText ?? brief.clientNeeds,
    roomNarrativeText: brief.presentation?.roomNarrativeText ?? null,
    materialExplanationText: brief.presentation?.materialExplanationText ?? null,
    budgetExplanationText: brief.presentation?.budgetExplanationText ?? null,
    whyChooseUsText: brief.presentation?.whyChooseUsText ?? null,
    upsellPitchText: brief.presentation?.upsellPitchText ?? null,
    nextStepsText: brief.presentation?.nextStepsText ?? null,
    areas,
    ffeItems,
    boqRows,
    preliminaryBuild,
    ffeAllowance,
    quotationTotal: null,
    includeWhyChooseUs: true,
    primaryCta: { label: "Review Quotation", href: `/client/portal/projects/${projectId}/quotation` },
    secondaryCta: { label: "Contact Designer", href: `mailto:${branding.contactEmail}?subject=${encodeURIComponent(`${projectName} — Presentation feedback`)}` },
  };

  return (
    <main className="space-y-6">
      <ProposalPresentation data={data} mode="portal" />
    </main>
  );
}
