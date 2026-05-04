import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Permission, RoomType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  addFfeProposalAction,
  addLayoutPlanAction,
  generateLayoutPlanAction,
  addVisualRenderAction,
  deleteFfeProposalAction,
  deleteQsBoqDraftItemAction,
  generateDesignOptionsAction,
  generateVisualRenderAction,
  regenerateDesignOptionAction,
  selectDesignOptionAction,
  selectGeneratedLayoutPlanAction,
  pushQsToQuotationAction,
  saveQsBoqDraftItemsAction,
  updateDesignAreaAction,
} from "@/app/(platform)/projects/[projectId]/design-brief/actions";
import { QsBoqEditor, type QsRow } from "@/app/(platform)/projects/[projectId]/design-brief/[briefId]/areas/[areaId]/components/qs-boq-editor";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { buildInteriorVisualPrompt } from "@/lib/ai/visual-generator";

function Card(props: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
        {props.description ? <p className="text-sm text-neutral-600">{props.description}</p> : null}
      </div>
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function DesignAreaDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; briefId: string; areaId: string }>;
}) {
  const { projectId, briefId, areaId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const area = await prisma.designArea.findUnique({
    where: { id: areaId },
    include: {
      designBrief: { select: { id: true, projectId: true, title: true, designStyle: true } },
      layoutPlans: { orderBy: [{ createdAt: "desc" }] },
      generatedLayoutPlans: { orderBy: [{ createdAt: "desc" }] },
      visualRenders: { orderBy: [{ createdAt: "desc" }] },
      ffeProposals: { orderBy: [{ createdAt: "desc" }] },
      qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!area || area.designBrief.id !== briefId || area.designBrief.projectId !== projectId) notFound();

  const qsInitialRows: QsRow[] = area.qsBoqDraftItems.map((r) => ({
    id: r.id,
    description: r.description,
    unit: r.unit,
    quantity: Number(r.quantity),
    recommendedSellingUnitPrice: Number(r.recommendedSellingUnitPrice),
    estimatedCostUnitPrice: Number(r.estimatedCostUnitPrice),
    isEditable: r.isEditable,
    sortOrder: r.sortOrder,
    quotationItemId: r.quotationItemId ?? null,
    selected: r.quotationItemId ? false : true,
  }));

  const ffeTotal = area.ffeProposals.reduce(
    (sum, p) => sum + Number(p.unitPrice) * Number(p.quantity),
    0,
  );

  const selectedGeneratedLayoutPlan =
    area.generatedLayoutPlans.find((p) => p.isSelected) ?? area.generatedLayoutPlans[0] ?? null;

  const defaultVisualPrompt =
    selectedGeneratedLayoutPlan?.promptFor3DVisual ??
    buildInteriorVisualPrompt({
      roomType: area.roomType,
      layoutNotes: area.proposedLayoutNotes ?? null,
      materials: area.proposedMaterials ?? null,
      designStyle: area.designBrief.designStyle ?? null,
    });

  const latestOptionSetId = area.visualRenders.find((r) => r.optionSetId)?.optionSetId ?? null;
  const latestOptions =
    latestOptionSetId
      ? (() => {
          const byLabel = new Map<string, typeof area.visualRenders[number]>();
          for (const r of area.visualRenders) {
            if (r.optionSetId !== latestOptionSetId) continue;
            const label = (r.optionLabel ?? "").trim();
            if (!label) continue;
            if (!byLabel.has(label)) byLabel.set(label, r);
          }
          return {
            A: byLabel.get("A") ?? null,
            B: byLabel.get("B") ?? null,
            C: byLabel.get("C") ?? null,
          };
        })()
      : { A: null, B: null, C: null };

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}/areas`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {area.roomType}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Area
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {area.name}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Brief: {area.designBrief.title}
          </p>
        </div>
      </div>

      <Card title="Area Details" description="Drafter inputs: requirements, layout notes, materials/specifications, and theme.">
        <form action={updateDesignAreaAction} className="grid gap-4 lg:grid-cols-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />
          <input type="hidden" name="areaId" value={areaId} />

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Name</span>
            <input
              name="name"
              required
              defaultValue={area.name}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Type</span>
            <select
              name="roomType"
              defaultValue={area.roomType}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              {Object.values(RoomType).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Client Requirement</span>
            <textarea
              name="clientRequirement"
              rows={3}
              defaultValue={area.clientRequirement ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Must-haves, constraints, preferences."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Proposed Layout Notes</span>
            <textarea
              name="proposedLayoutNotes"
              rows={4}
              defaultValue={area.proposedLayoutNotes ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Furniture plan, circulation, feature walls, storage zones, etc."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Proposed Materials / Specifications</span>
            <textarea
              name="proposedMaterials"
              rows={4}
              defaultValue={area.proposedMaterials ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Finishes, carpentry laminate, countertop, paint, flooring, etc."
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Proposed Theme</span>
            <textarea
              name="proposedTheme"
              rows={3}
              defaultValue={area.proposedTheme ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Theme keywords and mood."
            />
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Area
            </button>
          </div>
        </form>
      </Card>

      <Card title="AI Design Suggestions" description="Auto-generate design concept suggestions and Option A/B/C visuals from the brief, area requirements, and budget context.">
        <div id="options" className="scroll-mt-24" />

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <form action={generateDesignOptionsAction} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <input type="hidden" name="areaId" value={areaId} />

            <div className="sm:col-span-4">
              <p className="text-sm font-medium text-neutral-900">Generate Design Options</p>
              <p className="mt-1 text-sm text-neutral-600">
                This writes AI suggestions into the area, generates three visuals (A/B/C), and can create a preliminary QS BOQ draft.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2 sm:justify-end">
              <input type="checkbox" name="alsoGenerateBoq" defaultChecked className="h-4 w-4" />
              <span className="text-neutral-700">Also generate BOQ draft</span>
            </label>

            <div className="flex justify-end sm:col-span-6">
              <PendingSubmitButton pendingText="Generating options...">Generate Design Options</PendingSubmitButton>
            </div>
          </form>
        </div>

        {(area.aiLayoutSuggestion || area.aiMaterialSuggestion || area.aiFurnitureSuggestion || area.aiLightingSuggestion) ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Layout</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{area.aiLayoutSuggestion ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Materials</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{area.aiMaterialSuggestion ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Furniture</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{area.aiFurnitureSuggestion ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Lighting</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{area.aiLightingSuggestion ?? "-"}</p>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-neutral-600">No AI suggestions generated yet.</p>
        )}
      </Card>

      <Card
        title="Auto Layout Generator"
        description="Generate furniture placement notes with circulation rules. Select one plan to drive your default 3D visual prompt."
      >
        <div id="ai-layout" className="scroll-mt-24" />

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <form action={generateLayoutPlanAction} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <input type="hidden" name="areaId" value={areaId} />

            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Title</span>
              <input
                name="title"
                required
                defaultValue={`AI Layout Plan - ${area.name}`}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Room Width (m)</span>
              <input
                name="roomWidth"
                type="number"
                step="0.01"
                min={0}
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. 3.20"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Room Length (m)</span>
              <input
                name="roomLength"
                type="number"
                step="0.01"
                min={0}
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. 4.10"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Auto-select</span>
              <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-3 text-sm">
                <input type="checkbox" name="autoSelect" defaultChecked className="h-4 w-4" />
                <span className="text-neutral-700">Set as default</span>
              </label>
            </label>

            <label className="grid gap-2 text-sm sm:col-span-3">
              <span className="font-medium text-neutral-800">Door Position</span>
              <input
                name="doorPosition"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. North wall, near left corner"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-3">
              <span className="font-medium text-neutral-800">Window Position</span>
              <input
                name="windowPosition"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. East wall, centered"
              />
            </label>

            <div className="flex justify-end sm:col-span-6">
              <PendingSubmitButton pendingText="Generating layout...">Generate Layout Plan</PendingSubmitButton>
            </div>
          </form>
        </div>

        {selectedGeneratedLayoutPlan ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-neutral-950">{selectedGeneratedLayoutPlan.title}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Selected layout drives the default 3D prompt. Dimensions:{" "}
                  {selectedGeneratedLayoutPlan.roomWidth ? Number(selectedGeneratedLayoutPlan.roomWidth).toFixed(2) : "-"}m x{" "}
                  {selectedGeneratedLayoutPlan.roomLength ? Number(selectedGeneratedLayoutPlan.roomLength).toFixed(2) : "-"}m
                </p>
              </div>
              <span className="inline-flex w-fit rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Selected
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Layout Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {selectedGeneratedLayoutPlan.layoutSummary}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Furniture Placement</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {selectedGeneratedLayoutPlan.furniturePlacementPlan}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Circulation Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {selectedGeneratedLayoutPlan.circulationNotes}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt For 3D Visual</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {selectedGeneratedLayoutPlan.promptFor3DVisual}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-neutral-600">
            No generated layout plans yet. Generate one above to set a better 3D prompt baseline.
          </p>
        )}

        {area.generatedLayoutPlans.length > 1 ? (
          <details className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-900">
              View all generated layout plans ({area.generatedLayoutPlans.length})
            </summary>
            <div className="mt-4 space-y-3">
              {area.generatedLayoutPlans.map((p) => (
                <div key={p.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">{p.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {p.roomWidth ? Number(p.roomWidth).toFixed(2) : "-"}m x{" "}
                        {p.roomLength ? Number(p.roomLength).toFixed(2) : "-"}m · Door:{" "}
                        {p.doorPosition ?? "-"} · Window: {p.windowPosition ?? "-"}
                      </p>
                    </div>
                    <form action={selectGeneratedLayoutPlanAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="briefId" value={briefId} />
                      <input type="hidden" name="areaId" value={areaId} />
                      <input type="hidden" name="layoutPlanId" value={p.id} />
                      <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                        {p.isSelected ? "Selected" : "Select"}
                      </button>
                    </form>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{p.layoutSummary}</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="Layout Plans" description="Upload or link layout plan files and keep drafter notes versioned here.">
          <form action={addLayoutPlanAction} className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <input type="hidden" name="areaId" value={areaId} />
            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Title</span>
              <input
                name="title"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Living room furniture plan v1"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">File URL (optional)</span>
              <input
                name="fileUrl"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="https://... or /uploads/..."
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Description / Notes (optional)</span>
              <textarea
                name="description"
                rows={3}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <div className="flex justify-end sm:col-span-6">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add Layout Plan
              </button>
            </div>
          </form>

          <div className="mt-6 space-y-3">
            {area.layoutPlans.length === 0 ? (
              <p className="text-sm text-neutral-600">No layout plans yet.</p>
            ) : (
              area.layoutPlans.map((p) => (
                <div key={p.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-950">{p.title}</p>
                  <p className="mt-1 text-sm text-neutral-600">{p.description ?? "-"}</p>
                  {p.fileUrl ? (
                    <p className="mt-2 text-xs text-neutral-500">
                      File:{" "}
                      <a href={p.fileUrl} className="underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500">
                        {p.fileUrl}
                      </a>
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="3D Visual Renders" description="Generate realistic visuals from layout/material inputs, or store external renders and prompts for traceability.">
          <div id="renders" className="scroll-mt-24" />

          {latestOptionSetId && (latestOptions.A || latestOptions.B || latestOptions.C) ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Latest Design Options (A/B/C)
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {(["A", "B", "C"] as const).map((key) => {
                  const r = latestOptions[key];
                  return (
                    <div key={key} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-neutral-950">Option {key}</p>
                          <p className="mt-1 text-xs text-neutral-500">{r?.generationStatus ?? "-"}</p>
                        </div>
                        {r?.isSelected ? (
                          <span className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                            Selected
                          </span>
                        ) : null}
                      </div>

                      {r?.generatedImageUrl || r?.fileUrl ? (
                        <div className="mt-3 rounded-2xl border border-neutral-200 bg-white p-2">
                          <img
                            src={(r.generatedImageUrl || r.fileUrl) ?? ""}
                            alt={`Option ${key}`}
                            className="h-auto w-full rounded-xl object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                          No image yet.
                        </div>
                      )}

                      {r?.errorMessage ? (
                        <p className="mt-3 text-sm text-red-700">{r.errorMessage}</p>
                      ) : null}

                      {r ? (
                        <div className="mt-4 grid gap-2">
                          <form action={selectDesignOptionAction}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="briefId" value={briefId} />
                            <input type="hidden" name="areaId" value={areaId} />
                            <input type="hidden" name="visualRenderId" value={r.id} />
                            <button className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                              Select Option {key}
                            </button>
                          </form>

                          <form action={regenerateDesignOptionAction} className="grid gap-2">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="briefId" value={briefId} />
                            <input type="hidden" name="areaId" value={areaId} />
                            <input type="hidden" name="sourceRenderId" value={r.id} />
                            <label className="grid gap-2 text-xs">
                              <span className="font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt</span>
                              <textarea
                                name="promptOverride"
                                rows={3}
                                defaultValue={r.promptText || r.generatedPrompt || defaultVisualPrompt}
                                className="rounded-xl border border-neutral-300 bg-white p-2 text-xs outline-none ring-neutral-400 focus:ring-2"
                              />
                            </label>
                            <PendingSubmitButton
                              pendingText="Regenerating..."
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Regenerate Option {key}
                            </PendingSubmitButton>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              AI Visual Generator
            </p>
            <p className="mt-2 text-sm text-neutral-700">
              Build a prompt from area details and generate a realistic interior render. You can edit the prompt before generating.
            </p>

            <form action={generateVisualRenderAction} className="mt-4 grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="briefId" value={briefId} />
              <input type="hidden" name="areaId" value={areaId} />

              <label className="grid gap-2 text-sm sm:col-span-6">
                <span className="font-medium text-neutral-800">Title (optional)</span>
                <input
                  name="title"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="e.g. AI render - warm modern"
                />
              </label>

              <label className="grid gap-2 text-sm sm:col-span-6">
                <span className="font-medium text-neutral-800">Prompt</span>
                <textarea
                  name="promptOverride"
                  rows={4}
                  defaultValue={defaultVisualPrompt}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>

              <div className="flex justify-end sm:col-span-6">
                <PendingSubmitButton pendingText="Generating...">Generate 3D Visual</PendingSubmitButton>
              </div>
            </form>
          </div>

          <details className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer select-none text-sm font-semibold text-neutral-900">
              Add external render manually
            </summary>
            <form action={addVisualRenderAction} className="mt-4 grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />
            <input type="hidden" name="areaId" value={areaId} />

            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Title</span>
              <input
                name="title"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Living room render v1"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-3">
              <span className="font-medium text-neutral-800">Theme (optional)</span>
              <input
                name="theme"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Modern warm neutral"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-3">
              <span className="font-medium text-neutral-800">File URL (optional)</span>
              <input
                name="fileUrl"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="https://... or /uploads/..."
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Material Notes (optional)</span>
              <textarea
                name="materialNotes"
                rows={3}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Generated Prompt (optional)</span>
              <textarea
                name="generatedPrompt"
                rows={3}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <div className="flex justify-end sm:col-span-6">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Add Render
              </button>
            </div>
            </form>
          </details>

          <div className="mt-6 space-y-3">
            {area.visualRenders.length === 0 ? (
              <p className="text-sm text-neutral-600">No renders yet.</p>
            ) : (
              area.visualRenders.map((r) => (
                <div key={r.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">{r.title}</p>
                      <p className="mt-1 text-sm text-neutral-600">{r.theme ?? "-"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                          {r.generationStatus}
                        </span>
                        {r.generatedImageUrl ? (
                          <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
                            AI
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {(r.generatedImageUrl || r.fileUrl) ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-neutral-200 bg-white p-3">
                        <img
                          src={(r.generatedImageUrl || r.fileUrl) ?? ""}
                          alt={r.title}
                          className="h-auto w-full rounded-xl object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-xl border border-neutral-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt</p>
                          <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-800">
                            {r.promptText || r.generatedPrompt || "-"}
                          </pre>
                        </div>
                        {r.errorMessage ? (
                          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            {r.errorMessage}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Prompt</p>
                      <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-800">
                        {r.promptText || r.generatedPrompt || "-"}
                      </pre>
                      {r.errorMessage ? (
                        <p className="mt-3 text-sm text-red-700">{r.errorMessage}</p>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Regenerate</p>
                    <form action={generateVisualRenderAction} className="mt-3 grid gap-3">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="briefId" value={briefId} />
                      <input type="hidden" name="areaId" value={areaId} />
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-neutral-800">Title (optional)</span>
                        <input
                          name="title"
                          className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                          placeholder="e.g. AI render - v2"
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-neutral-800">Prompt</span>
                        <textarea
                          name="promptOverride"
                          rows={3}
                          defaultValue={r.promptText || r.generatedPrompt || defaultVisualPrompt}
                          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                        />
                      </label>
                      <div className="flex justify-end">
                        <PendingSubmitButton pendingText="Generating...">Regenerate</PendingSubmitButton>
                      </div>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <Card title="FF&E Proposals" description="Hotel-style FF&E schedule by area.">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <form action={addFfeProposalAction} className="grid gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="briefId" value={briefId} />
              <input type="hidden" name="areaId" value={areaId} />

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Item</span>
                <input
                  name="title"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="e.g. Sofa (3-seater)"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Supplier (optional)</span>
                <input
                  name="supplierName"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Purchase URL (optional)</span>
                <input
                  name="purchaseUrl"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="https://..."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Unit Price</span>
                  <input
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={0}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Qty</span>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={1}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Lead time (days)</span>
                  <input
                    name="leadTimeDays"
                    type="number"
                    min="0"
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">Availability</span>
                  <input
                    name="availabilityStatus"
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                    placeholder="e.g. In stock"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Remarks (optional)</span>
                <textarea
                  name="remarks"
                  rows={3}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <div className="flex justify-end">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Add FF&amp;E Item
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-neutral-200 bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">FF&amp;E Schedule</p>
                  <p className="mt-1 text-sm text-neutral-600">Total: {formatCurrency(ffeTotal)}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-800">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">Item</th>
                      <th className="px-3 py-3 text-left font-semibold">Supplier</th>
                      <th className="px-3 py-3 text-right font-semibold">Unit</th>
                      <th className="px-3 py-3 text-right font-semibold">Qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="px-3 py-3 text-left font-semibold">Lead Time</th>
                      <th className="px-3 py-3 text-left font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {area.ffeProposals.length === 0 ? (
                      <tr>
                        <td className="px-3 py-6 text-sm text-neutral-600" colSpan={7}>
                          No FF&amp;E items yet.
                        </td>
                      </tr>
                    ) : (
                      area.ffeProposals.map((p) => {
                        const total = Number(p.unitPrice) * Number(p.quantity);
                        return (
                          <tr key={p.id} className="border-t border-neutral-200">
                            <td className="px-3 py-3 font-medium text-neutral-900">
                              {p.title}
                              {p.purchaseUrl ? (
                                <div className="mt-1 text-xs text-neutral-500">
                                  <a href={p.purchaseUrl} className="underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-500">
                                    Link
                                  </a>
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 text-neutral-700">{p.supplierName ?? "-"}</td>
                            <td className="px-3 py-3 text-right text-neutral-700">{formatCurrency(Number(p.unitPrice))}</td>
                            <td className="px-3 py-3 text-right text-neutral-700">{Number(p.quantity).toFixed(2)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-neutral-950">{formatCurrency(total)}</td>
                            <td className="px-3 py-3 text-neutral-700">
                              {p.leadTimeDays !== null && p.leadTimeDays !== undefined ? `${p.leadTimeDays}d` : "-"} ·{" "}
                              {p.availabilityStatus ?? "-"}
                            </td>
                            <td className="px-3 py-3">
                              <form action={deleteFfeProposalAction}>
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="briefId" value={briefId} />
                                <input type="hidden" name="areaId" value={areaId} />
                                <input type="hidden" name="ffeId" value={p.id} />
                                <button className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100">
                                  Remove
                                </button>
                              </form>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Quantity Surveyor (QS)" description="Draft BOQ items and push selected items into quotation.">
        <div className="space-y-6">
          <QsBoqEditor
            projectId={projectId}
            briefId={briefId}
            areaId={areaId}
            initialRows={qsInitialRows}
            saveAction={saveQsBoqDraftItemsAction}
            pushAction={pushQsToQuotationAction}
          />

          {area.qsBoqDraftItems.some((i) => i.quotationItemId) ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Some QS items are already pushed</p>
              <p className="mt-1 text-sm text-amber-800">
                Rows pushed to quotation are locked in the UI. If you need changes, edit the quotation items directly.
              </p>
            </div>
          ) : null}

          {area.qsBoqDraftItems.length > 0 ? (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Delete QS Row (Server)
              </p>
              <p className="mt-2 text-sm text-neutral-600">
                If a row persists after save (e.g. pushed rows), you can remove drafts individually here.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {area.qsBoqDraftItems.map((r) => (
                  <form key={r.id} action={deleteQsBoqDraftItemAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="briefId" value={briefId} />
                    <input type="hidden" name="areaId" value={areaId} />
                    <input type="hidden" name="itemId" value={r.id} />
                    <button className="inline-flex items-center rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                      Delete: {r.description.slice(0, 22)}
                      {r.description.length > 22 ? "…" : ""}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
