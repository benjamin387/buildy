import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Permission, UpsellStatus } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import {
  generateUpsellRecommendationsAction,
  pushUpsellToQuotationAction,
  updateUpsellStatusAction,
} from "@/app/(platform)/projects/[projectId]/upsell/actions";

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

function PriorityBadge(props: { priority: "LOW" | "MEDIUM" | "HIGH" }) {
  const styles: Record<string, string> = {
    LOW: "border-neutral-200 bg-white text-neutral-700",
    MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
    HIGH: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <span className={["inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]", styles[props.priority]].join(" ")}>
      {props.priority}
    </span>
  );
}

function StatusBadge(props: { status: UpsellStatus }) {
  const styles: Record<UpsellStatus, string> = {
    SUGGESTED: "border-blue-200 bg-blue-50 text-blue-800",
    PRESENTED: "border-amber-200 bg-amber-50 text-amber-800",
    ACCEPTED: "border-emerald-200 bg-emerald-50 text-emerald-800",
    REJECTED: "border-neutral-200 bg-white text-neutral-700",
  };
  return (
    <span className={["inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]", styles[props.status]].join(" ")}>
      {props.status}
    </span>
  );
}

export default async function UpsellEnginePage({
  params,
}: {
  params: Promise<{ projectId: string; briefId: string }>;
}) {
  const { projectId, briefId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    select: {
      id: true,
      projectId: true,
      title: true,
      clientNeeds: true,
      propertyType: true,
      designStyle: true,
      areas: { select: { qsBoqDraftItems: { select: { sellingTotal: true, description: true } } } },
    },
  });
  if (!brief || brief.projectId !== projectId) notFound();

  const currentBudget = brief.areas.reduce(
    (sum, a) => sum + a.qsBoqDraftItems.reduce((s2, it) => s2 + Number(it.sellingTotal), 0),
    0,
  );

  const recommendations = await prisma.upsellRecommendation.findMany({
    where: { projectId, designBriefId: briefId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

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
              href={`/projects/${projectId}/quotations`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Quotations
            </Link>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Intelligence
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Upsell Engine
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-700">
            Generate optional add-ons that increase project value and margin. Accepting an upsell can be pushed to a draft quotation as a new line item.
          </p>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard title="Brief" value={brief.title} />
        <MetricCard title="Current BOQ Sell Total" value={formatCurrency(currentBudget)} />
        <MetricCard title="Suggestions" value={`${recommendations.length}`} />
      </section>

      <Card
        title="Generate Recommendations"
        description="Uses property type, style, client needs, and current BOQ coverage to propose high-impact upgrades."
      >
        <form action={generateUpsellRecommendationsAction} className="grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />

          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium text-neutral-800">Budget (optional override)</span>
            <input
              name="currentBudgetOverride"
              type="number"
              min={0}
              step="0.01"
              placeholder={String(Math.round(currentBudget))}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <div className="sm:col-span-4">
            <p className="text-sm font-medium text-neutral-900">What gets generated</p>
            <p className="mt-1 text-sm text-neutral-600">
              Smart home, premium lighting, feature walls, storage optimization, soft furnishing packages, and style-aligned premium finishes.
            </p>
          </div>

          <div className="flex justify-end sm:col-span-6">
            <PendingSubmitButton pendingText="Generating...">Generate Upsells</PendingSubmitButton>
          </div>
        </form>
      </Card>

      <Card title="Recommendations" description="Track statuses and push accepted upsells into quotation.">
        {recommendations.length === 0 ? (
          <p className="text-sm text-neutral-700">No upsell recommendations yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Priority</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 text-left font-semibold">Recommendation</th>
                  <th className="px-3 py-3 text-right font-semibold">Revenue +</th>
                  <th className="px-3 py-3 text-right font-semibold">Cost +</th>
                  <th className="px-3 py-3 text-right font-semibold">Profit +</th>
                  <th className="px-3 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-3 text-neutral-900">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{r.title}</span>
                        <span className="text-xs text-neutral-500">{r.category}</span>
                        <span className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                          {r.pitchText}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(r.estimatedRevenueIncrease))}
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-700">
                      {formatCurrency(Number(r.estimatedCostIncrease))}
                    </td>
                    <td className="px-3 py-3 text-right text-neutral-700">
                      {formatCurrency(Number(r.estimatedProfitIncrease))}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={updateUpsellStatusAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="upsellId" value={r.id} />
                          <input type="hidden" name="returnTo" value={`/projects/${projectId}/design-brief/${briefId}/upsell-engine`} />
                          <select
                            name="status"
                            defaultValue={r.status}
                            className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                          >
                            {Object.values(UpsellStatus).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                            Save
                          </button>
                        </form>

                        <form action={pushUpsellToQuotationAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="upsellId" value={r.id} />
                          <input type="hidden" name="returnTo" value={`/projects/${projectId}/design-brief/${briefId}/upsell-engine`} />
                          <button className="inline-flex h-10 items-center justify-center rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                            Push to Quotation
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-base font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

