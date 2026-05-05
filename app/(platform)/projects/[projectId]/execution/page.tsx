import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ActionButton } from "@/app/components/ui/action-button";
import { safeQuery } from "@/lib/server/safe-query";
import {
  convertProcurementToPoAction,
  convertProcurementToSubcontractAction,
  createBudgetRevisionAction,
  generateExecutionCashflowSnapshotAction,
  lockBudgetAction,
  refreshExecutionAlertsAction,
  setProcurementPlannedVendorAction,
  unlockBudgetAction,
} from "@/app/(platform)/projects/[projectId]/execution/actions";

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

export default async function ProjectExecutionPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await safeQuery(
    () =>
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, projectCode: true },
      }),
    null,
  );
  if (!project) notFound();

  const [budget, budgets, procurementPlan, vendors, committedAgg, alerts, poCommitted, subCommitted, billsActual] = await Promise.all([
    safeQuery(
      () =>
        prisma.projectBudget.findFirst({
          where: { projectId, status: "LOCKED", isActive: true },
          orderBy: [{ lockedAt: "desc" }, { versionNo: "desc" }],
          include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 80 } },
        }),
      null as any,
    ),
    safeQuery(
      () =>
        prisma.projectBudget.findMany({
          where: { projectId },
          orderBy: [{ versionNo: "desc" }, { createdAt: "desc" }],
          take: 20,
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.projectProcurementPlan.findFirst({
          where: { projectId },
          orderBy: [{ createdAt: "desc" }],
          include: {
            items: {
              orderBy: [{ status: "asc" }, { tradeKey: "asc" }],
              include: {
                plannedVendor: { select: { id: true, name: true, type: true, gstRegistered: true } },
                purchaseOrder: { select: { id: true, poNumber: true, status: true } },
                subcontract: { select: { id: true, title: true, status: true } },
              },
            },
          },
        }),
      null as any,
    ),
    safeQuery(
      () =>
        prisma.vendor.findMany({
          orderBy: [{ name: "asc" }],
          select: { id: true, name: true, type: true },
          take: 300,
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.projectProcurementPlanItem.aggregate({
          where: { plan: { projectId }, status: { not: "CANCELLED" } },
          _sum: { committedAmount: true },
        }),
      { _sum: { committedAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.pnLAlert.findMany({
          where: { projectId, isResolved: false },
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          take: 20,
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.purchaseOrder.aggregate({
          where: { projectId, status: { in: ["DRAFT", "ISSUED", "ACKNOWLEDGED"] } },
          _sum: { totalAmount: true },
        }),
      { _sum: { totalAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.subcontract.aggregate({
          where: { projectId, status: { in: ["DRAFT", "ACTIVE"] } },
          _sum: { totalAmount: true },
        }),
      { _sum: { totalAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.supplierBill.aggregate({
          where: { projectId, status: { not: "VOID" } },
          _sum: { totalAmount: true },
        }),
      { _sum: { totalAmount: 0 } } as any,
    ),
  ]);

  const committedCost = Number(poCommitted?._sum?.totalAmount ?? 0) + Number(subCommitted?._sum?.totalAmount ?? 0);
  const actualCost = Number(billsActual?._sum?.totalAmount ?? 0);
  const procurementCommitted = Number(committedAgg?._sum?.committedAmount ?? 0);
  const budgetCost = Number(budget?.totalCost ?? 0);
  const remainingToCommit = budgetCost > 0 ? Math.max(budgetCost - procurementCommitted, 0) : 0;

  return (
    <main className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-4">
        <Metric title="Budget Revenue" value={formatCurrency(Number(budget?.totalRevenue ?? 0))} />
        <Metric title="Budget Cost" value={formatCurrency(Number(budget?.totalCost ?? 0))} />
        <Metric title="Committed Cost" value={formatCurrency(committedCost)} />
        <Metric title="Actual Cost" value={formatCurrency(actualCost)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Metric title="Procurement Committed" value={formatCurrency(procurementCommitted)} />
        <Metric title="Remaining to Commit" value={formatCurrency(remainingToCommit)} />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Execution Alerts</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-neutral-950">{alerts.length}</p>
          <p className="mt-2 text-sm text-neutral-600">Active risk items</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={refreshExecutionAlertsAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <ActionButton size="sm" variant="secondary" type="submit">
                Refresh
              </ActionButton>
            </form>
            <form action={generateExecutionCashflowSnapshotAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <ActionButton size="sm" type="submit">
                Generate Cashflow
              </ActionButton>
            </form>
          </div>
        </div>
      </section>

      {alerts.length > 0 ? (
        <SectionCard title="Execution Risk Alerts" description="Strict controls and risk detections for post-award delivery.">
          <div className="space-y-2">
            {alerts.map((a: any) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      tone={
                        a.severity === "CRITICAL"
                          ? "danger"
                          : a.severity === "HIGH"
                            ? "danger"
                            : a.severity === "MEDIUM"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {String(a.severity)}
                    </StatusPill>
                    <StatusPill tone="neutral">{String(a.type).replaceAll("_", " ")}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-neutral-900">{a.message}</p>
                  <p className="mt-1 text-xs text-neutral-500">Created {formatDate(a.createdAt)}</p>
                </div>
                <Link href={`/projects/${projectId}/pnl`} className="shrink-0">
                  <ActionButton size="sm" variant="secondary">
                    Open P&L
                  </ActionButton>
                </Link>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Budget Lock" description="Baseline budget snapshot used for cost control and procurement planning.">
          {budget ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={budget.status === "LOCKED" ? "success" : "warning"}>
                  {String(budget.status).replaceAll("_", " ")}
                </StatusPill>
                {budget.isActive ? <StatusPill tone="success">ACTIVE BASELINE</StatusPill> : <StatusPill tone="neutral">INACTIVE</StatusPill>}
                <StatusPill tone="neutral">{String(budget.sourceType).replaceAll("_", " ")}</StatusPill>
                <div className="ml-auto text-sm text-neutral-600">Locked: {formatDate(budget.lockedAt)}</div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-neutral-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Trade</th>
                      <th className="px-4 py-3 text-left font-semibold">Description</th>
                      <th className="px-4 py-3 text-right font-semibold">Cost</th>
                      <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {(budget.lines ?? []).slice(0, 25).map((l: any) => (
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

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/projects/${projectId}/pnl`} className="inline-flex">
                  <ActionButton variant="secondary">Open P&L</ActionButton>
                </Link>
                <Link href={`/projects/${projectId}/cashflow`} className="inline-flex">
                  <ActionButton variant="secondary">Open Cashflow</ActionButton>
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title="No budget baseline yet"
              description="Budget lock is typically created during tender award conversion. You can still proceed with POs, bills and project delivery without it."
              ctaLabel="Open Awarded Bids"
              ctaHref="/bidding/awarded"
            />
          )}
        </SectionCard>

        <SectionCard title="Procurement Plan" description="Planned procurements mapped to trades for faster PO/subcontract issuance.">
          {procurementPlan ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={procurementPlan.status === "ACTIVE" ? "success" : "neutral"}>
                  {String(procurementPlan.status).replaceAll("_", " ")}
                </StatusPill>
                <div className="ml-auto text-sm text-neutral-600">Items: {procurementPlan.items?.length ?? 0}</div>
              </div>

              <div className="mt-5 space-y-3">
                {(procurementPlan.items ?? []).slice(0, 20).map((it: any) => (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-neutral-950">{tradeLabel(String(it.tradeKey))}</p>
                      <StatusPill tone={it.status === "COMPLETED" ? "success" : it.status === "CANCELLED" ? "danger" : "neutral"}>
                        {String(it.status).replaceAll("_", " ")}
                      </StatusPill>
                      <StatusPill tone="neutral">{String(it.itemType).replaceAll("_", " ")}</StatusPill>
                      <div className="ml-auto font-semibold tabular-nums text-neutral-950">
                        {formatCurrency(Number(it.plannedAmount ?? 0))}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-neutral-600">{it.title}</p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-3">
                      <form action={setProcurementPlannedVendorAction} className="lg:col-span-2">
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="planItemId" value={it.id} />
                        <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          Planned Vendor
                        </label>
                        <select
                          name="vendorId"
                          defaultValue={it.plannedVendorId ?? ""}
                          className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        >
                          <option value="">Not set</option>
                          {vendors.map((v: any) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({String(v.type).replaceAll("_", " ")})
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 flex justify-end">
                          <ActionButton size="sm" variant="secondary" type="submit">
                            Save
                          </ActionButton>
                        </div>
                      </form>

                      <div className="rounded-md border border-slate-200 bg-stone-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Committed</p>
                        <p className="mt-2 text-sm font-semibold tabular-nums text-neutral-950">
                          {formatCurrency(Number(it.committedAmount ?? 0))}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">{it.committedAt ? `At ${formatDate(it.committedAt)}` : "Not committed"}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {it.purchaseOrderId ? (
                        <Link href={`/projects/${projectId}/purchase-orders/${it.purchaseOrderId}`} className="inline-flex">
                          <ActionButton size="sm" variant="secondary">
                            Open PO {it.purchaseOrder?.poNumber ?? ""}
                          </ActionButton>
                        </Link>
                      ) : it.itemType === "PURCHASE_ORDER" ? (
                        <form action={convertProcurementToPoAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="planItemId" value={it.id} />
                          <input
                            type="date"
                            name="issueDate"
                            defaultValue={new Date().toISOString().slice(0, 10)}
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-neutral-200"
                          />
                          <input
                            type="date"
                            name="expectedDeliveryDate"
                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-neutral-200"
                          />
                          <ActionButton size="sm" type="submit">
                            Create PO
                          </ActionButton>
                        </form>
                      ) : null}

                      {it.subcontractId ? (
                        <Link href={`/projects/${projectId}/suppliers/subcontracts/${it.subcontractId}`} className="inline-flex">
                          <ActionButton size="sm" variant="secondary">
                            Open Subcontract
                          </ActionButton>
                        </Link>
                      ) : it.itemType === "SUBCONTRACT" ? (
                        <form action={convertProcurementToSubcontractAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="planItemId" value={it.id} />
                          <ActionButton size="sm" type="submit">
                            Create Subcontract
                          </ActionButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/projects/${projectId}/purchase-orders`} className="inline-flex">
                  <ActionButton variant="secondary">Purchase Orders</ActionButton>
                </Link>
                <Link href={`/projects/${projectId}/subcontracts`} className="inline-flex">
                  <ActionButton variant="secondary">Subcontracts</ActionButton>
                </Link>
                <Link href={`/projects/${projectId}/supplier-bills`} className="inline-flex">
                  <ActionButton variant="secondary">Supplier Bills</ActionButton>
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title="No procurement plan yet"
              description="Procurement plan is created automatically from tender budget lock. You can still create POs/Subcontracts directly."
              ctaLabel="Purchase Orders"
              ctaHref={`/projects/${projectId}/purchase-orders`}
              secondaryLabel="Subcontracts"
              secondaryHref={`/projects/${projectId}/subcontracts`}
            />
          )}
        </SectionCard>
      </section>

      <SectionCard title="Budget Versions" description="Create revisions, lock a new baseline, and unlock (Director-only) when necessary.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form action={createBudgetRevisionAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input
              type="text"
              name="note"
              placeholder="Revision note (optional)"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 sm:w-[360px]"
            />
            <ActionButton type="submit" variant="secondary">
              Create Revision
            </ActionButton>
          </form>
          <Link href={`/bidding/awarded`} className="inline-flex">
            <ActionButton variant="secondary">Awarded Bids</ActionButton>
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-stone-50 text-neutral-800">
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left font-semibold">Version</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="px-4 py-3 text-left font-semibold">Locked</th>
                <th className="px-4 py-3 text-left font-semibold">Unlocked</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {budgets.map((b: any) => (
                <tr key={b.id} className="hover:bg-stone-50/60">
                  <td className="px-4 py-3 font-semibold text-neutral-950">v{b.versionNo}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={b.status === "LOCKED" ? "success" : "warning"}>{String(b.status)}</StatusPill>
                      {b.isActive ? <StatusPill tone="success">ACTIVE</StatusPill> : <StatusPill tone="neutral">-</StatusPill>}
                      <StatusPill tone="neutral">{String(b.sourceType).replaceAll("_", " ")}</StatusPill>
                    </div>
                    {b.notes ? <p className="mt-2 line-clamp-1 text-xs text-neutral-600">{b.notes}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-950">
                    {formatCurrency(Number(b.totalRevenue ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-950">
                    {formatCurrency(Number(b.totalCost ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{formatDate(b.lockedAt)}</td>
                  <td className="px-4 py-3 text-neutral-700">{formatDate(b.unlockedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {b.status !== "LOCKED" ? (
                        <form action={lockBudgetAction}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="budgetId" value={b.id} />
                          <ActionButton size="sm" type="submit">
                            Lock Baseline
                          </ActionButton>
                        </form>
                      ) : null}
                      {b.status === "LOCKED" ? (
                        <form action={unlockBudgetAction} className="flex items-center gap-2">
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="budgetId" value={b.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Unlock reason (Director only)"
                            className="h-10 w-[240px] rounded-lg border border-slate-200 bg-white px-3 text-xs shadow-sm outline-none focus:ring-2 focus:ring-neutral-200"
                          />
                          <ActionButton size="sm" variant="secondary" type="submit">
                            Unlock
                          </ActionButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {budgets.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-neutral-600" colSpan={7}>
                    No budgets found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
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
