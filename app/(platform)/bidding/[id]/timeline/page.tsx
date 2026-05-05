import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { upsertBidTimelineMilestoneAction } from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidTimelinePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id },
        include: {
          timelineMilestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }] },
        },
      }),
    null as any,
  );
  if (!opp) notFound();

  const milestones = opp.timelineMilestones ?? [];
  const now = new Date();

  return (
    <main className="space-y-6">
      <SectionCard
        title="Tender Timeline Engine"
        description="Internal timeline milestones to de-risk submission. Use this as a control layer (no GeBIZ submission is performed)."
      >
        {milestones.length === 0 ? (
          <EmptyState title="No timeline milestones" description="Milestones are generated when the opportunity is created. You can add custom milestones below." />
        ) : (
          <div className="space-y-3">
            {milestones.map((m: any) => {
              const due = m.dueDate ? new Date(m.dueDate) : null;
              const isOverdue = due ? due.getTime() < now.getTime() && m.status !== "COMPLETED" : false;
              const tone =
                m.status === "COMPLETED"
                  ? "success"
                  : isOverdue || m.status === "MISSED"
                    ? "danger"
                    : m.status === "PENDING"
                      ? "warning"
                      : "neutral";

              return (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-950">{m.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Key: {m.milestoneKey} · Due {formatDate(m.dueDate)}
                      </p>
                      {m.notes ? <p className="mt-2 text-xs text-neutral-600 whitespace-pre-wrap">{m.notes}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={tone}>{String(m.status).replaceAll("_", " ")}</StatusPill>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <form action={upsertBidTimelineMilestoneAction} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                      <input type="hidden" name="opportunityId" value={opp.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="milestoneKey" value={m.milestoneKey} />
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-neutral-900">Title</label>
                        <input
                          name="title"
                          defaultValue={m.title}
                          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-neutral-900">Due Date</label>
                        <input
                          name="dueDate"
                          defaultValue={m.dueDate ? String(m.dueDate).slice(0, 10) : ""}
                          placeholder="YYYY-MM-DD"
                          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-neutral-900">Status</label>
                        <select
                          name="status"
                          defaultValue={m.status}
                          className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        >
                          <option value="PENDING">Pending</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="MISSED">Missed</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-neutral-900">Notes</label>
                        <textarea
                          name="notes"
                          defaultValue={m.notes ?? ""}
                          className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <ActionButton size="sm" type="submit">
                          Save
                        </ActionButton>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Add Custom Milestone" description="Add an extra control point for internal coordination.">
        <form action={upsertBidTimelineMilestoneAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="opportunityId" value={opp.id} />
          <input type="hidden" name="id" value="" />
          <input type="hidden" name="milestoneKey" value="" />
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Title</label>
            <input
              name="title"
              required
              placeholder="e.g. Site walk-through / Internal pricing review"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-neutral-900">Due Date</label>
            <input
              name="dueDate"
              placeholder="YYYY-MM-DD"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-neutral-900">Status</label>
            <select
              name="status"
              defaultValue="PENDING"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            >
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="MISSED">Missed</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-neutral-900">Notes</label>
            <textarea
              name="notes"
              className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <ActionButton type="submit">Add Milestone</ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

