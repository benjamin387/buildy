import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  FLOOR_PLAN_PERSPECTIVE_STYLES,
  generateMockCabinetDesignPackage,
  generateMockFurnitureLayout,
  generateMockPerspectiveConceptPackage,
  getMockFloorPlanById,
  type FloorPlanCabinetDesign,
  type FloorPlanCabinetInstallationNote,
  type FloorPlanCabinetMaterialSummaryItem,
  type FloorPlanPerspectiveConcept,
  type FloorPlanPerspectiveStyle,
  type FloorPlanStatus,
} from "@/lib/design-ai/floor-plan-engine";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { LinkButton } from "@/app/(platform)/design-ai/floor-plans/_components/link-button";

export default async function FloorPlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const plan = getMockFloorPlanById(id);

  if (!plan) notFound();

  const generateFurnitureLayoutParam = resolvedSearchParams?.generateFurnitureLayout;
  const showFurnitureLayout = hasEnabledFlag(generateFurnitureLayoutParam);
  const furnitureLayout = showFurnitureLayout ? generateMockFurnitureLayout(plan) : null;
  const totalFurnitureLayoutItems =
    furnitureLayout?.sections.reduce((total, section) => total + section.items.length, 0) ?? 0;
  const generateCabinetDesignParam = resolvedSearchParams?.generateCabinetDesign;
  const showCabinetDesign = hasEnabledFlag(generateCabinetDesignParam);
  const cabinetDesignPackage = showCabinetDesign ? generateMockCabinetDesignPackage(plan) : null;
  const totalCabinetProductionQuantity =
    cabinetDesignPackage?.productionList.reduce((total, item) => total + item.quantity, 0) ?? 0;
  const generatePerspectivePackageParam = resolvedSearchParams?.generate3dPerspectives;
  const showPerspectivePackage = hasEnabledFlag(generatePerspectivePackageParam);
  const selectedPerspectiveStyle = resolvePerspectiveStyle(
    resolvedSearchParams?.perspectiveStyle,
  );
  const perspectivePackage = showPerspectivePackage
    ? generateMockPerspectiveConceptPackage(plan, selectedPerspectiveStyle)
    : null;

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title={plan.projectName}
        subtitle={plan.summary}
        backHref="/design-ai/floor-plans"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone(plan.status)}>{formatStatus(plan.status)}</StatusPill>
            <LinkButton href="/design-ai/floor-plans/new" variant="secondary">
              New Upload
            </LinkButton>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Detected Rooms" value={String(plan.roomDetections.length)} subtitle="Layout summary coverage" />
        <MetricCard title="Furniture Keys" value={String(plan.furnitureLegend.length)} subtitle="Legend placement markers" />
        <MetricCard title="Palette Items" value={String(plan.palette.length)} subtitle="Color and material directions" />
        <MetricCard title="Workflow Steps" value={String(plan.workflowSteps.length)} subtitle="Renovation sequencing" />
      </section>

      <SectionCard title="Plan Overview" description="Mock project metadata and readiness summary for the current floor plan.">
        <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <InfoLine label="Client" value={plan.clientName} />
          <InfoLine label="Property Type" value={plan.propertyType} />
          <InfoLine label="Site" value={plan.siteLabel} />
          <InfoLine label="Source File" value={plan.sourceFileName} />
          <InfoLine label="Floor Area" value={plan.floorArea} />
          <InfoLine label="Last Analyzed" value={formatDate(plan.lastAnalyzedAt)} />
          <InfoLine label="Readiness" value={plan.readinessNote} className="xl:col-span-2" />
        </div>
      </SectionCard>

      <SectionCard
        title="Furniture Placement Engine"
        description="Generate a mock concept-package furniture layout with numbered legend items, room grouping, clearance guidance, and handoff notes."
        actions={
          <LinkButton
            href={buildFloorPlanDetailHref({
              id: plan.id,
              showFurnitureLayout: true,
              showCabinetDesign,
              showPerspectivePackage,
              perspectiveStyle: selectedPerspectiveStyle,
            })}
          >
            {showFurnitureLayout ? "Regenerate Furniture Layout" : "Generate Furniture Layout"}
          </LinkButton>
        }
      >
        {!furnitureLayout ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
            <p className="text-sm font-medium text-neutral-900">
              Use the generator to create a room-grouped furniture layout with numbered legend entries,
              placement reasoning, clearance checks, and designer or QS notes.
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              The output is mock-only and stays within the current floor plan module for UI and workflow
              validation.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Design Rules
                </p>
                <div className="mt-4 space-y-3">
                  {furnitureLayout.designRules.map((rule, index) => (
                    <div
                      key={rule}
                      className="flex gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-neutral-950">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-neutral-700">{rule}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Layout Summary
                </p>
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <InfoLine label="Legend Items" value={String(totalFurnitureLayoutItems)} />
                  <InfoLine label="Room Groups" value={String(furnitureLayout.sections.length)} />
                  <InfoLine label="Plan" value={plan.projectName} />
                  <InfoLine label="Status" value={formatStatus(plan.status)} />
                </div>
              </article>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {furnitureLayout.sections.map((section) => (
                <article
                  key={section.key}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-black/5"
                >
                  <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          Room Group
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-neutral-950">{section.title}</h3>
                      </div>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                        {section.items.length} layout item{section.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 px-5 py-5">
                    {section.items.map((item) => (
                      <article
                        key={`${section.key}-${item.legendNumber}-${item.furnitureItem}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex gap-4">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-neutral-950">
                            {item.legendNumber}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                                  {item.roomName}
                                </p>
                                <h4 className="mt-1 text-base font-semibold text-neutral-950">
                                  {item.furnitureItem}
                                </h4>
                              </div>
                              <p className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-600">
                                {item.dimensionsEstimate}
                              </p>
                            </div>

                            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                              <DetailPanel label="Placement Reason" value={item.placementReason} />
                              <DetailPanel label="Clearance Note" value={item.clearanceNote} />
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <NotesPanel title="Designer Notes" notes={furnitureLayout.designerNotes} />
              <NotesPanel title="QS Notes" notes={furnitureLayout.qsNotes} />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cabinet Design + Production Engine"
        description="Generate mock cabinet zoning, production rows, material usage, and installation notes for designer-to-workshop coordination."
        actions={
          <LinkButton
            href={buildFloorPlanDetailHref({
              id: plan.id,
              showFurnitureLayout,
              showCabinetDesign: true,
              showPerspectivePackage,
              perspectiveStyle: selectedPerspectiveStyle,
            })}
          >
            {showCabinetDesign ? "Regenerate Cabinet Design" : "Generate Cabinet Design"}
          </LinkButton>
        }
      >
        {!cabinetDesignPackage ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
            <p className="text-sm font-medium text-neutral-900">
              Generate cabinet zones for the TV feature wall, kitchen top and bottom cabinets,
              wardrobe, storage cabinets, and bathroom vanity.
            </p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              The output stays mock-only and focuses on production-ready fields: location, purpose,
              dimensions, materials, finish color, internal layout, panel lists, and installation
              tolerances.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
              <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Cabinet Package Summary
                </p>
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <InfoLine
                    label="Cabinet Zones"
                    value={String(cabinetDesignPackage.cabinets.length)}
                  />
                  <InfoLine
                    label="Production Rows"
                    value={String(cabinetDesignPackage.productionList.length)}
                  />
                  <InfoLine
                    label="Material Groups"
                    value={String(cabinetDesignPackage.materialSummary.length)}
                  />
                  <InfoLine
                    label="Estimated Qty"
                    value={String(totalCabinetProductionQuantity)}
                  />
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Production Scope
                </p>
                <p className="mt-4 text-sm leading-6 text-neutral-700">
                  Use this cabinet package to brief workshop detailing, confirm material direction,
                  and lock installation sequencing before live shop drawings replace the mock data.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {cabinetDesignPackage.cabinets.map((cabinet) => (
                    <span
                      key={cabinet.title}
                      className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700"
                    >
                      {cabinet.title}
                    </span>
                  ))}
                </div>
              </article>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {cabinetDesignPackage.cabinets.map((cabinet) => (
                <CabinetDesignCard key={cabinet.key} cabinet={cabinet} />
              ))}
            </div>

            <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Production List
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-neutral-950">
                    Panel and Hardware Breakdown
                  </h3>
                </div>
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                  {cabinetDesignPackage.productionList.length} rows
                </span>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                      <th className="py-3 pr-4">Zone</th>
                      <th className="py-3 pr-4">Panel Type</th>
                      <th className="py-3 pr-4">Thickness</th>
                      <th className="py-3 pr-4">Dimensions (L x W)</th>
                      <th className="py-3 pr-4">Qty</th>
                      <th className="py-3 pr-4">Edging</th>
                      <th className="py-3">Hardware</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cabinetDesignPackage.productionList.map((item) => (
                      <tr key={`${item.cabinetTitle}-${item.panelType}`}>
                        <td className="py-3 pr-4 font-medium text-neutral-900">{item.cabinetTitle}</td>
                        <td className="py-3 pr-4 text-neutral-700">{item.panelType}</td>
                        <td className="py-3 pr-4 text-neutral-700">{item.thickness}</td>
                        <td className="py-3 pr-4 text-neutral-700">{item.dimensions}</td>
                        <td className="py-3 pr-4 text-neutral-700">{item.quantity}</td>
                        <td className="py-3 pr-4 text-neutral-700">{item.edging}</td>
                        <td className="py-3 text-neutral-700">{item.hardware}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Material Summary
                </p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-950">
                  Cabinet Material Coverage
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cabinetDesignPackage.materialSummary.map((item) => (
                  <MaterialSummaryCard key={item.material} item={item} />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Installation Notes
                </p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-950">
                  Site Preparation and Tolerance Checks
                </h3>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                {cabinetDesignPackage.installationNotes.map((note) => (
                  <InstallationNoteCard key={note.sequence} note={note} />
                ))}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Room Detection Summary"
        description="Detected rooms, intended planning use, and notable observations from the mock interpretation layer."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {plan.roomDetections.map((room) => (
            <article key={room.name} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    {room.type}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-neutral-950">{room.name}</h3>
                </div>
                <StatusPill tone={room.confidence === "High" ? "success" : "warning"}>
                  {room.confidence} confidence
                </StatusPill>
              </div>

              <p className="mt-4 text-sm font-medium text-neutral-900">{room.areaLabel}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-700">{room.designIntent}</p>

              <div className="mt-4 space-y-2">
                {room.keyObservations.map((observation) => (
                  <p key={observation} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-700">
                    {observation}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Furniture Placement Legend"
        description="Placement references to guide zoning, client walkthroughs, and early concept framing."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                <th className="py-3 pr-4">Key</th>
                <th className="py-3 pr-4">Room</th>
                <th className="py-3 pr-4">Item</th>
                <th className="py-3">Placement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.furnitureLegend.map((item) => (
                <tr key={item.code}>
                  <td className="py-3 pr-4">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-800">
                      {item.code}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-medium text-neutral-900">{item.room}</td>
                  <td className="py-3 pr-4 text-neutral-900">{item.item}</td>
                  <td className="py-3 text-neutral-700">{item.placement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Color and Material Palette"
        description="Mock palette selections intended to align the floor plan with a premium interior direction."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plan.palette.map((item) => (
            <article key={item.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="h-20 w-full border-b border-slate-200" style={{ backgroundColor: item.hex }} />
              <div className="px-4 py-4">
                <p className="text-sm font-semibold text-neutral-950">{item.label}</p>
                <p className="mt-1 text-sm text-neutral-600">{item.material}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Finish</p>
                <p className="mt-1 text-sm text-neutral-700">{item.finish}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Application</p>
                <p className="mt-1 text-sm text-neutral-700">{item.application}</p>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="3D Perspective / Artist Illustration Engine"
        description="Generate a mock concept package with room-based perspective cards, style options, illustration prompts, and designer notes."
        actions={
          <LinkButton
            href={buildFloorPlanDetailHref({
              id: plan.id,
              showFurnitureLayout,
              showCabinetDesign,
              showPerspectivePackage: true,
              perspectiveStyle: selectedPerspectiveStyle,
            })}
          >
            {showPerspectivePackage ? "Regenerate 3D Perspectives" : "Generate 3D Perspectives"}
          </LinkButton>
        }
      >
        <div className="space-y-6">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Visual Style Options
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {FLOOR_PLAN_PERSPECTIVE_STYLES.map((style) => (
                <LinkButton
                  key={style}
                  href={buildFloorPlanDetailHref({
                    id: plan.id,
                    showFurnitureLayout,
                    showCabinetDesign,
                    showPerspectivePackage,
                    perspectiveStyle: style,
                  })}
                  size="sm"
                  variant={selectedPerspectiveStyle === style ? "primary" : "secondary"}
                >
                  {style}
                </LinkButton>
              ))}
            </div>
          </article>

          {!perspectivePackage ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6">
              <p className="text-sm font-medium text-neutral-900">
                Generate a mock 3D concept package for entrance, living or dining, kitchen, master
                bedroom, bathroom, and outdoor views when the plan suggests a balcony or landscape
                opportunity.
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                The selected visual style is <span className="font-semibold text-neutral-900">{selectedPerspectiveStyle}</span>.
                The output stays mock-only and is intended for UI and workflow validation inside the
                current floor plan module.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Entrance",
                  "Living / Dining",
                  "Kitchen",
                  "Master Bedroom",
                  "Bathroom",
                  "Balcony / Landscape if applicable",
                ].map((label) => (
                  <span
                    key={label}
                    className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Concept Package Summary
                  </p>
                  <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                    <InfoLine label="Visual Style" value={perspectivePackage.style} />
                    <InfoLine
                      label="Perspective Views"
                      value={String(perspectivePackage.perspectives.length)}
                    />
                    <InfoLine label="Plan" value={plan.projectName} />
                    <InfoLine label="Status" value={formatStatus(plan.status)} />
                  </div>
                </article>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Artist Illustration Prompt
                  </p>
                  <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 font-mono text-xs leading-6 text-neutral-700">
                    {perspectivePackage.artistIllustrationPrompt}
                  </p>
                </article>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {perspectivePackage.perspectives.map((perspective) => (
                  <PerspectiveConceptCard
                    key={perspective.viewTitle}
                    perspective={perspective}
                  />
                ))}
              </div>

              <NotesPanel title="Notes for Designer" notes={perspectivePackage.designerNotes} />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Carpentry Design Notes"
        description="Joinery and workshop framing notes generated from the spatial interpretation."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {plan.carpentryNotes.map((item) => (
            <article key={`${item.zone}-${item.title}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{item.zone}</p>
              <h3 className="mt-2 text-lg font-semibold text-neutral-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-700">{item.note}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Renovation Workflow Steps"
        description="Recommended handoff sequence from mock layout detection into design development and execution planning."
      >
        <div className="space-y-3">
          {plan.workflowSteps.map((step) => (
            <article key={step.phase} className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-black/5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">{step.phase}</p>
                  <p className="mt-1 text-sm text-neutral-600">{step.deliverable}</p>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:min-w-[320px]">
                  <InfoLine label="Owner" value={step.owner} />
                  <InfoLine label="Duration" value={step.duration} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </main>
  );
}

function MetricCard(props: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm shadow-black/5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
      <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p>
    </div>
  );
}

function InfoLine(props: { label: string; value: string; className?: string }) {
  return (
    <div className={props.className}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-1 font-medium leading-6 text-neutral-900">{props.value}</p>
    </div>
  );
}

function DetailPanel(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-700">{props.value}</p>
    </div>
  );
}

function ChipGroup(props: { title: string; items: string[]; tone?: "neutral" | "warm" }) {
  const toneClass =
    props.tone === "warm"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-neutral-800";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.items.map((item) => (
          <span
            key={`${props.title}-${item}`}
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function CabinetDesignCard(props: { cabinet: FloorPlanCabinetDesign }) {
  const { cabinet } = props;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-black/5">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Cabinet Zone
            </p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-950">{cabinet.title}</h3>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-700">
            {cabinet.finishColor}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="Location" value={cabinet.location} />
          <DetailPanel label="Purpose" value={cabinet.purpose} />
          <DetailPanel label="Dimensions Estimate" value={cabinet.dimensionsEstimate} />
          <DetailPanel label="Internal Layout" value={cabinet.internalLayout} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="Material" value={cabinet.material} />
          <DetailPanel label="Finish Color" value={cabinet.finishColor} />
        </div>
      </div>
    </article>
  );
}

function MaterialSummaryCard(props: { item: FloorPlanCabinetMaterialSummaryItem }) {
  const { item } = props;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {item.material}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
        {item.productionQuantity}
      </p>
      <p className="mt-1 text-sm text-neutral-600">Estimated production quantity</p>
      <div className="mt-4 grid gap-3 text-sm">
        <InfoLine label="Cabinet Zones" value={String(item.cabinetCount)} />
        <InfoLine label="Application" value={item.application} />
      </div>
    </article>
  );
}

function InstallationNoteCard(props: { note: FloorPlanCabinetInstallationNote }) {
  const { note } = props;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
      <p className="text-sm font-semibold text-neutral-950">{note.sequence}</p>
      <div className="mt-4 grid gap-3">
        <DetailPanel label="Site Preparation" value={note.sitePreparation} />
        <DetailPanel label="Measurement Tolerance" value={note.measurementTolerance} />
      </div>
    </article>
  );
}

function PerspectiveConceptCard(props: { perspective: FloorPlanPerspectiveConcept }) {
  const { perspective } = props;

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-black/5">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              View Title
            </p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-950">
              {perspective.viewTitle}
            </h3>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
            {perspective.designStyle}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="grid gap-3 md:grid-cols-2">
          <DetailPanel label="Camera Angle" value={perspective.cameraAngleDescription} />
          <DetailPanel label="Lighting Direction" value={perspective.lightingDirection} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ChipGroup title="Color Palette" items={perspective.colorPalette} tone="warm" />
          <ChipGroup title="Material Palette" items={perspective.materialPalette} />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Furniture / Carpentry Details
          </p>
          <div className="mt-3 space-y-2">
            {perspective.furnitureCarpentryDetails.map((detail) => (
              <p
                key={`${perspective.viewTitle}-${detail}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-neutral-700"
              >
                {detail}
              </p>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Image Generation Prompt
          </p>
          <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-xs leading-6 text-neutral-700">
            {perspective.imageGenerationPrompt}
          </p>
        </div>
      </div>
    </article>
  );
}

function NotesPanel(props: { title: string; notes: string[] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-black/5">
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <div className="mt-4 space-y-3">
        {props.notes.map((note, index) => (
          <div
            key={`${props.title}-${index + 1}`}
            className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-neutral-950">
              {index + 1}
            </span>
            <p className="text-sm leading-6 text-neutral-700">{note}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatus(status: FloorPlanStatus) {
  return status.replaceAll("_", " ");
}

function statusTone(status: FloorPlanStatus): "success" | "warning" | "info" {
  if (status === "AI_READY") return "success";
  if (status === "REVIEW_PENDING") return "warning";
  return "info";
}

function hasEnabledFlag(value: string | string[] | undefined) {
  return value === "1" || (Array.isArray(value) && value.includes("1"));
}

function resolvePerspectiveStyle(
  value: string | string[] | undefined,
): FloorPlanPerspectiveStyle {
  const candidate = Array.isArray(value) ? value[0] : value;

  return (
    FLOOR_PLAN_PERSPECTIVE_STYLES.find((style) => style === candidate) ??
    FLOOR_PLAN_PERSPECTIVE_STYLES[0]
  );
}

function buildFloorPlanDetailHref(args: {
  id: string;
  showFurnitureLayout: boolean;
  showCabinetDesign: boolean;
  showPerspectivePackage: boolean;
  perspectiveStyle: FloorPlanPerspectiveStyle;
}) {
  const searchParams = new URLSearchParams();

  if (args.showFurnitureLayout) {
    searchParams.set("generateFurnitureLayout", "1");
  }

  if (args.showCabinetDesign) {
    searchParams.set("generateCabinetDesign", "1");
  }

  if (args.showPerspectivePackage) {
    searchParams.set("generate3dPerspectives", "1");
  }

  searchParams.set("perspectiveStyle", args.perspectiveStyle);

  const query = searchParams.toString();
  return query ? `/design-ai/floor-plans/${args.id}?${query}` : `/design-ai/floor-plans/${args.id}`;
}
