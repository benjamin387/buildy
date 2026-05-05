import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/server/safe-query";
import { getRetentionSummary } from "@/lib/claims/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { createRetentionReleaseAction } from "@/app/(platform)/projects/[projectId]/retention/actions";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function toneForEntry(type: string) {
  if (type === "DEDUCTION") return "warning" as const;
  if (type.startsWith("RELEASE")) return "success" as const;
  return "neutral" as const;
}

export default async function ProjectRetentionPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await safeQuery(
    () => prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, projectCode: true } }),
    null,
  );
  if (!project) notFound();

  const [summary, contract, dlp] = await Promise.all([
    safeQuery(() => getRetentionSummary(projectId), { held: 0, deducted: 0, released: 0, entries: [] as any[] }),
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
        prisma.defectLiabilityPeriod.findUnique({
          where: { projectId },
          include: { defects: { select: { id: true, status: true } } },
        }),
      null as any,
    ),
  ]);

  const openDefects = dlp?.defects?.filter((d: any) => d.status !== "CLOSED")?.length ?? 0;
  const dlpActive = dlp ? new Date() < dlp.endDate : false;

  return (
    <main className="space-y-6">
      <PageHeader
        title="Retention"
        subtitle="Retention held and release controls linked to certified claims and the defect liability period."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}`}>
              <ActionButton variant="secondary">Back</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric title="Retention Held" value={formatCurrency(summary.held)} />
        <Metric title="Total Deducted" value={formatCurrency(summary.deducted)} />
        <Metric title="Total Released" value={formatCurrency(summary.released)} />
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">DLP Control</p>
          <p className="mt-2 text-lg font-semibold text-neutral-950">
            {dlp ? (dlpActive ? "Active" : "Ended") : "Not Set"}
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            {dlp ? `${openDefects} open defects · Ends ${formatDate(dlp.endDate)}` : "Set DLP before final retention release."}
          </p>
        </div>
      </section>

      <SectionCard
        title="Release Retention"
        description="Final release is blocked until DLP is completed (ended and no open defects)."
      >
        <form action={createRetentionReleaseAction} className="grid gap-4 md:grid-cols-5">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="contractId" value={contract?.id ?? ""} />
          <label className="block md:col-span-2">
            <div className="text-sm font-semibold text-neutral-900">Entry Type</div>
            <select
              name="entryType"
              defaultValue="RELEASE_PRACTICAL_COMPLETION"
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            >
              <option value="RELEASE_PRACTICAL_COMPLETION">Release (Practical Completion)</option>
              <option value="RELEASE_FINAL">Release (Final, post-DLP)</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-neutral-900">Amount</div>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            />
          </label>
          <label className="block md:col-span-2">
            <div className="text-sm font-semibold text-neutral-900">Description</div>
            <input
              name="description"
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              placeholder="Optional"
            />
          </label>
          <div className="flex items-end">
            <ActionButton type="submit" className="w-full md:w-auto">
              Create Entry
            </ActionButton>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Retention Ledger" description="Immutable ledger of deductions and releases.">
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Description</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {summary.entries.map((e: any) => (
                <tr key={e.id} className="bg-white">
                  <td className="px-4 py-3 text-neutral-700">{formatDate(e.entryDate)}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={toneForEntry(e.entryType)}>{String(e.entryType).replaceAll("_", " ")}</StatusPill>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{e.description || "-"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">{formatCurrency(Number(e.amount ?? 0))}</td>
                </tr>
              ))}
              {summary.entries.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-600">
                    No retention ledger entries yet.
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
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{props.value}</p>
    </div>
  );
}

