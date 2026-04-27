import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { requestBidApprovalAction, decideBidApprovalAction } from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidApprovalPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id },
        include: { approvals: { orderBy: [{ createdAt: "desc" }] } },
      }),
    null as any,
  );
  if (!opp) notFound();

  const pending = (opp.approvals ?? []).filter((a: any) => a.status === "PENDING").length;
  const approved = (opp.approvals ?? []).filter((a: any) => a.status === "APPROVED").length;
  const rejected = (opp.approvals ?? []).filter((a: any) => a.status === "REJECTED").length;

  return (
    <main className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Kpi title="Pending" value={String(pending)} tone={pending > 0 ? "warning" : "neutral"} />
        <Kpi title="Approved" value={String(approved)} tone={approved > 0 ? "success" : "neutral"} />
        <Kpi title="Rejected" value={String(rejected)} tone={rejected > 0 ? "danger" : "neutral"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Request Approval" description="Add internal approvers for tender/quotation submission.">
          <form action={requestBidApprovalAction} className="grid gap-3">
            <input type="hidden" name="opportunityId" value={opp.id} />
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Approver Name</label>
              <input name="approverName" required className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="e.g. Director" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Approver Email (optional)</label>
              <input name="approverEmail" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="director@company.sg" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Role / Purpose</label>
              <input name="role" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="Budget / Risk / Compliance" />
            </div>
            <div className="flex justify-end">
              <ActionButton type="submit">Request Approval</ActionButton>
            </div>
          </form>
          <p className="mt-3 text-xs text-neutral-600">
            Approval decisions are executive actions. If you don’t see approve/reject controls, your role may be view-only.
          </p>
        </SectionCard>

        <SectionCard title="Approval Queue" description="All approvals logged for this opportunity.">
          {(opp.approvals ?? []).length === 0 ? (
            <EmptyState title="No approvals requested" description="Add an approver to begin internal sign-off." />
          ) : (
            <div className="space-y-3">
              {(opp.approvals ?? []).map((a: any) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">
                        {a.approverName}
                        {a.role ? <span className="ml-2 text-xs font-semibold text-neutral-500">({a.role})</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-neutral-600">
                        Requested {formatDateTime(a.createdAt)} · Decision {a.decidedAt ? formatDateTime(a.decidedAt) : "-"}
                      </p>
                      {a.remarks ? <p className="mt-2 text-xs text-neutral-700">{a.remarks}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "warning"}>
                        {String(a.status).replaceAll("_", " ")}
                      </StatusPill>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={decideBidApprovalAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="opportunityId" value={opp.id} />
                      <input type="hidden" name="approvalId" value={a.id} />
                      <input name="remarks" placeholder="Remarks (optional)" className="h-10 w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" />
                      <ActionButton type="submit" name="decision" value="APPROVED" size="sm" variant="secondary">
                        Approve
                      </ActionButton>
                      <ActionButton type="submit" name="decision" value="REJECTED" size="sm" variant="danger">
                        Reject
                      </ActionButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </main>
  );
}

function Kpi(props: { title: string; value: string; tone: "neutral" | "warning" | "success" | "danger" }) {
  const badge =
    props.tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : props.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : props.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-neutral-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>Live</span>
      </div>
    </div>
  );
}

