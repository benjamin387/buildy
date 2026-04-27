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
import { computeClosingRisk, computeTenderFitScoreLight } from "@/lib/bidding/intelligence";

const COLUMNS: Array<{ key: string; label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = [
  { key: "WATCHING", label: "Watching", tone: "neutral" },
  { key: "PREPARING", label: "Preparing", tone: "info" },
  { key: "PENDING_APPROVAL", label: "Pending Approval", tone: "warning" },
  { key: "SUBMITTED", label: "Submitted", tone: "info" },
  { key: "AWARDED", label: "Awarded", tone: "success" },
  { key: "LOST", label: "Lost", tone: "danger" },
];

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidPipelinePage() {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });

  const rows = await safeQuery(
    () =>
      prisma.bidOpportunity.findMany({
        orderBy: [{ closingDate: "asc" }, { updatedAt: "desc" }],
        take: 800,
      }),
    [] as any[],
  );

  const byStatus = new Map<string, any[]>();
  for (const c of COLUMNS) byStatus.set(c.key, []);
  for (const r of rows) {
    const key = String(r.status);
    if (!byStatus.has(key)) byStatus.set(key, []);
    byStatus.get(key)!.push(r);
  }

  const total = rows.length;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Bidding"
        title="Bid Pipeline"
        subtitle="Board view by bid status. Open a card to work in the bid workspace."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bidding/opportunities">
              <ActionButton>GeBIZ Opportunities</ActionButton>
            </Link>
            <Link href="/bidding">
              <ActionButton variant="secondary">Bidding Home</ActionButton>
            </Link>
          </div>
        }
      />

      <SectionCard title="Pipeline Board" description={`Total opportunities: ${total}.`}>
        {total === 0 ? (
          <EmptyState
            title="No opportunities yet"
            description="Add a GeBIZ opportunity to start the bid pipeline."
            ctaLabel="Add opportunity"
            ctaHref="/bidding/opportunities"
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {COLUMNS.map((c) => {
              const items = byStatus.get(c.key) ?? [];
              return (
                <div key={c.key} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-stone-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">{c.label}</p>
                      <p className="text-xs text-neutral-500">{items.length} item(s)</p>
                    </div>
                    <StatusPill tone={c.tone}>{c.key.replaceAll("_", " ")}</StatusPill>
                  </div>
                  <div className="space-y-3 p-3">
                    {items.slice(0, 20).map((o: any) => (
                      (() => {
                        const risk = computeClosingRisk(o.closingDate ?? null, new Date());
                        const fit = computeTenderFitScoreLight({
                          title: o.title,
                          agency: o.agency,
                          category: o.category ?? null,
                          procurementType: String(o.procurementType),
                          estimatedValue: o.estimatedValue,
                          closingDate: o.closingDate ?? null,
                        });
                        const riskTone =
                          risk.severity === "CRITICAL" || risk.severity === "HIGH"
                            ? "danger"
                            : risk.severity === "MEDIUM"
                              ? "warning"
                              : risk.severity === "LOW"
                                ? "info"
                                : "neutral";

                        return (
                          <Link
                            key={o.id}
                            href={`/bidding/${o.id}`}
                            className="block rounded-2xl border border-slate-200 bg-white p-3 transition hover:bg-stone-50"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-neutral-950">{o.opportunityNo}</p>
                              <div className="flex items-center gap-2">
                                <StatusPill tone={riskTone}>{risk.severity === "NONE" ? "OK" : risk.severity}</StatusPill>
                                <p className="text-[11px] text-neutral-500">{formatDate(o.closingDate)}</p>
                              </div>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-700">{o.title}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="truncate text-[11px] text-neutral-500">{o.agency}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-neutral-700 tabular-nums">{fit}</span>
                                <p className="text-[11px] font-semibold text-neutral-800">{formatCurrency(Number(o.bidPrice ?? 0))}</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })()
                    ))}
                    {items.length > 20 ? (
                      <p className="px-1 text-[11px] text-neutral-500">+ {items.length - 20} more</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </main>
  );
}
