import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { safeQuery } from "@/lib/server/safe-query";
import { getProgressClaim } from "@/lib/claims/service";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "long", day: "2-digit" }).format(value);
}

export default async function ProgressClaimPrintPage(props: {
  params: Promise<{ projectId: string; claimId: string }>;
}) {
  const { projectId, claimId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const claim = await safeQuery(() => getProgressClaim({ projectId, claimId }), null as any);
  if (!claim) notFound();

  return (
    <main className="mx-auto max-w-4xl bg-white px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Progress Claim</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{claim.claimNumber}</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Project: <span className="font-semibold text-neutral-900">{claim.project?.name ?? "-"}</span>
          </p>
          <p className="mt-1 text-sm text-neutral-600">Claim date: {formatDate(claim.claimDate)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-neutral-900">{String(claim.status).replaceAll("_", " ")}</p>
          <p className="mt-1 text-xs text-neutral-500">Generated {formatDate(new Date())}</p>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 print:rounded-none print:border-slate-300">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-neutral-600 print:bg-white">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Item</th>
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
                  {l.description ? <div className="mt-1 text-xs text-neutral-500">{l.description}</div> : null}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {l.contractMilestone ? `Milestone: ${l.contractMilestone.title}` : l.budgetLine ? `Budget: ${String(l.budgetLine.tradeKey).replaceAll("_", " ")} · ${String(l.budgetLine.description).slice(0, 60)}` : "-"}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(Number(l.claimedAmount ?? 0))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCurrency(Number(l.certifiedAmount ?? 0))}</td>
              </tr>
            ))}
            {claim.lines.length === 0 ? (
              <tr className="bg-white">
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-600">
                  No claim lines.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 print:rounded-none print:border-slate-300">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Summary</p>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Claimed amount" value={formatCurrency(Number(claim.claimedAmount ?? 0))} />
            <Row label="Certified amount" value={formatCurrency(Number(claim.certifiedAmount ?? 0))} />
            <Row label="Retention deducted" value={formatCurrency(Number(claim.retentionDeductedAmount ?? 0))} />
            <Row label="Net certified" value={formatCurrency(Number(claim.netCertifiedAmount ?? 0))} />
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 print:rounded-none print:border-slate-300">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</p>
          <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{claim.remarks || "-"}</p>
        </div>
      </div>

      <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-neutral-500 print:border-slate-300">
        <p>Buildy · Progress Claim document</p>
      </div>
    </main>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-600">{props.label}</dt>
      <dd className="font-semibold tabular-nums text-neutral-900">{props.value}</dd>
    </div>
  );
}

