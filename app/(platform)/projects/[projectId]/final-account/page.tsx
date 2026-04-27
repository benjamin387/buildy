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
import {
  approveFinalAccountAction,
  refreshFinalAccountAction,
  submitFinalAccountForApprovalAction,
} from "@/app/(platform)/projects/[projectId]/final-account/actions";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function toneForStatus(status: string) {
  if (status === "LOCKED" || status === "APPROVED") return "success" as const;
  if (status === "PENDING_APPROVAL") return "warning" as const;
  return "neutral" as const;
}

export default async function ProjectFinalAccountPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const project = await safeQuery(
    () => prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    null,
  );
  if (!project) notFound();

  const [fa, dlp, claimsAgg, invAgg] = await Promise.all([
    safeQuery(() => prisma.finalAccount.findUnique({ where: { projectId }, include: { approvals: true } }), null as any),
    safeQuery(
      () =>
        prisma.defectLiabilityPeriod.findUnique({
          where: { projectId },
          include: { defects: { select: { id: true, status: true } } },
        }),
      null as any,
    ),
    safeQuery(
      () =>
        prisma.progressClaim.aggregate({
          where: { projectId, status: { in: ["SUBMITTED", "CERTIFIED", "APPROVED", "INVOICED", "PAID"] } },
          _sum: { claimedAmount: true, certifiedAmount: true, netCertifiedAmount: true },
        }),
      { _sum: { claimedAmount: 0, certifiedAmount: 0, netCertifiedAmount: 0 } } as any,
    ),
    safeQuery(
      () =>
        prisma.invoice.aggregate({
          where: { projectId, status: { not: "VOID" } },
          _sum: { totalAmount: true, outstandingAmount: true },
        }),
      { _sum: { totalAmount: 0, outstandingAmount: 0 } } as any,
    ),
  ]);

  const openDefects = dlp?.defects?.filter((d: any) => d.status !== "CLOSED")?.length ?? 0;
  const dlpEnded = dlp ? new Date() >= dlp.endDate : false;

  return (
    <main className="space-y-6">
      <PageHeader
        title="Final Account"
        subtitle="Locked final account with strict controls: DLP must be completed before final lock."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}`}>
              <ActionButton variant="secondary">Back</ActionButton>
            </Link>
            <Link href={`/projects/${projectId}/claims`}>
              <ActionButton variant="secondary">Open Claims</ActionButton>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <Metric title="Claimed To Date" value={formatCurrency(Number(claimsAgg._sum.claimedAmount ?? 0))} />
        <Metric title="Certified To Date" value={formatCurrency(Number(claimsAgg._sum.certifiedAmount ?? 0))} />
        <Metric title="Invoiced To Date" value={formatCurrency(Number(invAgg._sum.totalAmount ?? 0))} />
        <Metric title="Outstanding Receivable" value={formatCurrency(Number(invAgg._sum.outstandingAmount ?? 0))} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Final Account Snapshot" description="Refresh to compute the latest totals. Lock requires Director approval.">
          {fa ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={toneForStatus(fa.status)}>{String(fa.status).replaceAll("_", " ")}</StatusPill>
                {fa.lockedAt ? <StatusPill tone="neutral">Locked {formatDate(fa.lockedAt)}</StatusPill> : null}
              </div>
              <dl className="space-y-2 text-sm">
                <Row label="Original contract sum" value={formatCurrency(Number(fa.originalContractSum ?? 0))} />
                <Row label="Approved variations" value={formatCurrency(Number(fa.approvedVariationSum ?? 0))} />
                <Row label="Certified claims" value={formatCurrency(Number(fa.certifiedClaimsSum ?? 0))} />
                <Row label="Retention held" value={formatCurrency(Number(fa.retentionHeldSum ?? 0))} />
                <Row label="Retention released" value={formatCurrency(Number(fa.retentionReleasedSum ?? 0))} />
                <Row label="Outstanding balance" value={formatCurrency(Number(fa.outstandingBalance ?? 0))} />
              </dl>
            </div>
          ) : (
            <p className="text-sm text-neutral-600">No final account snapshot yet. Refresh to create one.</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <form action={refreshFinalAccountAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <ActionButton type="submit" variant="secondary">
                Refresh
              </ActionButton>
            </form>
            {fa && fa.status !== "LOCKED" ? (
              <form action={submitFinalAccountForApprovalAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <ActionButton type="submit">Submit For Approval</ActionButton>
              </form>
            ) : null}
            {fa && fa.status === "PENDING_APPROVAL" ? (
              <form action={approveFinalAccountAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <ActionButton type="submit">Director Lock</ActionButton>
              </form>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="DLP Gate" description="Final lock and final retention release require DLP completion.">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={dlp ? (dlpEnded ? "success" : "warning") : "neutral"}>
                {dlp ? (dlpEnded ? "DLP ENDED" : "DLP ACTIVE") : "DLP NOT SET"}
              </StatusPill>
              <StatusPill tone={openDefects === 0 ? "success" : "warning"}>{openDefects} open defects</StatusPill>
            </div>
            <p className="text-sm text-neutral-600">
              {dlp ? `Ends ${formatDate(dlp.endDate)}.` : "Set DLP dates under the DLP module."}
            </p>
            <Link href={`/projects/${projectId}/dlp`}>
              <ActionButton variant="secondary">Open DLP</ActionButton>
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Approvals" description="Final account approvals and audit trail.">
          {fa?.approvals?.length ? (
            <div className="space-y-3">
              {fa.approvals.map((a: any) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "neutral"}>
                      {String(a.status)}
                    </StatusPill>
                    <StatusPill tone="neutral">{String(a.roleKey).replaceAll("_", " ")}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm text-neutral-900">{a.approverName || a.approverEmail || "—"}</p>
                  {a.actedAt ? <p className="mt-1 text-xs text-neutral-500">{formatDate(a.actedAt)}</p> : null}
                  {a.remarks ? <p className="mt-2 text-sm text-neutral-600">{a.remarks}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">No approval records yet.</p>
          )}
        </SectionCard>
      </section>
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

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-600">{props.label}</dt>
      <dd className="font-semibold tabular-nums text-neutral-900">{props.value}</dd>
    </div>
  );
}

