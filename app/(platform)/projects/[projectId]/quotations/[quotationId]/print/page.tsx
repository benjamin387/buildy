import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { ProposalCoverPage } from "@/app/components/proposal/proposal-cover-page";
import { ProposalImageGrid } from "@/app/components/proposal/proposal-image-grid";
import { ProposalSection } from "@/app/components/proposal/proposal-section";
import { getCompanyBranding } from "@/lib/branding";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PrintButton } from "./print-button";

const PALETTE_SWATCHES = ["#F4EFE8", "#D9CBB9", "#B89F85", "#D7D4CF", "#8A857E", "#ECE6DD"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: 2,
  }).format(value);
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function splitIntoPhrases(...values: Array<string | null | undefined>): string[] {
  const phrases = values
    .flatMap((value) => (value ?? "").split(/\n|;|,|•/g))
    .map((value) => value.trim())
    .filter((value) => value.length > 2 && value.length <= 80);

  return Array.from(new Set(phrases));
}

export default async function PrintQuotationPage({
  params,
}: {
  params: Promise<{ projectId: string; quotationId: string }>;
}) {
  const { projectId, quotationId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const branding = await getCompanyBranding();

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      designBrief: {
        include: {
          presentation: true,
          concepts: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          boqs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              items: {
                orderBy: [{ room: "asc" }, { totalSellingPrice: "desc" }, { sortOrder: "asc" }],
                take: 20,
              },
            },
          },
          areas: {
            orderBy: [{ createdAt: "asc" }],
            include: {
              layoutPlans: { orderBy: [{ createdAt: "desc" }], take: 1 },
              generatedLayoutPlans: { orderBy: [{ isSelected: "desc" }, { createdAt: "desc" }], take: 2 },
              visualRenders: { orderBy: [{ isSelected: "desc" }, { createdAt: "desc" }], take: 4 },
            },
          },
        },
      },
    },
  });

  if (!quotation || quotation.projectId !== projectId) notFound();

  const latestConcept = quotation.designBrief?.concepts[0] ?? null;
  const latestBoq = quotation.designBrief?.boqs[0] ?? null;
  const presentation = quotation.designBrief?.presentation ?? null;
  const addressedTo =
    cleanText(quotation.contactPersonSnapshot) ??
    cleanText(quotation.clientNameSnapshot) ??
    "Client";
  const propertyLabel = formatEnum(String(quotation.propertyType));
  const projectAddress = [quotation.projectAddress1, quotation.projectAddress2, quotation.projectPostalCode]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(", ");

  const selectedLayouts = quotation.designBrief?.areas
    .map((area) => {
      const generatedLayout =
        area.generatedLayoutPlans.find((layout) => layout.isSelected) ?? area.generatedLayoutPlans[0] ?? null;
      const uploadedLayout = area.layoutPlans[0] ?? null;

      if (generatedLayout) {
        return {
          id: area.id,
          areaName: area.name,
          roomType: formatEnum(String(area.roomType)),
          title: generatedLayout.title,
          source: "Furniture layout",
          summary: generatedLayout.layoutSummary,
          notes: generatedLayout.circulationNotes,
        };
      }

      if (uploadedLayout) {
        return {
          id: area.id,
          areaName: area.name,
          roomType: formatEnum(String(area.roomType)),
          title: uploadedLayout.title,
          source: "Layout reference",
          summary: cleanText(uploadedLayout.description) ?? cleanText(uploadedLayout.generatedNotes) ?? "Layout plan uploaded to the project record.",
          notes: uploadedLayout.fileUrl ? "Source drawing is available in the linked project records." : null,
        };
      }

      return null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)) ?? [];
  const featuredLayouts = selectedLayouts.slice(0, 4);

  const perspectiveImages = Array.from(
    new Map(
      (quotation.designBrief?.areas ?? [])
        .flatMap((area) => {
          const preferredVisuals = area.visualRenders.filter((visual) =>
            Boolean((visual.generatedImageUrl || visual.fileUrl || "").trim()),
          );
          const selectedVisuals = preferredVisuals.filter((visual) => visual.isSelected);
          const visuals = (selectedVisuals.length ? selectedVisuals : preferredVisuals).slice(0, 2);

          return visuals.map((visual) => ({
            url: (visual.generatedImageUrl || visual.fileUrl || "").trim(),
            caption: `${area.name} · ${visual.title}`,
          }));
        })
        .map((image) => [image.url, image] as const),
    ).values(),
  );
  const featuredPerspectives = perspectiveImages.slice(0, 4);

  const conceptSummary =
    cleanText(presentation?.introductionText) ??
    cleanText(latestConcept?.conceptSummary) ??
    cleanText(quotation.notes) ??
    cleanText(quotation.sections.map((section) => section.description).find((value) => cleanText(value))) ??
    "This package consolidates the proposed spatial direction, finishes, and pricing priorities for review before contract confirmation.";

  const conceptHighlights = [
    { label: "Theme", value: cleanText(latestConcept?.theme) },
    { label: "Furniture direction", value: cleanText(latestConcept?.furnitureDirection) },
    { label: "Lighting", value: cleanText(latestConcept?.lightingPlan) },
    { label: "Renovation scope", value: cleanText(latestConcept?.renovationScope) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  const materialNarrative =
    cleanText(presentation?.materialExplanationText) ??
    cleanText(latestConcept?.materialPalette) ??
    cleanText(
      quotation.designBrief?.areas
        .map((area) => area.proposedMaterials)
        .find((value) => cleanText(value)),
    ) ??
    "Final material selections will be aligned to the approved concept, usage conditions, and quotation scope.";

  const paletteItems = splitIntoPhrases(
    latestConcept?.materialPalette,
    latestConcept?.theme,
    quotation.designBrief?.areas
      .map((area) => cleanText(area.proposedMaterials))
      .filter((value): value is string => Boolean(value))
      .join(", "),
  ).slice(0, 6);

  const boqItems =
    latestBoq?.items.length
      ? latestBoq.items
          .slice()
          .sort((left, right) => Number(right.totalSellingPrice) - Number(left.totalSellingPrice))
          .slice(0, 6)
          .map((item) => ({
            id: item.id,
            zone: item.room,
            category: item.category,
            description: item.description,
            quantity: Number(item.quantity),
            unit: item.unit,
            total: Number(item.totalSellingPrice),
          }))
      : quotation.sections
          .flatMap((section) =>
            section.lineItems.map((item) => ({
              id: item.id,
              zone: section.title,
              category: formatEnum(String(section.category)),
              description: item.description,
              quantity: Number(item.quantity),
              unit: item.unit,
              total: Number(item.totalPrice),
            })),
          )
          .sort((left, right) => right.total - left.total)
          .slice(0, 6);

  const workflowSteps = [
    {
      title: "Concept alignment",
      detail: "Confirm the preferred layout intent, key finishes, and priority spaces before technical detailing.",
    },
    {
      title: "Site verification",
      detail: "Validate measurements, existing conditions, and authority or building management requirements.",
    },
    {
      title: "Quotation lock",
      detail: "Finalize scope inclusions, top BOQ items, payment milestones, and commercial assumptions.",
    },
    {
      title: "Production planning",
      detail: "Release procurement, drawings, and sequencing for approved carpentry, finishes, and site works.",
    },
    {
      title: "Execution",
      detail: "Coordinate installation, quality checks, and final handover against the approved concept package.",
    },
  ];

  const nextSteps = [
    "Review the concept direction, furniture layouts, and perspective references in this package.",
    "Confirm scope priorities, allowances, and any requested adjustments to the quotation.",
    "Approve the quotation to proceed to contract preparation, procurement planning, and project scheduling.",
  ];

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-neutral-900 sm:px-6 print:px-0 print:py-0">
      <style>{`
        @media print {
          html, body { background: #ffffff !important; }
          @page { size: A4; margin: 14mm; }
          .no-print { display: none !important; }
          .proposal-container { max-width: none !important; }
          .page-break { break-before: page; page-break-before: always; }
        }
      `}</style>

      <div className="no-print mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <Link
          href={`/projects/${projectId}/quotations/${quotationId}`}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          Back
        </Link>
        <PrintButton />
      </div>

      <div className="proposal-container mx-auto max-w-6xl space-y-8">
        <ProposalCoverPage
          branding={branding}
          title={`${quotation.projectNameSnapshot} Concept Package`}
          subtitle={`Quotation ${quotation.quotationNumber} · ${propertyLabel}${quotation.unitSizeSqft ? ` · ${formatQuantity(Number(quotation.unitSizeSqft))} sqft` : ""}`}
          addressedTo={addressedTo}
          projectName={quotation.projectNameSnapshot}
          projectAddress={projectAddress || "-"}
          dateLabel={formatDate(quotation.issueDate)}
          heroImageUrl={featuredPerspectives[0]?.url ?? null}
          footerLeft={<span>Quotation package · Premium concept presentation</span>}
          footerRight={<span>{quotation.quotationNumber}</span>}
          className="shadow-[0_1px_0_rgba(16,24,40,0.04),0_18px_46px_rgba(16,24,40,0.08)]"
        />

        <div className="space-y-8">
          {featuredLayouts.length > 0 ? (
            <ProposalSection
              eyebrow="Furniture layout"
              title="Furniture layout and spatial planning"
              subtitle="Selected room-by-room layouts that anchor circulation, furniture placement, and practical build coordination."
            >
              <div className="grid gap-4 md:grid-cols-2">
                {featuredLayouts.map((layout) => (
                  <article key={layout.id} className="rounded-[22px] border border-slate-200 bg-stone-50 px-5 py-5 [break-inside:avoid]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{layout.roomType}</p>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight text-neutral-950" style={{ fontFamily: "var(--font-display)" }}>
                          {layout.areaName}
                        </h3>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-600">
                        {layout.source}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-neutral-950">{layout.title}</p>
                    <p className="mt-3 text-sm leading-7 text-neutral-800">{layout.summary}</p>
                    {layout.notes ? <p className="mt-3 text-xs leading-6 text-neutral-600">{layout.notes}</p> : null}
                  </article>
                ))}
              </div>
              {selectedLayouts.length > featuredLayouts.length ? (
                <p className="mt-5 text-xs leading-6 text-neutral-600">
                  Additional layout references are available in the linked design brief and project records.
                </p>
              ) : null}
            </ProposalSection>
          ) : null}

          <ProposalSection
            eyebrow="Concept summary"
            title="A refined concept direction aligned to the quotation"
            subtitle="This summary captures the design intent, visual mood, and practical priorities behind the proposed works."
          >
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{conceptSummary}</p>
            {conceptHighlights.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {conceptHighlights.map((highlight) => (
                  <div key={highlight.label} className="rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{highlight.label}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{highlight.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </ProposalSection>
        </div>

        <div className="page-break space-y-8">
          <ProposalSection
            eyebrow="Perspectives"
            title="Perspective references"
            subtitle="Selected visuals to communicate atmosphere, joinery intent, and room character before detailed production coordination."
          >
            {featuredPerspectives.length > 0 ? (
              <ProposalImageGrid images={featuredPerspectives} columns={2} />
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-stone-50 px-6 py-10 text-sm leading-7 text-neutral-700">
                Perspective visuals have not been attached yet. This package can still be reviewed for concept direction, furniture layout, and commercial scope.
              </div>
            )}
          </ProposalSection>
        </div>

        <div className="page-break space-y-8">
          <ProposalSection
            eyebrow="Palette"
            title="Material and color palette"
            subtitle="A coordinated set of finishes and tonal cues to maintain consistency across the proposed spaces."
          >
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{materialNarrative}</p>
            {paletteItems.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paletteItems.map((item, index) => (
                  <div key={`${item}-${index}`} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
                    <div className="h-24 w-full border-b border-slate-200" style={{ backgroundColor: PALETTE_SWATCHES[index % PALETTE_SWATCHES.length] }} />
                    <div className="px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Palette note</p>
                      <p className="mt-2 text-sm font-semibold text-neutral-900">{item}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </ProposalSection>

          <ProposalSection
            eyebrow="BOQ summary"
            title="Top BOQ items"
            subtitle="A focused summary of the highest-value scope items currently driving the quotation."
            avoidBreakInside
          >
            <div className="overflow-hidden rounded-[22px] border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-white text-neutral-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Zone</th>
                    <th className="px-4 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">Item</th>
                    <th className="px-4 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em]">Qty</th>
                    <th className="px-4 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {boqItems.map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-4 py-4 align-top">
                        <p className="font-semibold text-neutral-950">{item.zone}</p>
                        <p className="mt-1 text-xs text-neutral-500">{item.category}</p>
                      </td>
                      <td className="px-4 py-4 align-top text-neutral-800">{item.description}</td>
                      <td className="px-4 py-4 text-right align-top text-neutral-700">
                        {formatQuantity(item.quantity)} {item.unit}
                      </td>
                      <td className="px-4 py-4 text-right align-top font-semibold text-neutral-950">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ProposalSection>
        </div>

        <div className="page-break space-y-8">
          <ProposalSection
            eyebrow="Pricing"
            title="Pricing summary"
            subtitle="A concise commercial snapshot for sign-off discussions and final alignment."
            avoidBreakInside
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Subtotal" value={formatCurrency(Number(quotation.subtotal))} />
              <MetricTile label="Discount" value={formatCurrency(Number(quotation.discountAmount))} />
              <MetricTile label="GST" value={formatCurrency(Number(quotation.gstAmount))} />
              <MetricTile label="Quotation total" value={formatCurrency(Number(quotation.totalAmount))} emphasize />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <InfoTile label="Client" value={quotation.clientNameSnapshot} />
              <InfoTile label="Property" value={propertyLabel} />
              <InfoTile label="Validity" value={`${quotation.validityDays ?? 14} days`} />
            </div>

            {quotation.paymentTermsV2.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {quotation.paymentTermsV2.map((term) => (
                  <div key={term.id} className="rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Milestone</p>
                        <p className="mt-2 text-sm font-semibold text-neutral-950">{term.title}</p>
                      </div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {term.amount === null ? "-" : formatCurrency(Number(term.amount))}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs leading-6 text-neutral-600">
                      <p>Percent: {term.percent === null ? "-" : `${Number(term.percent).toFixed(2)}%`}</p>
                      <p>Trigger: {term.triggerType ?? "-"}</p>
                      <p>Due: {term.dueDays === null ? "-" : `${term.dueDays} day(s)`}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : quotation.paymentTerms ? (
              <div className="mt-6 rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Payment terms</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{quotation.paymentTerms}</p>
              </div>
            ) : null}
          </ProposalSection>

          <ProposalSection
            eyebrow="Workflow"
            title="Renovation workflow"
            subtitle="A structured sequence from approval through execution, designed to reduce ambiguity across design and build coordination."
          >
            <div className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <article key={step.title} className="rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-5 [break-inside:avoid]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Step {index + 1}</p>
                  <h3 className="mt-2 text-base font-semibold text-neutral-950">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-800">{step.detail}</p>
                </article>
              ))}
            </div>
          </ProposalSection>

          <ProposalSection
            eyebrow="Closing"
            title="Closing and next steps"
            subtitle="The package is intended to help close design direction and move smoothly into commercial confirmation."
            avoidBreakInside
          >
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">
              {cleanText(presentation?.nextStepsText) ??
                cleanText(quotation.notes) ??
                "Once the preferred concept direction is confirmed, we will align final scope adjustments, lock payment milestones, and prepare the contract package for commencement."}
            </p>

            <ol className="mt-6 grid gap-3 text-sm leading-7 text-neutral-800">
              {nextSteps.map((step, index) => (
                <li key={step}>
                  <span className="font-semibold">{index + 1}. </span>
                  {step}
                </li>
              ))}
            </ol>

            {quotation.exclusions ? (
              <div className="mt-6 rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Key exclusions</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{quotation.exclusions}</p>
              </div>
            ) : null}
          </ProposalSection>
        </div>
      </div>
    </main>
  );
}

function MetricTile(props: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div
      className={`rounded-[22px] border px-5 py-5 shadow-sm ${
        props.emphasize ? "border-neutral-950 bg-neutral-950 text-white" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.22em] ${
          props.emphasize ? "text-white/70" : "text-neutral-500"
        }`}
      >
        {props.label}
      </p>
      <p
        className={`mt-3 text-xl font-semibold tracking-tight tabular-nums ${
          props.emphasize ? "text-white" : "text-neutral-950"
        }`}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {props.value}
      </p>
    </div>
  );
}

function InfoTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-stone-50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-sm font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
