import Link from "next/link";
import { AiActionRequestStatus, type AiTool } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { approveAiActionRequestAction, rejectAiActionRequestAction } from "@/app/(platform)/ai-access/actions";
import { safeQuery } from "@/lib/server/safe-query";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstString(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

type Notice = {
  title: string;
  message: string;
};

type ActionRow = {
  id: string;
  tool: AiTool;
  actionType: string;
  status: AiActionRequestStatus;
  riskLevel: string | null;
  createdAt: Date;
  expiresAt: Date | null;
};

const TAB_STATUSES: Array<AiActionRequestStatus> = [
  AiActionRequestStatus.PENDING,
  AiActionRequestStatus.APPROVED,
  AiActionRequestStatus.EXECUTED,
  AiActionRequestStatus.REJECTED,
  AiActionRequestStatus.FAILED,
];

function statusLabelClass(status: AiActionRequestStatus): string {
  if (status === AiActionRequestStatus.EXECUTED) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === AiActionRequestStatus.REJECTED) return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === AiActionRequestStatus.FAILED) return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === AiActionRequestStatus.PENDING) return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-white text-slate-700";
}

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

export default async function AIAccessActionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireExecutive();
  const params = await searchParams;

  const statusParam = firstString(params.status);
  const activeStatus = statusParam
    ? (Object.values(AiActionRequestStatus) as string[]).includes(statusParam)
      ? (statusParam as AiActionRequestStatus)
      : AiActionRequestStatus.PENDING
    : AiActionRequestStatus.PENDING;

  const noticeParam = firstString(params.notice);
  const message = firstString(params.message);

  const actions = await safeQuery(
    async () =>
      prisma.aiActionRequest.findMany({
        where: { userId: user.id, status: activeStatus },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          tool: true,
          actionType: true,
          status: true,
          riskLevel: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          conversationId: true,
        },
      }),
    [] as ActionRow[],
  );

  const totals = await safeQuery(async () => {
    const rows = await prisma.aiActionRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { userId: user.id },
    });
    return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Record<string, number>;
  }, {} as Record<string, number>);

  const notice: Notice | null = noticeParam
    ? {
        title: noticeParam === "action_executed" ? "Action executed" : "Action update",
        message: message || "Action request has been updated.",
      }
    : null;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="AI Access"
        title="Action Queue"
        subtitle="Review pending requests and execute approved items from channel chat flows."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/ai-access">
              <ActionButton variant="secondary" size="sm">
                Back to Overview
              </ActionButton>
            </Link>
            <Link href="/ai-access/permissions">
              <ActionButton variant="secondary" size="sm">
                Permissions
              </ActionButton>
            </Link>
          </div>
        }
      />

      {notice ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
          <p className="text-sm font-semibold">{notice.title}</p>
          <p className="mt-1 text-sm">{notice.message}</p>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-2">
        {TAB_STATUSES.map((status) => {
          const active = status === activeStatus;
          const count = totals[status] ?? 0;
          return (
            <Link
              key={status}
              href={`/ai-access/actions?status=${status}`}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
                active ? "border-neutral-900 bg-neutral-900 text-white" : "border-slate-300 bg-white text-neutral-900"
              }`}
            >
              <span>{status.toLowerCase().replaceAll("_", " ")}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </section>

      <SectionCard
        title={`AI action requests · ${activeStatus}`}
        description="Each row opens to review request payload, audit context, and execution path."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-600">
                <th className="pb-2 font-semibold">Created</th>
                <th className="pb-2 font-semibold">Tool</th>
                <th className="pb-2 font-semibold">Action</th>
                <th className="pb-2 font-semibold">Risk</th>
                <th className="pb-2 font-semibold">Expires</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    No records for this status.
                  </td>
                </tr>
              ) : (
                actions.map((action) => (
                  <tr key={action.id} className="border-t border-slate-200">
                    <td className="py-3 text-neutral-700">{formatDateTime(action.createdAt)}</td>
                    <td className="py-3 font-semibold text-neutral-950">{action.tool}</td>
                    <td className="py-3">
                      <Link
                        href={`/ai-access/actions/${action.id}`}
                        className="underline underline-offset-2 hover:text-neutral-600"
                      >
                        {action.actionType}
                      </Link>
                    </td>
                    <td className="py-3 text-neutral-700">{action.riskLevel || "UNKNOWN"}</td>
                    <td className="py-3 text-neutral-700">
                      {action.expiresAt ? formatDateTime(action.expiresAt) : "—"}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusLabelClass(action.status)}`}>
                        {action.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                    {action.status === AiActionRequestStatus.PENDING ? (
                      <>
                        <form action={approveAiActionRequestAction}>
                          <input type="hidden" name="id" value={action.id} />
                          <ActionButton type="submit" size="sm">
                            Approve
                          </ActionButton>
                        </form>
                        <form action={rejectAiActionRequestAction}>
                          <input type="hidden" name="id" value={action.id} />
                          <ActionButton type="submit" variant="danger" size="sm">
                            Reject
                          </ActionButton>
                        </form>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-500">No action</span>
                    )}
                    <Link
                      href={`/ai-access/actions/${action.id}`}
                      className="inline-flex h-9 items-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800"
                    >
                      Open
                    </Link>
                  </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </main>
  );
}
