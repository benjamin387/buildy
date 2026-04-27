import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function BidCostBuilderPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id: opportunityId },
        select: { id: true, opportunityNo: true, title: true, costingLockedAt: true, approvedCostVersionId: true },
      }),
    null as any,
  );
  if (!opp) notFound();

  const rfqs = await safeQuery(
    () =>
      prisma.bidRfq.findMany({
        where: { opportunityId },
        orderBy: [{ createdAt: "desc" }],
        select: { id: true, title: true, status: true, replyDeadline: true, createdAt: true, _count: { select: { quotes: true } } },
        take: 30,
      }),
    [],
  );

  const locked = Boolean(opp.costingLockedAt);

  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Auto Cost Builder"
            description="Generate cost versions from preferred supplier quotes. Versions are approval-gated and lock after director approval."
          >
            <div className="flex flex-wrap items-center gap-2">
              {locked ? <StatusPill tone="danger">Locked</StatusPill> : <StatusPill tone="info">Editable</StatusPill>}
              <p className="text-sm text-neutral-600">
                Approved version: <span className="font-semibold text-neutral-950">{opp.approvedCostVersionId ?? "-"}</span>
              </p>
              <p className="text-sm text-neutral-600">
                Locked at: <span className="font-semibold text-neutral-950">{formatDate(opp.costingLockedAt)}</span>
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/bidding/${opportunityId}/rfq`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                Back to RFQ Center
              </Link>
              <Link href={`/bidding/${opportunityId}/cost-versions`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                View Cost Versions
              </Link>
            </div>
          </SectionCard>
        </div>

        <div className="lg:col-span-1">
          <SectionCard title="Generate Cost Version" description="Pick an RFQ and strategy mode. Preferred quotes are used when set; otherwise cheapest submitted quote is used.">
            {locked ? (
              <EmptyState title="Costing is locked" description="Once approved, costing is locked to protect submission integrity. Create a new opportunity if revisions are required." />
            ) : rfqs.length === 0 ? (
              <EmptyState title="No RFQs available" description="Create an RFQ and collect supplier quotes before generating a cost version." />
            ) : (
              <form action={`/api/bidding/${opportunityId}/cost-builder/generate`} method="post" className="grid gap-3">
                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Source RFQ</label>
                  <select name="rfqId" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                    {rfqs.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        {r.title} · {String(r.status).replaceAll("_", " ")} · Quotes {r._count?.quotes ?? 0}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-neutral-500">Latest RFQs appear first.</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Bid Strategy Mode</label>
                  <select
                    name="strategyMode"
                    defaultValue="BALANCED"
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  >
                    <option value="CONSERVATIVE">Conservative (higher margin)</option>
                    <option value="BALANCED">Balanced</option>
                    <option value="AGGRESSIVE">Aggressive (more competitive)</option>
                  </select>
                </div>

                <div className="flex justify-end pt-2">
                  <ActionButton type="submit">Generate Version</ActionButton>
                </div>
              </form>
            )}
          </SectionCard>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Strategy Guidance" description="Use strategy modes to explore pricing positions without losing traceability.">
          <div className="space-y-3 text-sm text-neutral-700">
            <p>
              <span className="font-semibold text-neutral-950">Conservative</span>: protects margin, suitable when scope risk is high or capacity is constrained.
            </p>
            <p>
              <span className="font-semibold text-neutral-950">Balanced</span>: standard pricing posture for most tenders.
            </p>
            <p>
              <span className="font-semibold text-neutral-950">Aggressive</span>: competitive pricing posture to improve win probability, subject to director sign-off.
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Next Steps" description="After generating versions, compare and submit for director approval to lock.">
          <div className="space-y-3">
            <Link href={`/bidding/${opportunityId}/cost-versions`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50">
              <p className="text-sm font-semibold text-neutral-950">Review cost versions</p>
              <p className="mt-1 text-sm text-neutral-600">Compare bid price and margin across strategies, then approve the final submission version.</p>
            </Link>
            <Link href={`/bidding/${opportunityId}/approval`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50">
              <p className="text-sm font-semibold text-neutral-950">Submission approval checklist</p>
              <p className="mt-1 text-sm text-neutral-600">Ensure compliance and documents are ready before submission.</p>
            </Link>
          </div>
        </SectionCard>
      </section>
    </main>
  );
}
