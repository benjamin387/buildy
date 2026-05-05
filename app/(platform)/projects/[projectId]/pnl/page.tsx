import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import type { ReactNode } from "react";
import {
  approveVariationOrder,
  createActualCost,
  createVariationOrder,
  refreshPnLAlertsAction,
  resolvePnLAlertAction,
} from "@/app/(platform)/projects/[projectId]/pnl/actions";
import { computeProjectPnlMetrics } from "@/lib/pnl/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { ActionButton } from "@/app/components/ui/action-button";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function todayIsoDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function ProjectPnlPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PNL_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { commercialProfile: true, client: true },
  });
  if (!project) notFound();

  const metrics = await computeProjectPnlMetrics(projectId);

  const alerts = await prisma.pnLAlert.findMany({
    where: { projectId, isResolved: false },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const resolvedAlerts = await prisma.pnLAlert.findMany({
    where: { projectId, isResolved: true },
    orderBy: [{ resolvedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const vos = await prisma.variationOrder.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  const actualCosts = await prisma.actualCostEntry.findMany({
    where: { projectId },
    include: { vendor: true },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Per-Project P&L"
        title="Profitability Dashboard"
        subtitle="Quoted revenue, approved variations, estimated cost, committed cost, actual cost, and collected payments."
        actions={
          <form action={refreshPnLAlertsAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <ActionButton type="submit" variant="secondary">
              Refresh Alerts
            </ActionButton>
          </form>
        }
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-950">Executive P&amp;L</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Bank-grade commercial snapshot: revenue, receivables, cost, profit, and margin.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill
              label="Overdue"
              severity={metrics.overdueInvoiceOutstanding > 0.01 ? "HIGH" : "LOW"}
              value={formatCurrency(metrics.overdueInvoiceOutstanding)}
            />
            <SeverityPill
              label="Receivables"
              severity={metrics.outstandingReceivables > 0.01 ? "MEDIUM" : "LOW"}
              value={formatCurrency(metrics.outstandingReceivables)}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric title="Quoted Revenue" value={formatCurrency(metrics.quotedRevenueNet)} />
          <Metric title="Invoiced Revenue" value={formatCurrency(metrics.invoicedRevenueNet)} />
          <Metric title="Collected Revenue" value={formatCurrency(metrics.collectedRevenue)} />
          <Metric title="Outstanding Receivables" value={formatCurrency(metrics.outstandingReceivables)} />
          <Metric title="Overdue Receivables" value={formatCurrency(metrics.overdueInvoiceOutstanding)} />

          <Metric title="Committed Cost" value={formatCurrency(metrics.committedCost)} />
          <Metric title="Actual Cost" value={formatCurrency(metrics.actualCost)} />
          <Metric title="Projected Gross Profit" value={formatCurrency(metrics.projectedProfit)} />
          <Metric title="Actual Gross Profit" value={formatCurrency(metrics.actualProfit)} />
          <Metric title="Projected Margin %" value={`${metrics.projectedMarginPercent.toFixed(1)}%`} />
          <Metric title="Actual Margin %" value={`${metrics.actualMarginPercent.toFixed(1)}%`} />
          <Metric title="Baseline Margin %" value={metrics.baselineMarginPercent === null ? "-" : `${Number(metrics.baselineMarginPercent).toFixed(1)}%`} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Cost Control" subtitle="Estimated vs committed vs actual. Committed includes issued POs + active subcontracts.">
          <BarRow
            label="Estimated"
            value={metrics.estimatedCost}
            max={Math.max(metrics.estimatedCost, metrics.committedCost, metrics.actualCost, 1)}
          />
          <BarRow
            label="Committed"
            value={metrics.committedCost}
            max={Math.max(metrics.estimatedCost, metrics.committedCost, metrics.actualCost, 1)}
          />
          <BarRow
            label="Actual"
            value={metrics.actualCost}
            max={Math.max(metrics.estimatedCost, metrics.committedCost, metrics.actualCost, 1)}
          />

          <div className="mt-4 grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">PO committed cost</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.poCommittedCost)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Subcontract committed cost</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.subcontractCommittedCost)}</span>
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-neutral-200 pt-2">
              <span className="text-neutral-600">Supplier bill actual cost (subtotal)</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.supplierBillActualCost)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Cost overrun indicator</span>
              <span className="font-semibold tabular-nums">
                {metrics.actualCost > metrics.estimatedCost + 0.01 ? (
                  <span className="text-red-700">{formatCurrency(metrics.actualCost - metrics.estimatedCost)}</span>
                ) : metrics.committedCost > metrics.estimatedCost + 0.01 ? (
                  <span className="text-amber-800">{formatCurrency(metrics.committedCost - metrics.estimatedCost)}</span>
                ) : (
                  <span className="text-neutral-700">-</span>
                )}
              </span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Revenue Control" subtitle="Quotation/contract values vs invoicing and collections.">
          <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Quotation value (subtotal)</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.quotationSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Quotation value (total)</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.quotationTotalAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Contract value (signed)</span>
              <span className="font-semibold text-neutral-950 tabular-nums">
                {metrics.contractTotalAmount > 0 ? formatCurrency(metrics.contractTotalAmount) : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-neutral-200 pt-2">
              <span className="text-neutral-600">Invoiced (net)</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.invoicedRevenueNet)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Collected</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.collectedRevenue)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Outstanding</span>
              <span className="font-semibold text-neutral-950 tabular-nums">{formatCurrency(metrics.outstandingReceivables)}</span>
            </div>
            <div className="flex items-center justify-between gap-6">
              <span className="text-neutral-600">Overdue</span>
              <span className="font-semibold tabular-nums text-red-700">{formatCurrency(metrics.overdueInvoiceOutstanding)}</span>
            </div>
          </div>

          <div className="mt-4">
            <BarRow
              label="Invoiced"
              value={metrics.invoicedRevenueNet}
              max={Math.max(metrics.quotedRevenueNet + metrics.approvedVariationRevenue, metrics.invoicedRevenueNet, metrics.collectedRevenue, 1)}
            />
            <div className="mt-3">
              <BarRow
                label="Collected"
                value={metrics.collectedRevenue}
                max={Math.max(metrics.quotedRevenueNet + metrics.approvedVariationRevenue, metrics.invoicedRevenueNet, metrics.collectedRevenue, 1)}
              />
            </div>
          </div>
        </ChartCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-950">Margin Leakage</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Automated checks for cost overruns, drift vs quotation baseline, and control breaches.
          </p>

          {metrics.leakageSignals.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-600">No leakage signals detected.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {metrics.leakageSignals.map((s, idx) => (
                <div key={idx} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={s.severity} />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          {s.type.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-neutral-800">{s.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {metrics.billsExceedingPo.length > 0 ? (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Supplier Bills Exceed PO (Subtotal)
              </p>
              <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">PO No</th>
                      <th className="px-4 py-3 text-right font-semibold">PO</th>
                      <th className="px-4 py-3 text-right font-semibold">Bills</th>
                      <th className="px-4 py-3 text-right font-semibold">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.billsExceedingPo.slice(0, 6).map((row) => (
                      <tr key={row.purchaseOrderId} className="border-t border-neutral-200">
                        <td className="px-4 py-3 font-medium text-neutral-900">{row.poNumber}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(row.poSubtotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(row.billedSubtotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(row.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-neutral-950">P&amp;L Alerts</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Active and resolved alerts with audit trail.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-600">
                Active: <span className="font-semibold text-neutral-950">{alerts.length}</span>
              </span>
              <span className="text-sm text-neutral-600">
                Resolved: <span className="font-semibold text-neutral-950">{resolvedAlerts.length}</span>
              </span>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Active</p>
            {alerts.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">No active alerts.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {alerts.slice(0, 8).map((a) => (
                  <div key={a.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={a.severity} />
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                            {a.type.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-800">{a.message}</p>
                        <p className="mt-1 text-xs text-neutral-500">{a.createdAt.toISOString().slice(0, 10)}</p>
                      </div>
                      <form action={resolvePnLAlertAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="alertId" value={a.id} />
                        <button className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100">
                          Resolve
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-neutral-200 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Resolved</p>
            {resolvedAlerts.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-600">No resolved alerts yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {resolvedAlerts.slice(0, 6).map((a) => (
                  <div key={a.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={a.severity} />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          {a.type.replaceAll("_", " ")}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">
                        Resolved {a.resolvedAt ? a.resolvedAt.toISOString().slice(0, 10) : "-"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-800">{a.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {metrics.claimsExceedingSubcontract.length > 0 ? (
            <div className="mt-6 border-t border-neutral-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Claims Exposure Exceeds Subcontract
              </p>
              <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Subcontract</th>
                      <th className="px-4 py-3 text-right font-semibold">SC</th>
                      <th className="px-4 py-3 text-right font-semibold">Claimed</th>
                      <th className="px-4 py-3 text-right font-semibold">Certified</th>
                      <th className="px-4 py-3 text-right font-semibold">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.claimsExceedingSubcontract.slice(0, 6).map((row) => (
                      <tr key={row.subcontractId} className="border-t border-neutral-200">
                        <td className="px-4 py-3 font-medium text-neutral-900">{row.title}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(row.subcontractSubtotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(row.claimedAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-900">{formatCurrency(row.certifiedAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-neutral-950">{formatCurrency(row.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Variation Orders</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Draft and approval workflow for VO that impacts revenue and margin.
        </p>

        <form action={createVariationOrder} className="mt-5 grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="projectId" value={projectId} />
          <input
            name="title"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-3"
            placeholder="VO title"
          />
          <input
            name="subtotal"
            type="number"
            min={0}
            step="0.01"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Revenue (excl GST)"
          />
          <input
            name="costSubtotal"
            type="number"
            min={0}
            step="0.01"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Est cost"
          />
          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Create VO
          </button>
          <textarea
            name="description"
            rows={2}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-6"
            placeholder="Description (optional)"
          />
        </form>

        {vos.length === 0 ? (
          <p className="mt-5 text-sm text-neutral-600">No VOs yet.</p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Ref</th>
                  <th className="px-4 py-3 text-left font-semibold">Title</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Revenue</th>
                  <th className="px-4 py-3 text-left font-semibold">Cost</th>
                  <th className="px-4 py-3 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {vos.map((vo) => (
                  <tr key={vo.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {vo.referenceNumber}
                    </td>
                    <td className="px-4 py-3 text-neutral-900">{vo.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{vo.status}</td>
                    <td className="px-4 py-3 text-neutral-900">
                      {formatCurrency(Number(vo.subtotal))}
                    </td>
                    <td className="px-4 py-3 text-neutral-900">
                      {formatCurrency(Number(vo.costSubtotal))}
                    </td>
                    <td className="px-4 py-3">
                      {vo.status !== "APPROVED" && vo.status !== "INVOICED" ? (
                        <form action={approveVariationOrder}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="variationOrderId" value={vo.id} />
                          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                            Approve
                          </button>
                        </form>
                      ) : (
                        <span className="text-sm text-neutral-500">Approved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Actual Costs</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Record actual costs (materials, labor, subcontract) for variance tracking.
        </p>

        <form action={createActualCost} className="mt-5 grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="projectId" value={projectId} />
          <input
            name="occurredAt"
            type="date"
            defaultValue={todayIsoDate()}
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
          />
          <select
            name="category"
            defaultValue="OTHER"
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
          >
            <option value="MATERIAL">Material</option>
            <option value="LABOR">Labor</option>
            <option value="SUBCONTRACT">Subcontract</option>
            <option value="PERMIT">Permit</option>
            <option value="LOGISTICS">Logistics</option>
            <option value="OTHER">Other</option>
          </select>
          <select
            name="vendorId"
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
            defaultValue=""
          >
            <option value="">(No vendor)</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
          <input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Amount"
          />
          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Add Cost
          </button>
          <input
            name="description"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-6"
            placeholder="Description"
          />
        </form>

        {actualCosts.length === 0 ? (
          <p className="mt-5 text-sm text-neutral-600">No actual costs yet.</p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Category</th>
                  <th className="px-4 py-3 text-left font-semibold">Vendor</th>
                  <th className="px-4 py-3 text-left font-semibold">Description</th>
                  <th className="px-4 py-3 text-left font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {actualCosts.map((entry) => (
                  <tr key={entry.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-700">
                      {entry.occurredAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{entry.category}</td>
                    <td className="px-4 py-3 text-neutral-900">{entry.vendor?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-900">{entry.description}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-950">
                      {formatCurrency(Number(entry.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-2 text-xl font-semibold text-neutral-950 tabular-nums">{props.value}</p>
    </div>
  );
}

function ChartCard(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-neutral-950">{props.title}</h3>
      {props.subtitle ? <p className="mt-1 text-sm text-neutral-600">{props.subtitle}</p> : null}
      <div className="mt-4 space-y-3">{props.children}</div>
    </section>
  );
}

function BarRow(props: { label: string; value: number; max: number }) {
  const pct = props.max > 0 ? Math.min((props.value / props.max) * 100, 100) : 0;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-neutral-800">{props.label}</span>
        <span className="font-semibold text-neutral-950">{formatCurrency(props.value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-neutral-800" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SeverityBadge(props: { severity: string }) {
  const tone =
    props.severity === "CRITICAL"
      ? "bg-red-50 text-red-700 border-red-200"
      : props.severity === "HIGH"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : props.severity === "MEDIUM"
          ? "bg-yellow-50 text-yellow-800 border-yellow-200"
          : "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone}`}>
      {props.severity}
    </span>
  );
}

function SeverityPill(props: { label: string; value: string; severity: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2">
      <SeverityBadge severity={props.severity} />
      <div className="text-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {props.label}
        </p>
        <p className="font-semibold text-neutral-950 tabular-nums">{props.value}</p>
      </div>
    </div>
  );
}
