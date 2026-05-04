import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import { getAILearningSummary, getBestPerformingActions, getWeakRecommendations } from "@/lib/ai/learning-layer";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { recalculateAILearningAction } from "@/app/(platform)/ai-learning/actions";
import type { ReactNode } from "react";
import { safeQuery } from "@/lib/server/safe-query";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

function pct(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

function badgeClass(status: string) {
  if (status === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "NEUTRAL") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "PENDING") return "border-neutral-300 bg-neutral-50 text-neutral-700";
  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AILearningPage() {
  await requireExecutive();
  await requirePermission({ moduleKey: "AI_LEARNING" satisfies PermissionModuleKey, action: "view" });

  const prismaAny = prisma as unknown as Record<string, any>;
  const metricDelegate = prismaAny.aILearningMetric ?? prismaAny.aiLearningMetric;
  const outcomeDelegate = prismaAny.aIOutcome ?? prismaAny.aiOutcome;
  const hasMetrics = Boolean(metricDelegate && typeof metricDelegate.findMany === "function");
  const hasOutcomes = Boolean(outcomeDelegate && typeof outcomeDelegate.findMany === "function");

  const summary = await safeQuery(
    () => getAILearningSummary(),
    { total: 0, pending: 0, success: 0, failed: 0, neutral: 0, successRate: 0, bestAction: null, weakAction: null },
  );

  const [topActions, weakActions, metrics, outcomesRecent] = await Promise.all([
    safeQuery(() => getBestPerformingActions({ take: 8 }), [] as any[]),
    safeQuery(() => getWeakRecommendations({ take: 8 }), [] as any[]),
    safeQuery(async () => {
      if (!hasMetrics) return [];
      return (await metricDelegate.findMany({
        where: { segmentKey: null },
        orderBy: [{ metricKey: "asc" }],
        take: 50,
      })) as Array<any>;
    }, [] as any[]),
    safeQuery(async () => {
      if (!hasOutcomes) return [];
      return (await outcomeDelegate.findMany({
        orderBy: [{ measuredAt: "desc" }],
        take: 30,
        include: { actionLog: { select: { action: true, priority: true, confidence: true } } },
      })) as Array<any>;
    }, [] as any[]),
  ]);

  const segmentMetrics = await safeQuery(async () => {
    if (!hasMetrics) return [];
    return (await metricDelegate.findMany({
      where: { segmentKey: { not: null } },
      orderBy: [{ sampleSize: "desc" }, { conversionRate: "desc" }],
      take: 40,
    })) as Array<any>;
  }, [] as any[]);

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Platform / AI Learning
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              AI Learning Layer
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Deterministic outcome tracking and scoring for AI recommendations. No model training, no external API calls.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={recalculateAILearningAction}>
              <PendingSubmitButton pendingText="Recalculating...">Recalculate</PendingSubmitButton>
            </form>
            <Link
              href="/command-center"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Command Center
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Total Outcomes" value={String(summary.total)} />
        <SummaryCard title="Pending" value={String(summary.pending)} />
        <SummaryCard title="Success Rate" value={pct(summary.successRate)} emphasis />
        <SummaryCard title="Best Action" value={summary.bestAction ? `${summary.bestAction.action}` : "-"} subtitle={summary.bestAction ? `${pct(summary.bestAction.successRate)} · n=${summary.bestAction.sampleSize}` : undefined} />
        <SummaryCard title="Weak Action" value={summary.weakAction ? `${summary.weakAction.action}` : "-"} subtitle={summary.weakAction ? `${pct(summary.weakAction.successRate)} · n=${summary.weakAction.sampleSize}` : undefined} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Outcome Metrics" subtitle="Per outcome type (overall).">
          {!hasMetrics ? (
            <p className="text-sm text-neutral-600">
              AI Learning tables are not available yet. (Fresh database) Run migrations / Prisma schema sync, then refresh.
            </p>
          ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Outcome Type</th>
                  <th className="px-4 py-3 text-right font-semibold">Sample</th>
                  <th className="px-4 py-3 text-right font-semibold">Success</th>
                  <th className="px-4 py-3 text-right font-semibold">Fail</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg Impact</th>
                </tr>
              </thead>
              <tbody>
                {metrics.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-neutral-600">
                      No metrics yet. Execute some AI actions, then click Recalculate.
                    </td>
                  </tr>
                ) : (
                  metrics.map((m) => (
                    <tr key={m.id} className="border-t border-neutral-200 bg-white">
                      <td className="px-4 py-3 font-medium text-neutral-950">{m.metricKey}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{m.sampleSize}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{m.successCount}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{m.failureCount}</td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-950">
                        {m.conversionRate === null ? "-" : pct(Number(m.conversionRate))}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">
                        {m.averageImpactAmount === null ? "-" : Number(m.averageImpactAmount).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </Panel>

        <Panel title="Recommendation Scores" subtitle="Best and weakest actions (overall).">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Best Performing
              </p>
              <div className="mt-3 space-y-2">
                {topActions.length === 0 ? (
                  <p className="text-sm text-neutral-600">No scores yet.</p>
                ) : (
                  topActions.map((a) => (
                    <div key={`${a.action}-${a.entityType}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-neutral-950">{a.action}</p>
                        <p className="text-sm font-semibold text-neutral-950">{pct(a.successRate)}</p>
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">{a.entityType} · n={a.sampleSize}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Weak Recommendations
              </p>
              <div className="mt-3 space-y-2">
                {weakActions.length === 0 ? (
                  <p className="text-sm text-neutral-600">No scores yet.</p>
                ) : (
                  weakActions.map((a) => (
                    <div key={`${a.action}-${a.entityType}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-neutral-950">{a.action}</p>
                        <p className="text-sm font-semibold text-neutral-950">{pct(a.successRate)}</p>
                      </div>
                      <p className="mt-1 text-xs text-neutral-600">{a.entityType} · n={a.sampleSize}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Segment Metrics" subtitle="Top segments by sample size (lead/design/invoice only).">
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Outcome</th>
                  <th className="px-4 py-3 text-left font-semibold">Entity</th>
                  <th className="px-4 py-3 text-left font-semibold">Segment</th>
                  <th className="px-4 py-3 text-right font-semibold">Sample</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {segmentMetrics.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-neutral-600">
                      No segment metrics yet.
                    </td>
                  </tr>
                ) : (
                  segmentMetrics.map((m) => (
                    <tr key={m.id} className="border-t border-neutral-200 bg-white">
                      <td className="px-4 py-3 font-medium text-neutral-950">{m.metricKey}</td>
                      <td className="px-4 py-3 text-neutral-700">{m.entityType}</td>
                      <td className="px-4 py-3 text-neutral-700">{m.segmentKey}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{m.sampleSize}</td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-950">
                        {m.conversionRate === null ? "-" : pct(Number(m.conversionRate))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Recent Outcomes" subtitle="Latest measurable AI action outcomes (auto-inferred).">
          <div className="space-y-3">
            {!Array.isArray(outcomesRecent) || outcomesRecent.length === 0 ? (
              <p className="text-sm text-neutral-600">No outcomes yet.</p>
            ) : (
              outcomesRecent.map((o) => (
                <div key={o.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                        {o.outcomeType} · {o.entityType}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-neutral-950">
                        {o.actionLog?.action ?? "Manual"}{" "}
                        <span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeClass(o.outcomeStatus)}`}>
                          {o.outcomeStatus}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">{formatDateTime(o.measuredAt)}</p>
                    </div>
                    <div className="text-right text-xs text-neutral-600">
                      <div>confidence: {o.actionLog?.confidence !== undefined ? Number(o.actionLog.confidence).toFixed(2) : "-"}</div>
                      <div>priority: {o.actionLog?.priority ?? "-"}</div>
                    </div>
                  </div>
                  {o.notes ? <p className="mt-2 text-sm text-neutral-700 line-clamp-3">{o.notes}</p> : null}
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-neutral-950">{props.title}</h2>
          {props.subtitle ? <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function SummaryCard(props: { title: string; value: string; subtitle?: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${props.emphasis ? "text-neutral-950" : "text-neutral-900"}`}>{props.value}</p>
      {props.subtitle ? <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p> : null}
    </div>
  );
}
