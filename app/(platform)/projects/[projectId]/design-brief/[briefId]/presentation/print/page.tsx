import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getCompanyBranding } from "@/lib/branding";
import { ProposalPresentation, type ProposalPresentationData } from "@/app/components/proposal/proposal-presentation";
import { ProposalSection } from "@/app/components/proposal/proposal-section";

export const dynamic = "force-dynamic";

function formatLongDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "long", day: "2-digit" }).format(value);
}

function formatShortDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function PresentationPrintPage(props: {
  params: Promise<{ projectId: string; briefId: string }>;
}) {
  const { projectId, briefId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const branding = await getCompanyBranding();

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    include: {
      project: { include: { client: true } },
      presentation: true,
      budgetOptimizationScenarios: { orderBy: [{ createdAt: "desc" }], take: 10 },
      upsellRecommendations: { orderBy: [{ priority: "desc" }, { createdAt: "desc" }], take: 20 },
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          layoutPlans: { orderBy: [{ createdAt: "desc" }] },
          generatedLayoutPlans: { orderBy: [{ createdAt: "desc" }] },
          visualRenders: { orderBy: [{ createdAt: "desc" }] },
          ffeProposals: { orderBy: [{ createdAt: "desc" }] },
          qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }] },
        },
      },
    },
  });

  if (!brief || brief.projectId !== projectId) notFound();

  const presentation = brief.presentation;

  const addressedTo =
    presentation?.addressedTo ??
    brief.project?.client?.name ??
    brief.project?.clientName ??
    "Client";

  const projectName = brief.project?.name ?? "Project";
  const projectAddress = brief.project?.siteAddress || brief.project?.addressLine1 || "-";

  const heroImageUrl =
    brief.areas
      .flatMap((a) => a.visualRenders)
      .map((v) => v.generatedImageUrl || v.generatedImageUrl || v.fileUrl)
      .find((u): u is string => Boolean(u && u.trim())) ?? null;

  const boqRows = brief.areas.map((a) => {
    const sellingTotal = a.qsBoqDraftItems.reduce((s, i) => s + Number(i.sellingTotal), 0);
    return { id: a.id, name: a.name, roomType: String(a.roomType), sellingTotal };
  });

  const preliminaryBuild = boqRows.reduce((s, r) => s + r.sellingTotal, 0);
  const ffeAllowance = brief.areas.reduce(
    (sum, a) => sum + a.ffeProposals.reduce((s2, p) => s2 + Number(p.unitPrice) * Number(p.quantity), 0),
    0,
  );

  const latestQuotation = brief.projectId
    ? await prisma.quotation.findFirst({
        where: { projectId: brief.projectId, isLatest: true },
        orderBy: [{ createdAt: "desc" }],
        select: { totalAmount: true },
      })
    : null;

  const areas = brief.areas.map((a) => {
    const selectedLayout =
      a.generatedLayoutPlans.find((p) => p.isSelected) ??
      a.layoutPlans[0] ??
      a.generatedLayoutPlans[0] ??
      null;

    const visuals = a.visualRenders
      .map((v) => ({
        url: (v.generatedImageUrl || v.fileUrl || "").trim(),
        caption: v.title || null,
      }))
      .filter((x) => Boolean(x.url));

    return {
      id: a.id,
      name: a.name,
      roomType: String(a.roomType),
      clientRequirement: a.clientRequirement ?? null,
      proposedTheme: a.proposedTheme ?? null,
      proposedLayoutNotes: a.proposedLayoutNotes ?? null,
      proposedMaterials: a.proposedMaterials ?? null,
      layoutTitle: selectedLayout ? selectedLayout.title : null,
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

  const data: ProposalPresentationData = {
    branding,
    title: presentation?.title ?? `${projectName} Proposal`,
    subtitle: `Interior design proposal · ${String(brief.propertyType)} · ${String(brief.designStyle ?? "STYLE")}`,
    addressedTo,
    projectName,
    projectAddress,
    dateLabel: formatLongDate(presentation?.presentationDate ?? new Date()),
    heroImageUrl,
    designConceptText: presentation?.introductionText ?? brief.clientNeeds,
    roomNarrativeText: presentation?.roomNarrativeText ?? null,
    materialExplanationText: presentation?.materialExplanationText ?? null,
    budgetExplanationText: presentation?.budgetExplanationText ?? null,
    whyChooseUsText: presentation?.whyChooseUsText ?? null,
    upsellPitchText: presentation?.upsellPitchText ?? null,
    nextStepsText: presentation?.nextStepsText ?? null,
    areas,
    ffeItems,
    boqRows,
    preliminaryBuild,
    ffeAllowance,
    quotationTotal: latestQuotation?.totalAmount !== null && latestQuotation?.totalAmount !== undefined ? Number(latestQuotation.totalAmount) : null,
    includeWhyChooseUs: true,
  };

  return (
    <main className="printable min-h-screen bg-stone-50 px-4 py-10 text-neutral-900 sm:px-6">
      <style>{`
        @media print {
          html, body { background: #ffffff !important; }
          @page { size: A4; margin: 14mm; }
          .proposal-container { max-width: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <Link
          href={`/projects/${projectId}/design-brief/${briefId}/presentation`}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          Back
        </Link>
        <button
          type="button"
          onClick={() => globalThis.print?.()}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="proposal-container mx-auto max-w-6xl space-y-8">
        <ProposalPresentation data={data} mode="print" />

        <ProposalSection eyebrow="Project info" title="Project information" subtitle="Reference details for your review." avoidBreakInside>
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Client" value={brief.project?.client?.name ?? brief.project?.clientName ?? "-"} />
            <Info label="Email" value={brief.project?.client?.email ?? brief.project?.clientEmail ?? "-"} />
            <Info label="Phone" value={brief.project?.client?.phone ?? brief.project?.clientPhone ?? "-"} />
            <Info label="Site address" value={projectAddress} />
          </div>
          <div className="mt-5 rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Client brief</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{brief.clientNeeds}</p>
          </div>
        </ProposalSection>

        {presentation?.teamIntroduction?.trim() ? (
          <ProposalSection eyebrow="Team" title="Your project team" subtitle="A structured workflow that supports design, costing and delivery." avoidBreakInside>
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{presentation.teamIntroduction}</p>
          </ProposalSection>
        ) : null}

        {presentation?.companyPortfolioText?.trim() ? (
          <ProposalSection eyebrow="Portfolio" title="Selected experience" subtitle="A brief snapshot of the work we deliver." avoidBreakInside>
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{presentation.companyPortfolioText}</p>
          </ProposalSection>
        ) : null}

        <footer className="rounded-[26px] border border-slate-200/80 bg-white px-10 py-8 text-sm text-neutral-700 shadow-sm [break-inside:avoid]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold text-neutral-950">{branding.companyName}</p>
            <p className="text-xs text-neutral-600">
              Prepared on {formatShortDate(new Date())} · {branding.website}
            </p>
          </div>
          <div className="mt-4 grid gap-2 text-xs leading-6 text-neutral-600">
            <p>
              This document is provided for discussion and scope alignment. Final deliverables, timeline, and pricing are confirmed via quotation acceptance and signed contract.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
