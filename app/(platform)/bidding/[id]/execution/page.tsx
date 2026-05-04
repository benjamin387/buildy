import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { safeQuery } from "@/lib/server/safe-query";
import { convertAwardedBidAction } from "@/app/(platform)/bidding/actions";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function tradeLabel(key: string): string {
  return key
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function BidExecutionPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;
  const sp = props.searchParams ? await props.searchParams : {};

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id },
        select: {
          id: true,
          opportunityNo: true,
          title: true,
          agency: true,
          status: true,
          awardedAt: true,
          approvedCostVersionId: true,
          costingLockedAt: true,
          approvedCostVersion: { select: { id: true, status: true, versionNo: true } },
          awardedProject: { select: { id: true, projectCode: true, name: true } },
          awardedContract: { select: { id: true, contractNumber: true, status: true } },
        },
      }),
    null,
  );

  if (!opp) notFound();

  const budget = opp.awardedProject
    ? await safeQuery(
        () =>
          prisma.projectBudget.findFirst({
            where: { projectId: opp.awardedProject!.id },
            orderBy: [{ lockedAt: "desc" }, { createdAt: "desc" }],
            include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 50 } },
          }),
        null as any,
      )
    : null;

  const procurementPlan = opp.awardedProject
    ? await safeQuery(
        () =>
          prisma.projectProcurementPlan.findFirst({
            where: { projectId: opp.awardedProject!.id },
            orderBy: [{ createdAt: "desc" }],
            include: { items: { orderBy: [{ status: "asc" }, { tradeKey: "asc" }] } },
          }),
        null as any,
      )
    : null;

  const hasApprovedCosting = Boolean(opp.approvedCostVersion && String(opp.approvedCostVersion.status) === "APPROVED");
  const canConvert = opp.status === "AWARDED" && !opp.awardedProject && hasApprovedCosting;

  return (
    <main className="space-y-6">
      <SectionCard
        title="Post-Award Execution"
        description="Convert awarded tenders into a structured project execution baseline (budget lock + procurement plan)."
      >
        {/* Error banner via redirect query */}
        {sp.error ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {Array.isArray(sp.error) ? sp.error.join(", ") : String(sp.error)}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <Metric title="Status" value={String(opp.status).replaceAll("_", " ")} />
          <Metric title="Awarded At" value={formatDate(opp.awardedAt)} />
          <Metric title="Costing Locked" value={opp.costingLockedAt ? formatDate(opp.costingLockedAt) : "-"} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {canConvert ? (
            <form action={convertAwardedBidAction}>
              <input type="hidden" name="opportunityId" value={opp.id} />
              <ActionButton type="submit">Convert to Project + Setup Execution</ActionButton>
            </form>
          ) : null}

          {opp.awardedProject ? (
            <Link href={`/projects/${opp.awardedProject.id}`} className="inline-flex">
              <ActionButton variant="secondary">Open Project</ActionButton>
            </Link>
          ) : (
            <Link href="/projects" className="inline-flex">
              <ActionButton variant="secondary">Open Projects</ActionButton>
            </Link>
          )}

          {opp.awardedProject ? (
            <Link href={`/projects/${opp.awardedProject.id}/execution`} className="inline-flex">
              <ActionButton variant="secondary">Execution Dashboard</ActionButton>
            </Link>
          ) : null}
        </div>

        {!opp.awardedProject ? (
          <div className="mt-6">
            <EmptyState
              title="No project created yet"
              description={
                opp.status !== "AWARDED"
                  ? "Mark this opportunity as AWARDED first. Then convert it into a project to initialize execution controls."
                  : !hasApprovedCosting
                    ? "Conversion is blocked until tender costing is approved. Approve a cost version first, then retry conversion."
                  : "Convert this awarded tender into a project to generate a baseline budget lock and procurement plan."
              }
              ctaLabel="Back to Bid Workspace"
              ctaHref={`/bidding/${opp.id}`}
              secondaryLabel="Open Awarded"
              secondaryHref="/bidding/awarded"
            />
          </div>
        ) : null}
      </SectionCard>

      {opp.awardedProject ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Budget Baseline Lock" description="Baseline budget snapshot derived from approved tender costing.">
            {budget ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={budget.status === "LOCKED" ? "success" : "warning"}>
                    {String(budget.status).replaceAll("_", " ")}
                  </StatusPill>
                  <StatusPill tone="neutral">{String(budget.sourceType).replaceAll("_", " ")}</StatusPill>
                  <div className="ml-auto text-sm text-neutral-600">Locked: {formatDate(budget.lockedAt)}</div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Metric title="Total Revenue" value={formatCurrency(Number(budget.totalRevenue ?? 0))} />
                  <Metric title="Total Cost" value={formatCurrency(Number(budget.totalCost ?? 0))} />
                </div>
                <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-stone-50 text-neutral-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Trade</th>
                        <th className="px-4 py-3 text-left font-semibold">Description</th>
                        <th className="px-4 py-3 text-right font-semibold">Cost</th>
                        <th className="px-4 py-3 text-right font-semibold">Sell</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {(budget.lines ?? []).slice(0, 20).map((l: any) => (
                        <tr key={l.id}>
                          <td className="px-4 py-3 font-semibold text-neutral-900">{tradeLabel(String(l.tradeKey))}</td>
                          <td className="px-4 py-3 text-neutral-700">{l.description}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                            {formatCurrency(Number(l.costAmount ?? 0))}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                            {formatCurrency(Number(l.revenueAmount ?? 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(budget.lines?.length ?? 0) > 20 ? (
                  <p className="mt-3 text-sm text-neutral-600">Showing first 20 lines.</p>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No budget baseline found"
                description="This is typically generated during conversion if an approved cost version exists."
                ctaLabel="Open Cost Versions"
                ctaHref={`/bidding/${opp.id}/cost-versions`}
              />
            )}
          </SectionCard>

          <SectionCard title="Procurement Plan" description="Planned purchases and subcontracts derived from budget trades.">
            {procurementPlan ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={procurementPlan.status === "ACTIVE" ? "success" : "neutral"}>
                    {String(procurementPlan.status).replaceAll("_", " ")}
                  </StatusPill>
                  <div className="ml-auto text-sm text-neutral-600">
                    Items: {procurementPlan.items?.length ?? 0}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {(procurementPlan.items ?? []).slice(0, 12).map((it: any) => (
                    <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-neutral-950">{tradeLabel(String(it.tradeKey))}</p>
                        <StatusPill tone={it.status === "COMPLETED" ? "success" : it.status === "CANCELLED" ? "danger" : "neutral"}>
                          {String(it.status).replaceAll("_", " ")}
                        </StatusPill>
                        <div className="ml-auto font-semibold tabular-nums text-neutral-950">
                          {formatCurrency(Number(it.plannedAmount ?? 0))}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-neutral-600">{it.title}</p>
                    </div>
                  ))}
                </div>
                {(procurementPlan.items?.length ?? 0) > 12 ? (
                  <p className="mt-3 text-sm text-neutral-600">Showing first 12 items.</p>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No procurement plan found"
                description="This is typically generated during conversion from the locked tender budget."
                ctaLabel="Open Purchase Orders"
                ctaHref={`/projects/${opp.awardedProject.id}/purchase-orders`}
              />
            )}
          </SectionCard>
        </section>
      ) : null}
    </main>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-neutral-950">{props.value}</p>
    </div>
  );
}
