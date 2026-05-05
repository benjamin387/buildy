import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission, ProgressClaimMethod } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { SectionCard } from "@/app/components/ui/section-card";
import { PageHeader } from "@/app/components/ui/page-header";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";
import { ActionButton } from "@/app/components/ui/action-button";
import { safeQuery } from "@/lib/server/safe-query";
import { listProgressClaims } from "@/lib/claims/service";
import { createProgressClaimAction } from "@/app/(platform)/projects/[projectId]/claims/actions";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function toneForStatus(status: string) {
  if (status === "APPROVED" || status === "PAID") return "success" as const;
  if (status === "REJECTED" || status === "CANCELLED") return "danger" as const;
  if (status === "INVOICED") return "neutral" as const;
  if (status === "CERTIFIED" || status === "SUBMITTED") return "warning" as const;
  return "neutral" as const;
}

export default async function ProjectClaimsIndexPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await safeQuery(
    () => prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, projectCode: true } }),
    null,
  );
  if (!project) notFound();

  const [claims, contract, budget] = await Promise.all([
    safeQuery(() => listProgressClaims(projectId), [] as any[]),
    safeQuery(
      () =>
        prisma.contract.findFirst({
          where: { projectId, status: { in: ["SIGNED", "FINAL"] } },
          orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
          select: { id: true, contractNumber: true, contractValue: true, retentionAmount: true, retentionPercent: true, defectsLiabilityDays: true },
        }),
      null as any,
    ),
    safeQuery(
      () =>
        prisma.projectBudget.findFirst({
          where: { projectId, status: "LOCKED", isActive: true },
          orderBy: [{ lockedAt: "desc" }, { versionNo: "desc" }],
          select: { id: true, versionNo: true, lockedAt: true, totalRevenue: true, totalCost: true },
        }),
      null as any,
    ),
  ]);

  const claimedToDate = claims.reduce((sum, c) => sum + Number(c.claimedAmount ?? 0), 0);
  const certifiedToDate = claims.reduce((sum, c) => sum + Number(c.certifiedAmount ?? 0), 0);
  const invoicedToDate = claims.reduce(
    (sum, c) => sum + (Array.isArray(c.invoices) ? c.invoices.reduce((s: number, i: any) => s + Number(i.totalAmount ?? 0), 0) : 0),
    0,
  );
  const outstandingInvoices = claims.reduce(
    (sum, c) => sum + (Array.isArray(c.invoices) ? c.invoices.reduce((s: number, i: any) => s + Number(i.outstandingAmount ?? 0), 0) : 0),
    0,
  );

  return (
    <main className="space-y-6">
      <PageHeader
        title="Progress Claims"
        subtitle="Prepare and certify progress claims with retention controls. Claims require an active locked budget baseline."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}`}>
              <ActionButton variant="secondary">Back</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric title="Contract Sum" value={formatCurrency(Number(contract?.contractValue ?? 0))} />
        <Metric title="Claimed To Date" value={formatCurrency(claimedToDate)} />
        <Metric title="Certified To Date" value={formatCurrency(certifiedToDate)} />
        <Metric title="Outstanding Receivable" value={formatCurrency(outstandingInvoices)} />
      </section>

      <SectionCard
        title="New Progress Claim"
        description={budget ? `Budget baseline v${budget.versionNo} locked on ${formatDate(budget.lockedAt)}.` : "No active locked budget found. Lock a budget in Execution before claims can be created."}
      >
        <form action={createProgressClaimAction} className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="block">
            <div className="text-sm font-semibold text-neutral-900">Claim Date</div>
            <input
              name="claimDate"
              type="date"
              required
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-neutral-900">Method</div>
            <select
              name="claimMethod"
              defaultValue={ProgressClaimMethod.MANUAL}
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            >
              <option value={ProgressClaimMethod.MANUAL}>Manual</option>
              <option value={ProgressClaimMethod.MILESTONE}>Milestone</option>
              <option value={ProgressClaimMethod.BUDGET_LINE}>Budget Line</option>
              <option value={ProgressClaimMethod.PERCENTAGE}>% Completion</option>
            </select>
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-neutral-900">% Completion (0-1)</div>
            <input
              name="percentComplete"
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="0.25"
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            />
          </label>
          <div className="flex items-end">
            <ActionButton type="submit" className="w-full md:w-auto">
              Create Claim
            </ActionButton>
          </div>
          <label className="block md:col-span-4">
            <div className="text-sm font-semibold text-neutral-900">Remarks</div>
            <textarea
              name="remarks"
              rows={3}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              placeholder="Optional notes for this claim."
            />
          </label>
        </form>
      </SectionCard>

      <SectionCard title="Claims Register" description="Submitted, certified, approved and invoiced claims for this project.">
        {claims.length === 0 ? (
          <EmptyState
            title="No progress claims yet"
            description="Create your first progress claim to start tracking certified amounts, retention, and invoicing."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Claim</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Claimed</th>
                  <th className="px-4 py-3 text-right font-semibold">Certified</th>
                  <th className="px-4 py-3 text-right font-semibold">Retention</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {claims.map((c: any) => {
                  const invoices = Array.isArray(c.invoices) ? c.invoices : [];
                  const latest = invoices[0] ?? null;
                  const outstanding = invoices.reduce((s: number, i: any) => s + Number(i.outstandingAmount ?? 0), 0);

                  return (
                    <tr key={c.id} className="bg-white">
                      <td className="px-4 py-3 font-semibold text-neutral-900">{c.claimNumber}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatDate(c.claimDate)}</td>
                      <td className="px-4 py-3">
                        <StatusPill tone={toneForStatus(c.status)}>{String(c.status).replaceAll("_", " ")}</StatusPill>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(Number(c.claimedAmount ?? 0))}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(Number(c.certifiedAmount ?? 0))}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCurrency(Number(c.retentionDeductedAmount ?? 0))}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(Number(c.netCertifiedAmount ?? 0))}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        {latest ? (
                          <div className="flex flex-col gap-1">
                            <Link className="font-semibold text-neutral-900 underline decoration-slate-300 underline-offset-2 hover:decoration-neutral-900" href={`/projects/${projectId}/invoices/${latest.id}`}>
                              {latest.invoiceNumber}
                            </Link>
                            {invoices.length > 1 ? <span className="text-xs text-neutral-500">{invoices.length} invoices</span> : null}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCurrency(outstanding)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/projects/${projectId}/claims/${c.id}`}>
                          <ActionButton size="sm" variant="secondary">
                            Open
                          </ActionButton>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function Metric(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{props.value}</p>
      {props.hint ? <p className="mt-2 text-sm text-neutral-600">{props.hint}</p> : null}
    </div>
  );
}
