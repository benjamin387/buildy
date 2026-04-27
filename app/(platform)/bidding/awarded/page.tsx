import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { convertAwardedBidAction } from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export const dynamic = "force-dynamic";

export default async function AwardedBidsPage() {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });

  const rows = await safeQuery(
    () =>
      prisma.bidOpportunity.findMany({
        where: { status: "AWARDED" },
        orderBy: [{ updatedAt: "desc" }],
        take: 300,
        include: {
          awardedProject: { select: { id: true, projectCode: true, name: true } },
          awardedContract: { select: { id: true, contractNumber: true, status: true } },
        },
      }),
    [] as any[],
  );

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Bidding"
        title="Awarded Contracts"
        subtitle="Convert awarded bids into Projects and Contract drafts so delivery and billing can start."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bidding/pipeline">
              <ActionButton variant="secondary">Pipeline</ActionButton>
            </Link>
            <Link href="/bidding/opportunities">
              <ActionButton variant="secondary">Opportunities</ActionButton>
            </Link>
          </div>
        }
      />

      <SectionCard title="Awarded List" description="Awarded bids can be converted into a Project + Contract draft (editable).">
        {rows.length === 0 ? (
          <EmptyState
            title="No awarded bids yet"
            description="Mark a bid as AWARDED from the bid workspace to enable conversion."
            ctaLabel="Open pipeline"
            ctaHref="/bidding/pipeline"
          />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 lg:hidden">
              {rows.slice(0, 60).map((o: any) => (
                <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/bidding/${o.id}`} className="text-sm font-semibold text-neutral-950 hover:underline">
                        {o.opportunityNo}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-600">{o.title}</p>
                      <p className="mt-2 text-xs text-neutral-500">{o.agency}</p>
                    </div>
                    <div className="text-right">
                      <StatusPill tone="success">AWARDED</StatusPill>
                      <p className="mt-2 text-xs font-semibold text-neutral-900">{formatCurrency(Number(o.bidPrice ?? 0))}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">Awarded {formatDate(o.awardedAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                    <span>Closing {formatDate(o.closingDate)}</span>
                    {o.awardedProject ? (
                      <Link href={`/projects/${o.awardedProject.id}`} className="font-semibold text-neutral-900 underline">
                        {o.awardedProject.projectCode ?? "Open Project"}
                      </Link>
                    ) : (
                      <form action={convertAwardedBidAction}>
                        <input type="hidden" name="opportunityId" value={o.id} />
                        <ActionButton size="sm">Convert</ActionButton>
                      </form>
                    )}
                  </div>
                </div>
              ))}
              {rows.length > 60 ? <p className="text-xs text-neutral-500">Showing first 60 results on mobile.</p> : null}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1180px] w-full text-sm">
              <thead className="bg-stone-50 text-neutral-800">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Opportunity</th>
                  <th className="px-4 py-3 text-left font-semibold">Agency</th>
                  <th className="px-4 py-3 text-left font-semibold">Closing</th>
                  <th className="px-4 py-3 text-left font-semibold">Awarded</th>
                  <th className="px-4 py-3 text-right font-semibold">Bid Price</th>
                  <th className="px-4 py-3 text-left font-semibold">Project</th>
                  <th className="px-4 py-3 text-left font-semibold">Contract</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((o: any) => (
                  <tr key={o.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/bidding/${o.id}`} className="font-semibold text-neutral-950 hover:underline">
                        {o.opportunityNo}
                      </Link>
                      <div className="mt-0.5 line-clamp-1 text-xs text-neutral-600">{o.title}</div>
                      <div className="mt-2">
                        <StatusPill tone="success">AWARDED</StatusPill>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{o.agency}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(o.closingDate)}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(o.awardedAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(Number(o.bidPrice ?? 0))}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {o.awardedProject ? (
                        <Link href={`/projects/${o.awardedProject.id}`} className="font-semibold hover:underline">
                          {o.awardedProject.projectCode ?? "Project"}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">Not converted</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {o.awardedContract ? (
                        <Link href={`/projects/${o.awardedProject?.id ?? ""}/contract/${o.awardedContract.id}`} className="font-semibold hover:underline">
                          {o.awardedContract.contractNumber}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {o.awardedProject ? (
                        <Link href={`/projects/${o.awardedProject.id}`}>
                          <ActionButton size="sm" variant="secondary">
                            Open Project
                          </ActionButton>
                        </Link>
                      ) : (
                        <form action={convertAwardedBidAction}>
                          <input type="hidden" name="opportunityId" value={o.id} />
                          <ActionButton size="sm">Convert</ActionButton>
                        </form>
                      )}
                    </td>
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
