import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/server/safe-query";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { createDefectReportAction, updateDefectStatusAction, upsertDlpAction } from "@/app/(platform)/projects/[projectId]/dlp/actions";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function toneForDefect(status: string) {
  if (status === "CLOSED") return "success" as const;
  if (status === "RECTIFIED") return "warning" as const;
  if (status === "IN_PROGRESS") return "warning" as const;
  return "neutral" as const;
}

export default async function ProjectDlpPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await safeQuery(
    () => prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    null,
  );
  if (!project) notFound();

  const [contract, dlp] = await Promise.all([
    safeQuery(
      () =>
        prisma.contract.findFirst({
          where: { projectId, status: { in: ["SIGNED", "FINAL"] } },
          orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
          select: { id: true, contractNumber: true, defectsLiabilityDays: true, signedAt: true, completionDate: true },
        }),
      null as any,
    ),
    safeQuery(
      () =>
        prisma.defectLiabilityPeriod.findUnique({
          where: { projectId },
          include: { defects: { orderBy: [{ reportedAt: "desc" }] } },
        }),
      null as any,
    ),
  ]);

  const now = new Date();
  const dlpDaysLeft = dlp ? daysBetween(now, dlp.endDate) : null;
  const openDefects = dlp?.defects?.filter((d: any) => d.status !== "CLOSED") ?? [];
  const nearingExpiry = dlpDaysLeft != null && dlpDaysLeft <= 14;

  const defaultStart = dlp?.startDate ?? contract?.completionDate ?? new Date();
  const defaultEnd =
    dlp?.endDate ??
    new Date(defaultStart.getTime() + (Number(contract?.defectsLiabilityDays ?? 90) || 90) * 24 * 60 * 60 * 1000);

  return (
    <main className="space-y-6">
      <PageHeader
        title="Defect Liability Period (DLP)"
        subtitle="Track DLP dates, defects, and controls for final retention release."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}`}>
              <ActionButton variant="secondary">Back</ActionButton>
            </Link>
            <Link href={`/projects/${projectId}/retention`}>
              <ActionButton variant="secondary">Open Retention</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric title="DLP Start" value={dlp ? formatDate(dlp.startDate) : "-"} />
        <Metric title="DLP End" value={dlp ? formatDate(dlp.endDate) : "-"} />
        <Metric title="Days Left" value={dlpDaysLeft == null ? "-" : String(dlpDaysLeft)} />
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Risk</p>
          <p className="mt-2 text-lg font-semibold text-neutral-950">
            {nearingExpiry ? "Expiry Near" : dlp ? "Normal" : "Not Set"}
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            {dlp ? `${openDefects.length} open defects` : "Set DLP to enable final retention controls."}
          </p>
        </div>
      </section>

      <SectionCard title="DLP Settings" description="Set DLP start/end. Final retention release is blocked until DLP ends and all defects are closed.">
        <form action={upsertDlpAction} className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="contractId" value={contract?.id ?? ""} />
          <label className="block">
            <div className="text-sm font-semibold text-neutral-900">Start Date</div>
            <input
              name="startDate"
              type="date"
              required
              defaultValue={toDateInputValue(defaultStart)}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            />
          </label>
          <label className="block">
            <div className="text-sm font-semibold text-neutral-900">End Date</div>
            <input
              name="endDate"
              type="date"
              required
              defaultValue={toDateInputValue(defaultEnd)}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
            />
          </label>
          <label className="block md:col-span-2">
            <div className="text-sm font-semibold text-neutral-900">Notes</div>
            <input
              name="notes"
              defaultValue={dlp?.notes ?? ""}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              placeholder="Optional"
            />
          </label>
          <div className="flex items-end">
            <ActionButton type="submit" className="w-full md:w-auto">
              Save DLP
            </ActionButton>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Defect Reports" description="Log defects during the DLP and track rectification to close out final account and retention.">
        <form action={createDefectReportAction} className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="dlpId" value={dlp?.id ?? ""} />
          <label className="block md:col-span-2">
            <div className="text-sm font-semibold text-neutral-900">Title</div>
            <input
              name="title"
              required
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              placeholder="e.g. Hairline cracks at living room wall"
            />
          </label>
          <label className="block md:col-span-2">
            <div className="text-sm font-semibold text-neutral-900">Description</div>
            <input
              name="description"
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
              placeholder="Optional details"
            />
          </label>
          <div className="flex items-end">
            <ActionButton type="submit" variant="secondary" className="w-full md:w-auto">
              Add Defect
            </ActionButton>
          </div>
        </form>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Reported</th>
                <th className="px-4 py-3 text-left font-semibold">Defect</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(dlp?.defects ?? []).map((d: any) => (
                <tr key={d.id} className="bg-white">
                  <td className="px-4 py-3 text-neutral-700">{formatDate(d.reportedAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-neutral-900">{d.title}</p>
                    {d.description ? <p className="mt-1 text-xs text-neutral-500">{d.description}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={toneForDefect(d.status)}>{String(d.status).replaceAll("_", " ")}</StatusPill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={updateDefectStatusAction} className="flex items-center justify-end gap-2">
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="defectId" value={d.id} />
                      <select
                        name="status"
                        defaultValue={d.status}
                        className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="RECTIFIED">RECTIFIED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                      <ActionButton size="sm" variant="secondary" type="submit">
                        Update
                      </ActionButton>
                    </form>
                  </td>
                </tr>
              ))}
              {(dlp?.defects ?? []).length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-600">
                    No defect reports yet.
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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{props.value}</p>
    </div>
  );
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

