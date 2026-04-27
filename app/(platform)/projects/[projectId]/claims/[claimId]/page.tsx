import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { safeQuery } from "@/lib/server/safe-query";
import { getProgressClaim } from "@/lib/claims/service";
import { SectionCard } from "@/app/components/ui/section-card";
import { PageHeader } from "@/app/components/ui/page-header";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import {
  addProgressClaimLineAction,
  approveProgressClaimAction,
  certifyProgressClaimAction,
  createInvoiceFromProgressClaimAction,
  recalcProgressClaimTotalsAction,
  rejectProgressClaimAction,
  submitProgressClaimAction,
} from "@/app/(platform)/projects/[projectId]/claims/actions";

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

export default async function ProgressClaimDetailPage(props: {
  params: Promise<{ projectId: string; claimId: string }>;
}) {
  const { projectId, claimId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const claim = await safeQuery(() => getProgressClaim({ projectId, claimId }), null as any);
  if (!claim) notFound();

  const [budgetLines, milestones] = await Promise.all([
    safeQuery(
      () =>
        prisma.projectBudgetLine.findMany({
          where: { budget: { projectId, status: "LOCKED", isActive: true } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, tradeKey: true, description: true, revenueAmount: true },
          take: 200,
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.contractMilestone.findMany({
          where: { contract: { projectId } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, title: true, amount: true, status: true, dueDate: true },
          take: 100,
        }),
      [] as any[],
    ),
  ]);

  const canEdit = claim.status === "DRAFT";
  const canSubmit = claim.status === "DRAFT" && claim.lines.length > 0;
  const canCertify = claim.status === "SUBMITTED" || claim.status === "CERTIFIED";
  const canApprove = claim.status === "CERTIFIED";
  const invoices = Array.isArray((claim as any).invoices) ? (claim as any).invoices : [];
  const canInvoice = ["APPROVED", "INVOICED"].includes(claim.status);
  const latestInvoice = invoices[0] ?? null;

  return (
    <main className="space-y-6">
      <PageHeader
        title={claim.claimNumber}
        subtitle={`Claim date ${formatDate(claim.claimDate)} · Method ${String(claim.claimMethod).replaceAll("_", " ")}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}/claims`}>
              <ActionButton variant="secondary">Back</ActionButton>
            </Link>
            <Link href={`/projects/${projectId}/claims/${claimId}/print`}>
              <ActionButton variant="secondary">Print</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-5">
        <Metric title="Status" value={<StatusPill tone={toneForStatus(claim.status)}>{String(claim.status).replaceAll("_", " ")}</StatusPill>} />
        <Metric title="Claimed" value={formatCurrency(Number(claim.claimedAmount ?? 0))} />
        <Metric title="Certified" value={formatCurrency(Number(claim.certifiedAmount ?? 0))} />
        <Metric title="Retention" value={formatCurrency(Number(claim.retentionDeductedAmount ?? 0))} />
        <Metric title="Net Certified" value={formatCurrency(Number(claim.netCertifiedAmount ?? 0))} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Workflow Actions" description="Submit, certify, approve, and invoice claims under strict controls.">
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <form action={recalcProgressClaimTotalsAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="claimId" value={claimId} />
                <ActionButton type="submit" variant="secondary">
                  Recalculate Totals
                </ActionButton>
              </form>
            ) : null}

            {canSubmit ? (
              <form action={submitProgressClaimAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="claimId" value={claimId} />
                <ActionButton type="submit">Submit Claim</ActionButton>
              </form>
            ) : null}

            {canApprove ? (
              <form action={approveProgressClaimAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="claimId" value={claimId} />
                <ActionButton type="submit">Director Approve</ActionButton>
              </form>
            ) : null}

            {canInvoice ? (
              <form action={createInvoiceFromProgressClaimAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="claimId" value={claimId} />
                <ActionButton type="submit">Create Invoice</ActionButton>
              </form>
            ) : null}

            {latestInvoice ? (
              <Link href={`/projects/${projectId}/invoices/${latestInvoice.id}`}>
                <ActionButton variant="secondary">Open Latest Invoice</ActionButton>
              </Link>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-stone-50 p-4 text-sm text-neutral-700">
            <p className="font-semibold text-neutral-900">Strict Controls</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Claims require an active locked budget baseline (Execution).</li>
              <li>Only approved claims can be invoiced.</li>
              <li>Retention is auto-deducted at certification and tracked in the retention ledger.</li>
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Invoices" description="Invoices generated from this claim. Multiple invoices are supported for partial billing and adjustments.">
          {invoices.length === 0 ? (
            <p className="text-sm text-neutral-600">No invoices created yet.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${projectId}/invoices/${inv.id}`}
                      className="truncate text-sm font-semibold text-neutral-950 underline decoration-slate-300 underline-offset-2 hover:decoration-neutral-900"
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <div className="mt-1 text-xs text-neutral-500">{formatDate(inv.issueDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-500">Outstanding</div>
                    <div className="text-sm font-semibold tabular-nums text-neutral-950">{formatCurrency(Number(inv.outstandingAmount ?? 0))}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Certification" description="Project Manager certifies the amount; retention is auto-calculated.">
          {canCertify ? (
            <form action={certifyProgressClaimAction} className="space-y-4">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="claimId" value={claimId} />
              <label className="block">
                <div className="text-sm font-semibold text-neutral-900">Certified Amount</div>
                <input
                  name="certifiedAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  defaultValue={Number(claim.certifiedAmount ?? 0)}
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
                />
              </label>
              <label className="block">
                <div className="text-sm font-semibold text-neutral-900">Retention % Override (0-1)</div>
                <input
                  name="retentionPercentOverride"
                  type="number"
                  step="0.0001"
                  min="0"
                  max="1"
                  placeholder={claim.contract ? String(Number(claim.contract.retentionPercent ?? 0)) : "0.00"}
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
                />
              </label>
              <ActionButton type="submit" className="w-full">
                Certify Claim
              </ActionButton>
            </form>
          ) : (
            <p className="text-sm text-neutral-600">
              Certification is available when the claim is submitted. Current status:{" "}
              <span className="font-semibold text-neutral-900">{String(claim.status)}</span>
            </p>
          )}
        </SectionCard>

        <SectionCard title="Reject" description="Reject a claim with remarks (creates a revision and audit trail).">
          <form action={rejectProgressClaimAction} className="space-y-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="claimId" value={claimId} />
            <label className="block">
              <div className="text-sm font-semibold text-neutral-900">Remarks</div>
              <textarea
                name="remarks"
                rows={3}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
                placeholder="Reason for rejection / required changes."
              />
            </label>
            <ActionButton type="submit" variant="secondary" className="w-full">
              Reject Claim
            </ActionButton>
          </form>
        </SectionCard>
      </section>

      <SectionCard title="Claim Lines" description="Milestones / budget lines / manual lines for the claim.">
        {canEdit ? (
          <form action={addProgressClaimLineAction} className="grid gap-4 md:grid-cols-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="claimId" value={claimId} />
            <label className="block md:col-span-2">
              <div className="text-sm font-semibold text-neutral-900">Title</div>
              <input
                name="title"
                required
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
                placeholder="e.g. Carpentry progress claim"
              />
            </label>
            <label className="block">
              <div className="text-sm font-semibold text-neutral-900">Claimed Amount</div>
              <input
                name="claimedAmount"
                type="number"
                min="0"
                step="0.01"
                required
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              />
            </label>
            <div className="flex items-end">
              <ActionButton type="submit" className="w-full md:w-auto">
                Add Line
              </ActionButton>
            </div>
            <label className="block md:col-span-2">
              <div className="text-sm font-semibold text-neutral-900">Budget Line (optional)</div>
              <select
                name="budgetLineId"
                defaultValue=""
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              >
                <option value="">—</option>
                {budgetLines.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {String(l.tradeKey).replaceAll("_", " ")} · {String(l.description).slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <div className="text-sm font-semibold text-neutral-900">Contract Milestone (optional)</div>
              <select
                name="contractMilestoneId"
                defaultValue=""
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              >
                <option value="">—</option>
                {milestones.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {String(m.title).slice(0, 70)} · {formatCurrency(Number(m.amount ?? 0))}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-4">
              <div className="text-sm font-semibold text-neutral-900">Description</div>
              <textarea
                name="description"
                rows={2}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
                placeholder="Optional supporting notes for this line."
              />
            </label>
          </form>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Title</th>
                <th className="px-4 py-3 text-left font-semibold">Reference</th>
                <th className="px-4 py-3 text-right font-semibold">Claimed</th>
                <th className="px-4 py-3 text-right font-semibold">Certified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {claim.lines.map((l: any) => (
                <tr key={l.id} className="bg-white">
                  <td className="px-4 py-3 font-semibold text-neutral-900">
                    {l.title}
                    {l.description ? <p className="mt-1 text-xs text-neutral-500">{l.description}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {l.contractMilestone ? (
                      <div>
                        <div className="font-semibold text-neutral-900">Milestone</div>
                        <div className="text-xs text-neutral-500">{l.contractMilestone.title}</div>
                      </div>
                    ) : l.budgetLine ? (
                      <div>
                        <div className="font-semibold text-neutral-900">Budget</div>
                        <div className="text-xs text-neutral-500">
                          {String(l.budgetLine.tradeKey).replaceAll("_", " ")} · {String(l.budgetLine.description).slice(0, 60)}
                        </div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(Number(l.claimedAmount ?? 0))}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCurrency(Number(l.certifiedAmount ?? 0))}</td>
                </tr>
              ))}
              {claim.lines.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-600">
                    No lines yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Approvals" description="QS prepares, PM certifies, Director approves, Finance invoices.">
        <div className="space-y-3">
          {claim.approvals.length === 0 ? (
            <p className="text-sm text-neutral-600">No approval records yet. They will be created when you submit the claim.</p>
          ) : (
            claim.approvals.map((a: any) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "neutral"}>
                      {String(a.status)}
                    </StatusPill>
                    <StatusPill tone="neutral">{String(a.roleKey).replaceAll("_", " ")}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-neutral-900">
                    {a.approverName || a.approverEmail ? `${a.approverName ?? ""}${a.approverName && a.approverEmail ? " · " : ""}${a.approverEmail ?? ""}` : "—"}
                  </p>
                  {a.remarks ? <p className="mt-1 text-sm text-neutral-600">{a.remarks}</p> : null}
                </div>
                <div className="text-sm text-neutral-600">{formatDate(a.actedAt)}</div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </main>
  );
}

function Metric(props: { title: string; value: string | React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{props.value}</div>
    </div>
  );
}
