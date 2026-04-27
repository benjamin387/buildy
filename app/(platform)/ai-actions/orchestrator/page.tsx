import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { runAIOrchestratorAction, updateAIOrchestratorSettingAction } from "@/app/(platform)/ai-actions/orchestrator/actions";
import { getOrCreateAIAutomationSetting } from "@/lib/ai/automation-settings";
import type { AIAutomationModeKey } from "@/lib/ai/action-permissions";
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

function badgeClass(status: string): string {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "APPROVAL_REQUIRED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "APPROVED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "CANCELLED") return "border-neutral-300 bg-neutral-50 text-neutral-600";
  return "border-neutral-300 bg-white text-neutral-700";
}

const modes: Array<{ value: AIAutomationModeKey; label: string; description: string }> = [
  { value: "MANUAL", label: "Manual", description: "Only creates action recommendations. No auto execution." },
  { value: "ASSISTED", label: "Assisted", description: "Auto-executes low-risk internal/draft actions only." },
  { value: "AUTO_SAFE", label: "Auto Safe", description: "Same as Assisted (low-risk only), intended for cron scheduling." },
  { value: "AUTO_FULL", label: "Auto Full", description: "Executes a safe subset of medium-risk actions (still no legal/financial sending)." },
];

export default async function AIOrchestratorPage() {
  await requireExecutive();

  const prismaAny = prisma as unknown as Record<string, any>;
  const logDelegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog ?? null;
  const hasLogDelegate = Boolean(logDelegate && typeof logDelegate.findMany === "function");

  const setting = await safeQuery(() => getOrCreateAIAutomationSetting(), {
    id: "GLOBAL",
    automationMode: "ASSISTED",
    isActive: true,
    allowLeadFollowUp: true,
    allowDesignGeneration: true,
    allowQuotationDrafting: false,
    allowPaymentReminder: false,
    allowCollectionsEscalation: false,
    allowSalesPackageGeneration: false,
    requireApprovalForQuotations: true,
    requireApprovalForContracts: true,
    requireApprovalForInvoices: true,
    requireApprovalForPricingChanges: true,
    requireApprovalForLegalEscalation: true,
    updatedBy: null,
    lastRunAt: null,
    lastRunSummary: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as any);

  const [pendingCount, recent] = await Promise.all([
    safeQuery(async () => {
      if (!hasLogDelegate) return 0;
      return (await logDelegate.count({
        where: { status: { in: ["PENDING", "APPROVAL_REQUIRED", "APPROVED"] } },
      })) as number;
    }, 0),
    safeQuery(async () => {
      if (!hasLogDelegate) return [];
      return (await logDelegate.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 30,
      })) as any[];
    }, [] as any[]),
  ]);

  const lastSummary = (setting.lastRunSummary ?? null) as any;

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              AI Actions / Orchestrator
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              AI Orchestrator
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Scans leads, design briefs, projects, invoices, collections, and cashflow to generate AI action recommendations.
              Duplicate actions are suppressed while an action is pending/approval-required/approved.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ai-actions"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Back to AI Actions
            </Link>
            <Link
              href="/command-center"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Command Center
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Mode</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{setting.automationMode}</p>
          <p className="mt-2 text-sm text-neutral-600">
            Active: <span className="font-medium text-neutral-900">{setting.isActive ? "Yes" : "No"}</span>
            <br />
            Pending queue: <span className="font-medium text-neutral-900">{pendingCount}</span>
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            Cron: <span className="font-mono">/api/cron/ai-orchestrator</span> (requires <span className="font-mono">CRON_SECRET</span>)
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Last Run</p>
          <p className="mt-3 text-sm text-neutral-700">
            Last run at: <span className="font-semibold text-neutral-950">{formatDateTime(setting.lastRunAt)}</span>
          </p>
          <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <div className="flex items-center justify-between">
              <span>Scanned</span>
              <span className="font-semibold text-neutral-950">{lastSummary?.actions?.evaluated ?? 0}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Created</span>
              <span className="font-semibold text-neutral-950">{lastSummary?.actions?.created ?? 0}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Skipped duplicates</span>
              <span className="font-semibold text-neutral-950">{lastSummary?.actions?.skippedDuplicates ?? 0}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Errors</span>
              <span className="font-semibold text-neutral-950">{lastSummary?.actions?.errors ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Run Now</p>
          <p className="mt-3 text-sm text-neutral-700">
            Run orchestrator manually to generate recommendations and (depending on mode) execute low-risk internal/draft actions.
          </p>
          <form action={runAIOrchestratorAction} className="mt-4 grid gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="dryRun" className="h-4 w-4 rounded border-neutral-300" defaultChecked />
              Dry-run (no execution)
            </label>
            <PendingSubmitButton pendingText="Running...">Run Orchestrator</PendingSubmitButton>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Automation Settings</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Safety rules remain enforced even in AUTO_FULL: legal/financial sending and pricing changes always require approval.
          </p>
        </div>
        <form action={updateAIOrchestratorSettingAction} className="grid gap-4 p-6 md:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Mode</span>
            <select
              name="mode"
              defaultValue={setting.automationMode}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            >
              {modes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-neutral-500">
              {modes.find((m) => m.value === setting.automationMode)?.description ?? ""}
            </span>
          </label>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" name="isActive" className="h-4 w-4 rounded border-neutral-300" defaultChecked={setting.isActive} />
              Orchestrator active
            </label>
          </div>

          <div className="flex items-end justify-end">
            <PendingSubmitButton pendingText="Saving...">Save</PendingSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Recent Generated Actions</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Most recent action logs across all statuses.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Created</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
                <th className="px-4 py-3 text-left font-semibold">Entity</th>
                <th className="px-4 py-3 text-left font-semibold">Priority</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {!hasLogDelegate ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-neutral-600">
                    AI Action tables are not available yet. (Fresh database) Run migrations / Prisma schema sync, then refresh.
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-neutral-600">
                    No AI actions yet.
                  </td>
                </tr>
              ) : (
                recent.map((r: any) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-neutral-950">{r.action}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div className="font-medium">{r.entityType}</div>
                      <div className="text-xs text-neutral-500">{r.entityId}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-neutral-950">{r.priority}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700 line-clamp-2">{r.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
