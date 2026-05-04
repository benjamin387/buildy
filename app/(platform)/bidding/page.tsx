import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { safeQuery } from "@/lib/server/safe-query";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BiddingHomePage() {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });

  const now = new Date();
  const in7 = new Date(now);
  in7.setDate(in7.getDate() + 7);

  const [openCount, closingSoonCount, submittedCount, awardedAgg, recent] = await Promise.all([
    safeQuery(() => prisma.bidOpportunity.count({ where: { status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL"] } } }), 0),
    safeQuery(() => prisma.bidOpportunity.count({ where: { closingDate: { lte: in7 }, status: { in: ["WATCHING", "PREPARING", "PENDING_APPROVAL"] } } }), 0),
    safeQuery(() => prisma.bidOpportunity.count({ where: { status: "SUBMITTED" } }), 0),
    safeQuery(async () => {
      const agg = await prisma.bidOpportunity.aggregate({
        _sum: { bidPrice: true },
        where: { status: "AWARDED" },
      });
      return Number(agg._sum.bidPrice ?? 0);
    }, 0),
    safeQuery(
      () =>
        prisma.bidOpportunity.findMany({
          orderBy: [{ closingDate: "asc" }, { updatedAt: "desc" }],
          take: 5,
        }),
      [] as any[],
    ),
  ]);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Bidding"
        title="GeBIZ Contract Bidding Center"
        subtitle="Track opportunities, manage costing and margin, complete document checklists, and run approvals before submission."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bidding/opportunities"><ActionButton>GeBIZ Opportunities</ActionButton></Link>
            <Link href="/bidding/pipeline"><ActionButton variant="secondary">Pipeline</ActionButton></Link>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Open Bids" value={String(openCount)} hint="Watching / Preparing / Pending approval" />
        <KpiCard title="Closing Soon" value={String(closingSoonCount)} hint="Next 7 days" tone={closingSoonCount > 0 ? "warning" : "neutral"} />
        <KpiCard title="Submitted" value={String(submittedCount)} hint="Awaiting results" />
        <KpiCard title="Awarded Value" value={formatCurrency(awardedAgg)} hint="Total bid price (awarded)" tone={awardedAgg > 0 ? "success" : "neutral"} />
      </section>

      <SectionCard
        title="Quick Navigation"
        description="Use the bidding workflow tabs per opportunity to manage costing, documents, and approvals."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuickLink href="/bidding/opportunities" title="GeBIZ Opportunities" subtitle="Manual entry, paste-import, register view" />
          <QuickLink href="/bidding/pipeline" title="Bid Pipeline" subtitle="Board view by status" />
          <QuickLink href="/bidding/awarded" title="Awarded Contracts" subtitle="Convert awarded bid into Project + Contract draft" />
          <QuickLink href="/bidding/analytics" title="Director Analytics" subtitle="Win rate, risk exposure, competitor signals (exec-only)" />
        </div>
      </SectionCard>

      <SectionCard
        title="Closing & Recent"
        description="Next items by closing date."
        actions={
          <Link href="/bidding/opportunities"><ActionButton variant="secondary">View all</ActionButton></Link>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            title="No opportunities yet"
            description="Add your first GeBIZ opportunity (manual or paste-import) to start the pipeline."
            ctaLabel="Add opportunity"
            ctaHref="/bidding/opportunities"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-stone-50 text-neutral-800">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Opportunity</th>
                  <th className="px-4 py-3 text-left font-semibold">Agency</th>
                  <th className="px-4 py-3 text-left font-semibold">Closing</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Bid Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {recent.map((o: any) => (
                  <tr key={o.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/bidding/${o.id}`} className="font-semibold text-neutral-950 hover:underline">
                        {o.opportunityNo}
                      </Link>
                      <div className="mt-0.5 line-clamp-1 text-xs text-neutral-600">{o.title}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{o.agency}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(o.closingDate)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={o.status === "AWARDED" ? "success" : o.status === "LOST" ? "danger" : o.status === "SUBMITTED" ? "info" : "neutral"}>
                        {String(o.status).replaceAll("_", " ")}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(Number(o.bidPrice ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function KpiCard(props: { title: string; value: string; hint: string; tone?: "neutral" | "warning" | "success" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
          <p className="mt-2 text-sm text-neutral-600">{props.hint}</p>
        </div>
        <StatusPill tone={props.tone === "warning" ? "warning" : props.tone === "success" ? "success" : "neutral"}>Live</StatusPill>
      </div>
    </div>
  );
}

function QuickLink(props: { href: string; title: string; subtitle: string }) {
  return (
    <Link href={props.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50">
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <p className="mt-1 text-xs text-neutral-600">{props.subtitle}</p>
      <StatusPill className="mt-3" tone="neutral">Open</StatusPill>
    </Link>
  );
}
