import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  applyBudgetScenarioAction,
  runBudgetOptimizerAction,
  selectBudgetScenarioAction,
} from "@/app/(platform)/projects/[projectId]/design-brief/actions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";

function Card(props: { title: string; children: ReactNode; description?: string; id?: string }) {
  return (
    <section id={props.id} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
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

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function isVeCandidate(description: string): boolean {
  const d = description.toLowerCase();
  return (
    d.includes("marble") ||
    d.includes("veneer") ||
    d.includes("feature") ||
    d.includes("premium") ||
    d.includes("smart") ||
    d.includes("cove") ||
    d.includes("profile") ||
    d.includes("chandelier") ||
    d.includes("solid surface") ||
    d.includes("corian") ||
    d.includes("curtain") ||
    d.includes("blind") ||
    d.includes("soft furnishing") ||
    d.includes("appliance")
  );
}

export default async function BudgetOptimizerPage({
  params,
}: {
  params: Promise<{ projectId: string; briefId: string }>;
}) {
  const { projectId, briefId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    include: {
      areas: {
        orderBy: [{ createdAt: "asc" }],
        include: { qsBoqDraftItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      },
      budgetOptimizationScenarios: { orderBy: [{ createdAt: "desc" }], take: 30 },
      project: { select: { id: true, name: true } },
    },
  });
  if (!brief || brief.projectId !== projectId) notFound();

  const rows = brief.areas.flatMap((a) =>
    a.qsBoqDraftItems.map((i) => ({
      id: i.id,
      areaName: a.name,
      description: i.description,
      unit: i.unit,
      quantity: Number(i.quantity),
      unitSell: Number(i.recommendedSellingUnitPrice),
      unitCost: Number(i.estimatedCostUnitPrice),
      sellingTotal: Number(i.sellingTotal),
      costTotal: Number(i.costTotal),
    })),
  );

  const currentSellingTotal = rows.reduce((s, r) => s + r.sellingTotal, 0);
  const currentCostTotal = rows.reduce((s, r) => s + r.costTotal, 0);
  const currentProfit = currentSellingTotal - currentCostTotal;
  const currentMargin = currentSellingTotal > 0 ? (currentProfit / currentSellingTotal) * 100 : 0;

  const selectedScenario = brief.budgetOptimizationScenarios.find((s) => s.isSelected) ?? null;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}/areas`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Areas
            </Link>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Budget Optimizer
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-700">
            Create value engineering scenarios from QS BOQ draft items and apply adjustments safely (server-side).
          </p>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        <MetricCard title="Current Sell Total" value={formatCurrency(currentSellingTotal)} />
        <MetricCard title="Current Cost Total" value={formatCurrency(currentCostTotal)} />
        <MetricCard title="Projected Gross Profit" value={formatCurrency(currentProfit)} />
        <MetricCard title="Projected Margin %" value={`${currentMargin.toFixed(1)}%`} />
      </section>

      <Card
        title="Run Optimization"
        description="Select items eligible for value engineering (VE), set a target budget, and generate a saved scenario."
      >
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-700">
            No QS BOQ draft items yet. Create QS draft items in Design Areas first.
          </p>
        ) : (
          <form action={runBudgetOptimizerAction} className="grid gap-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="briefId" value={briefId} />

            <div className="grid gap-3 sm:grid-cols-6">
              <label className="grid gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-neutral-800">Target Budget (Sell)</span>
                <input
                  name="targetBudget"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={Math.max(0, Math.round(currentSellingTotal))}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <div className="sm:col-span-4">
                <p className="text-sm font-medium text-neutral-900">How it works</p>
                <p className="mt-1 text-sm text-neutral-600">
                  We reduce selling + cost unit rates for VE-eligible items (preserving minimum margin) until the target is met.
                  This does not change quotation yet; it updates QS BOQ draft items when you apply a scenario.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-neutral-200">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-800">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">VE</th>
                    <th className="px-3 py-3 text-left font-semibold">Area</th>
                    <th className="px-3 py-3 text-left font-semibold">Description</th>
                    <th className="px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="px-3 py-3 text-right font-semibold">Sell Unit</th>
                    <th className="px-3 py-3 text-right font-semibold">Sell Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-neutral-200">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          name="veItemIds"
                          value={r.id}
                          defaultChecked={isVeCandidate(r.description)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-neutral-900">{r.areaName}</td>
                      <td className="px-3 py-3 text-neutral-900">{r.description}</td>
                      <td className="px-3 py-3 text-right text-neutral-700">{r.quantity.toFixed(2)}</td>
                      <td className="px-3 py-3 text-right text-neutral-700">{formatCurrency(r.unitSell)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                        {formatCurrency(r.sellingTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <PendingSubmitButton pendingText="Optimizing...">Generate Scenario</PendingSubmitButton>
            </div>
          </form>
        )}
      </Card>

      <Card id="scenarios" title="Saved Scenarios" description="Select a scenario as the working plan and apply it to QS draft items when ready.">
        {brief.budgetOptimizationScenarios.length === 0 ? (
          <p className="text-sm text-neutral-700">No scenarios yet.</p>
        ) : (
          <div className="space-y-3">
            {brief.budgetOptimizationScenarios.map((s) => {
              const scenarioJson = s.scenarioJson as unknown as { overBudgetAmount?: number; recommendedCuts?: unknown[] };
              const recommendedCutsCount = Array.isArray(scenarioJson.recommendedCuts) ? scenarioJson.recommendedCuts.length : 0;
              const isSelected = Boolean(s.isSelected);
              return (
                <div key={s.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-neutral-950">
                          Target {formatCurrency(Number(s.targetBudget))} · Revised{" "}
                          {formatCurrency(Number(s.revisedEstimatedTotal))}
                        </p>
                        {isSelected ? (
                          <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                            Selected
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-neutral-700">
                        Savings: <span className="font-semibold">{formatCurrency(Number(s.savingsAmount))}</span> · Cuts:{" "}
                        <span className="font-semibold">{recommendedCutsCount}</span>
                        {typeof scenarioJson.overBudgetAmount === "number" ? (
                          <>
                            {" "}
                            · Over budget:{" "}
                            <span className="font-semibold">{formatCurrency(scenarioJson.overBudgetAmount)}</span>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">Created {formatDateTime(s.createdAt)}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <form action={selectBudgetScenarioAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="briefId" value={briefId} />
                        <input type="hidden" name="scenarioId" value={s.id} />
                        <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Select
                        </button>
                      </form>
                      <form action={applyBudgetScenarioAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="briefId" value={briefId} />
                        <input type="hidden" name="scenarioId" value={s.id} />
                        <button className="inline-flex h-10 items-center justify-center rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                          Apply To QS Draft
                        </button>
                      </form>
                    </div>
                  </div>

                  {s.id === selectedScenario?.id ? (
                    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Summary</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{s.recommendationSummary}</p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-base font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

