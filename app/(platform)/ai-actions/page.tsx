import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import type { AIActionStatus } from "@prisma/client";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { approveAIActionAction, cancelAIActionAction, executeAIActionAction } from "@/app/(platform)/ai-actions/actions";
import { safeQuery } from "@/lib/server/safe-query";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

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

function badgeClass(status: string): string {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "APPROVAL_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "APPROVED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "EXECUTING") return "border-neutral-300 bg-neutral-50 text-neutral-700";
  if (status === "CANCELLED") return "border-neutral-300 bg-neutral-50 text-neutral-600";
  return "border-neutral-300 bg-white text-neutral-700";
}

const statuses: Array<{ key: AIActionStatus; label: string }> = [
  { key: "APPROVAL_REQUIRED", label: "Pending Approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "PENDING", label: "Pending" },
  { key: "COMPLETED", label: "Completed" },
  { key: "FAILED", label: "Failed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export default async function AIActionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireExecutive();
  await requirePermission({ moduleKey: "AI_ACTIONS" satisfies PermissionModuleKey, action: "view" });

  const sp = await searchParams;
  const statusParam = typeof sp.status === "string" ? sp.status : "";
  const status = (statuses.find((s) => s.key === statusParam)?.key ?? "APPROVAL_REQUIRED") as AIActionStatus;

  const prismaAny = prisma as unknown as Record<string, any>;
  const delegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog;
  const hasDelegate = Boolean(delegate);

  const { page, pageSize, skip, take } = parsePagination(sp);

  const [rows, counts, total] = await Promise.all([
    safeQuery(async () => {
      if (!hasDelegate) return [];
      return await delegate.findMany({
        where: { status },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      });
    }, [] as any[]),
    safeQuery(async () => {
      if (!hasDelegate) return [];
      return (await delegate.groupBy({
        by: ["status"],
        _count: { _all: true },
      })) as Array<{ status: AIActionStatus; _count: { _all: number } }>;
    }, [] as Array<{ status: AIActionStatus; _count: { _all: number } }>),
    safeQuery(async () => {
      if (!hasDelegate) return 0;
      return (await delegate.count({ where: { status } })) as number;
    }, 0),
  ]);

  const countMap = new Map<AIActionStatus, number>();
  for (const c of counts) countMap.set(c.status, c._count._all);

  const baseParams = new URLSearchParams();
  baseParams.set("status", status);
  const hrefForPage = (n: number) => buildPageHref("/ai-actions", baseParams, n, pageSize);

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Platform / AI Actions
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              AI Action Approval Queue
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Approval-gated action execution. The system can create drafts and internal tasks safely, but never sends legal/financial
              documents automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ai-actions/orchestrator"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Orchestrator
            </Link>
            <Link
              href="/command-center"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Command Center
            </Link>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {statuses.map((s) => {
          const active = s.key === status;
          const c = countMap.get(s.key) ?? 0;
          return (
            <Link
              key={s.key}
              href={`/ai-actions?status=${s.key}`}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
              }`}
            >
              <span>{s.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-700"}`}>
                {c}
              </span>
            </Link>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-100 text-neutral-800">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Created</th>
              <th className="px-4 py-3 text-left font-semibold">Action</th>
              <th className="px-4 py-3 text-left font-semibold">Entity</th>
              <th className="px-4 py-3 text-left font-semibold">Priority</th>
              <th className="px-4 py-3 text-left font-semibold">Confidence</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Reason</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!hasDelegate ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-neutral-600">
                  AI Action tables are not available yet. (Fresh database) Run migrations / Prisma schema sync, then refresh.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-neutral-600">
                  No actions in this status.
                </td>
              </tr>
            ) : (
              rows.map((r: any) => (
                <tr key={r.id} className="border-t border-neutral-200">
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-3 text-neutral-950">
                    <div className="font-medium">{r.action}</div>
                    {r.requiresApproval ? <div className="text-xs text-amber-700">Requires approval</div> : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    <div className="font-medium">{r.entityType}</div>
                    <div className="text-xs text-neutral-500">{r.entityId}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-950">{r.priority}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-950">
                    {Number(r.confidence).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(
                        r.status,
                      )}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    <div className="line-clamp-3">{r.reason}</div>
                    {r.errorMessage ? <div className="mt-1 text-xs text-red-700 line-clamp-2">{r.errorMessage}</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {r.status === "APPROVAL_REQUIRED" ? (
                        <form action={approveAIActionAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <PendingSubmitButton pendingText="Approving...">Approve</PendingSubmitButton>
                        </form>
                      ) : null}

                      {r.status === "APPROVED" || (!r.requiresApproval && r.status === "PENDING") ? (
                        <form action={executeAIActionAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                            Execute
                          </button>
                        </form>
                      ) : null}

                      {r.status !== "COMPLETED" && r.status !== "CANCELLED" ? (
                        <form action={cancelAIActionAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                            Cancel
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="border-t border-neutral-200 px-4 py-4">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}
