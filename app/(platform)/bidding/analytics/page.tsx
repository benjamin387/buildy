import Link from "next/link";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { safeQuery } from "@/lib/server/safe-query";
import { getBidDirectorAnalytics } from "@/lib/bidding/analytics";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BiddingAnalyticsPage() {
  await requireExecutive();
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });

  const data = await safeQuery(() => getBidDirectorAnalytics(), null as any);
  if (!data) {
    return (
      <main className="space-y-8">
        <PageHeader
          kicker="Bidding"
          title="Director Analytics"
          subtitle="Win intelligence, risk controls, competitor signals, and pipeline health."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/bidding">
                <ActionButton variant="secondary">Back to Bidding</ActionButton>
              </Link>
            </div>
          }
        />
        <EmptyState title="Analytics unavailable" description="Could not load analytics (check database/migrations)." />
      </main>
    );
  }

  const { kpis, risk, agencies, competitors, recent } = data;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Bidding / Intelligence"
        title="Director Analytics Dashboard"
        subtitle="Bank-grade view of pipeline health, win-rate, risk exposure, and competitor signals (read-only)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bidding/pipeline">
              <ActionButton>Open Pipeline</ActionButton>
            </Link>
            <Link href="/bidding/opportunities">
              <ActionButton variant="secondary">Opportunities</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Open Bids" value={String(kpis.openBids)} hint="Watching/Preparing/Pending approval" />
        <KpiCard title="Closing Soon" value={String(kpis.closingSoon7d)} hint="Next 7 days" tone={kpis.closingSoon7d > 0 ? "warning" : "neutral"} />
        <KpiCard title="Win Rate (90d)" value={`${(kpis.winRate90d * 100).toFixed(0)}%`} hint={`Awarded ${kpis.awarded90d} / Lost ${kpis.lost90d}`} tone={kpis.winRate90d >= 0.4 ? "success" : kpis.winRate90d >= 0.25 ? "warning" : "danger"} />
        <KpiCard title="Awarded Value (YTD)" value={formatCurrency(kpis.awardedValueYtd)} hint="Total bid price (awarded)" tone={kpis.awardedValueYtd > 0 ? "success" : "neutral"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Risk Exposure" description="Closing-date risk across open pipeline (top 200).">
          <div className="grid gap-3 sm:grid-cols-3">
            <RiskCard title="Critical" value={risk.criticalClosing} tone="danger" hint="Due in 1-2 days / past due" />
            <RiskCard title="High" value={risk.highClosing} tone="warning" hint="Due within 3 days" />
            <RiskCard title="Medium" value={risk.mediumClosing} tone="neutral" hint="Due within 7 days" />
          </div>
          <p className="mt-4 text-xs text-neutral-600">
            Use bid workspace timeline + compliance checklist to reduce submission risk. No auto-submission to GeBIZ.
          </p>
        </SectionCard>

        <SectionCard title="Agency Performance" description="Last 180 days (top 10 by volume).">
          {agencies.length === 0 ? (
            <EmptyState title="No agency data yet" description="Create opportunities to populate win-rate signals." />
          ) : (
            <div className="space-y-2">
              {agencies.map((a: any) => (
                <div key={a.agencyName} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{a.agencyName}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {a.opportunities} opp · {a.awarded} won · {a.lost} lost
                    </p>
                  </div>
                  <StatusPill tone={a.winRate >= 0.4 ? "success" : a.winRate >= 0.25 ? "warning" : "neutral"}>
                    {(a.winRate * 100).toFixed(0)}%
                  </StatusPill>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Competitor Signals" description="Last 180 days (based on competitor records captured).">
          {competitors.length === 0 ? (
            <EmptyState title="No competitor signals yet" description="Capture competitor records in bid workspaces after tender results/debriefs." />
          ) : (
            <div className="space-y-2">
              {competitors.map((c: any) => (
                <div key={c.competitorName} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{c.competitorName}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{c.appearances} appearance(s)</p>
                  </div>
                  <StatusPill tone={c.wins > 0 ? "warning" : "neutral"}>{c.wins} win(s)</StatusPill>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      <SectionCard title="Recent Opportunities" description="Closing soon / recently updated (top 10).">
        {recent.length === 0 ? (
          <EmptyState title="No bids yet" description="Create your first GeBIZ opportunity to begin tracking strategy and results." ctaLabel="Add opportunity" ctaHref="/bidding/opportunities" />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 lg:hidden">
              {recent.map((r: any) => (
                <Link key={r.id} href={`/bidding/${r.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-950">{r.opportunityNo}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-600">{r.title}</p>
                      <p className="mt-2 text-xs text-neutral-500">{r.agency}</p>
                    </div>
                    <div className="text-right">
                      <StatusPill tone={r.status === "AWARDED" ? "success" : r.status === "LOST" ? "danger" : r.status === "SUBMITTED" ? "info" : r.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>
                        {r.status.replaceAll("_", " ")}
                      </StatusPill>
                      <p className="mt-2 text-xs font-semibold text-neutral-900">{formatCurrency(r.bidPrice)}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">Close {formatDate(r.closingDate)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1120px] w-full text-sm">
                <thead className="bg-stone-50 text-neutral-800">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold">Opportunity</th>
                    <th className="px-4 py-3 text-left font-semibold">Agency</th>
                    <th className="px-4 py-3 text-left font-semibold">Closing</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Bid Price</th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                    <th className="px-4 py-3 text-right font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {recent.map((r: any) => (
                    <tr key={r.id} className="hover:bg-stone-50/60">
                      <td className="px-4 py-3">
                        <Link href={`/bidding/${r.id}`} className="font-semibold text-neutral-950 hover:underline">
                          {r.opportunityNo}
                        </Link>
                        <div className="mt-0.5 line-clamp-1 text-xs text-neutral-600">{r.title}</div>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{r.agency}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDate(r.closingDate)}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={r.status === "AWARDED" ? "success" : r.status === "LOST" ? "danger" : r.status === "SUBMITTED" ? "info" : r.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>
                          {r.status.replaceAll("_", " ")}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(r.bidPrice)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{formatCurrency(r.estimatedCost)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{r.finalMargin != null ? `${(r.finalMargin * 100).toFixed(1)}%` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function KpiCard(props: { title: string; value: string; hint: string; tone?: "neutral" | "warning" | "success" | "danger" }) {
  const tone = props.tone ?? "neutral";
  const badge =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-neutral-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
          <p className="mt-2 text-sm text-neutral-600">{props.hint}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>Live</span>
      </div>
    </div>
  );
}

function RiskCard(props: { title: string; value: number; hint: string; tone: "danger" | "warning" | "neutral" }) {
  const badge =
    props.tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-white text-neutral-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
          <p className="mt-2 text-xs text-neutral-600">{props.hint}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>Risk</span>
      </div>
    </div>
  );
}
