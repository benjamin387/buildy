import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";
import { listBidCostVersions } from "@/lib/bidding/cost-builder";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(1)}%`;
}

export default async function BidCostVersionsPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id: opportunityId },
        select: { id: true, costingLockedAt: true, approvedCostVersionId: true, opportunityNo: true, title: true },
      }),
    null as any,
  );
  if (!opp) notFound();

  const versions = await safeQuery(() => listBidCostVersions(opportunityId), []);
  const locked = Boolean(opp.costingLockedAt);

  return (
    <main className="space-y-6">
      <SectionCard title="Cost Versions" description="Compare pricing strategies, then approve a final version to lock bid costing.">
        <div className="flex flex-wrap items-center gap-2">
          {locked ? <StatusPill tone="danger">Locked</StatusPill> : <StatusPill tone="info">Editable</StatusPill>}
          <p className="text-sm text-neutral-600">
            Approved version: <span className="font-semibold text-neutral-950">{opp.approvedCostVersionId ?? "-"}</span>
          </p>
          <p className="text-sm text-neutral-600">
            Locked at: <span className="font-semibold text-neutral-950">{formatDate(opp.costingLockedAt)}</span>
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link href={`/bidding/${opportunityId}/cost-builder`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
              Generate Versions
            </Link>
            <Link href={`/bidding/${opportunityId}/rfq`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
              RFQ Center
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Version Register" description="Approval is required to lock. Once locked, no further costing edits are allowed.">
        {versions.length === 0 ? (
          <EmptyState title="No cost versions yet" description="Generate a cost version from RFQs to start comparing strategies." />
        ) : (
          <div className="space-y-3">
            {versions.map((v: any) => {
              const isApproved = String(v.status) === "APPROVED";
              const tone =
                v.status === "APPROVED"
                  ? "success"
                  : v.status === "APPROVAL_REQUIRED"
                    ? "warning"
                    : v.status === "REJECTED"
                      ? "danger"
                      : "neutral";

              return (
                <details key={v.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">
                        Version v{v.versionNo} · {String(v.strategyMode).replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Status: {String(v.status).replaceAll("_", " ")} · Created: {formatDate(v.createdAt)} · Approved: {formatDate(v.approvedAt)}
                      </p>
                      {v.generatedFromRfqId ? (
                        <p className="mt-1 text-xs text-neutral-500">
                          Source RFQ:{" "}
                          <Link className="font-semibold text-neutral-900 underline" href={`/bidding/${opportunityId}/rfq/${v.generatedFromRfqId}`}>
                            Open
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={tone}>{String(v.status).replaceAll("_", " ")}</StatusPill>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(v.bidPrice ?? 0))}</p>
                        <p className="text-xs font-semibold text-neutral-600">{formatPercent(v.marginPercent)}</p>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Total Cost</p>
                      <p className="mt-2 text-lg font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(v.totalCost ?? 0))}</p>
                      <p className="mt-1 text-xs text-neutral-500">Includes preliminaries, overhead and contingency.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Bid Price</p>
                      <p className="mt-2 text-lg font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(v.bidPrice ?? 0))}</p>
                      <p className="mt-1 text-xs text-neutral-500">Submission pricing target.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Margin</p>
                      <p className="mt-2 text-lg font-semibold tabular-nums text-neutral-950">{formatPercent(v.marginPercent)}</p>
                      <p className="mt-1 text-xs text-neutral-500">Computed on bid price.</p>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-[820px] w-full text-left text-sm">
                      <thead className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-3 pr-3">Trade</th>
                          <th className="py-3 pr-3">Description</th>
                          <th className="py-3 pr-3 text-right">Cost</th>
                          <th className="py-3 pr-3 text-right">Sell</th>
                          <th className="py-3">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(v.lines ?? [])
                          .slice()
                          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                          .map((l: any) => (
                            <tr key={l.id}>
                              <td className="py-3 pr-3 font-semibold text-neutral-900">{String(l.tradeKey).replaceAll("_", " ")}</td>
                              <td className="py-3 pr-3 text-neutral-700">{l.description}</td>
                              <td className="py-3 pr-3 text-right font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(l.costAmount ?? 0))}</td>
                              <td className="py-3 pr-3 text-right font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(l.sellAmount ?? 0))}</td>
                              <td className="py-3 text-xs text-neutral-500">{l.sourceQuoteId ? "RFQ quote" : "-"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {!locked && !isApproved ? (
                      <form action={`/api/bidding/${opportunityId}/cost-builder/approve`} method="post" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="costVersionId" value={v.id} />
                        <input
                          name="remarks"
                          placeholder="Approval remarks (optional)"
                          className="h-11 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                        <ActionButton type="submit" variant="primary">
                          Approve & Lock
                        </ActionButton>
                      </form>
                    ) : null}
                    {isApproved ? <StatusPill tone="success">Approved</StatusPill> : null}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </SectionCard>
    </main>
  );
}

