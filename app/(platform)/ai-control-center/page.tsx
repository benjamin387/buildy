import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { updateAIControlCenterAction } from "@/app/(platform)/ai-control-center/actions";
import { getOrCreateAIAutomationSetting, type AIAutomationSettingRow } from "@/lib/ai/automation-settings";
import type { AIAutomationModeKey } from "@/lib/ai/action-permissions";
import { safeQuery } from "@/lib/server/safe-query";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

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

const modes: Array<{ value: AIAutomationModeKey; label: string; description: string }> = [
  { value: "MANUAL", label: "Manual", description: "Only creates action recommendations. No auto execution." },
  { value: "ASSISTED", label: "Assisted", description: "Auto-executes low-risk internal/draft actions only." },
  { value: "AUTO_SAFE", label: "Auto Safe", description: "Same as Assisted (low-risk only), intended for cron scheduling." },
  { value: "AUTO_FULL", label: "Auto Full", description: "Executes a safe subset of medium-risk actions (still no legal/financial sending)." },
];

export default async function AIControlCenterPage() {
  await requireExecutive();
  await requirePermission({ moduleKey: "AI_CONTROL" satisfies PermissionModuleKey, action: "view" });

  const prismaAny = prisma as unknown as Record<string, any>;
  const logDelegate = prismaAny.aIActionLog ?? prismaAny.aiActionLog ?? null;
  const hasLogDelegate = Boolean(logDelegate && typeof logDelegate.findMany === "function");

  const defaultSetting: AIAutomationSettingRow = {
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
  };

  const setting = (await safeQuery(() => getOrCreateAIAutomationSetting(), defaultSetting)) as AIAutomationSettingRow;

  const [pendingApproval, failed, pendingQueue, recent] = await Promise.all([
    safeQuery(async () => {
      if (!hasLogDelegate) return 0;
      return (await logDelegate.count({ where: { status: "APPROVAL_REQUIRED" } })) as number;
    }, 0),
    safeQuery(async () => {
      if (!hasLogDelegate) return 0;
      return (await logDelegate.count({ where: { status: "FAILED" } })) as number;
    }, 0),
    safeQuery(async () => {
      if (!hasLogDelegate) return 0;
      return (await logDelegate.count({ where: { status: { in: ["PENDING", "APPROVAL_REQUIRED", "APPROVED"] } } })) as number;
    }, 0),
    safeQuery(async () => {
      if (!hasLogDelegate) return [];
      return (await logDelegate.findMany({ orderBy: [{ createdAt: "desc" }], take: 20 })) as any[];
    }, [] as any[]),
  ]);

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Platform / AI Control Center
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              AI Auto Mode Control Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Safety controls for AI automation. Configure which categories are allowed, and which actions always require human approval.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ai-actions"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              AI Actions
            </Link>
            <Link
              href="/ai-actions/orchestrator"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Orchestrator
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Mode" value={setting.automationMode} />
        <SummaryCard title="Automation Active" value={setting.isActive ? "Yes" : "No"} />
        <SummaryCard title="Pending Approval" value={String(pendingApproval)} emphasis />
        <SummaryCard title="Failed Actions" value={String(failed)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Safety Summary</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Hard safety rules remain enforced even in <span className="font-mono">AUTO_FULL</span>.
            </p>
          </div>
          <div className="space-y-3 p-6 text-sm text-neutral-700">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="font-semibold text-neutral-900">Always requires approval</p>
              <ul className="mt-2 list-disc pl-5">
                <li>Sending contracts</li>
                <li>Creating/sending invoices</li>
                <li>Changing pricing</li>
                <li>Approving variations</li>
                <li>Legal escalation / collections escalation</li>
              </ul>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="font-semibold text-neutral-900">Automation scope</p>
              <p className="mt-2">
                Allowed categories control whether the orchestrator/runner will generate or execute actions. In Assisted/Auto Safe, only low-risk draft/internal actions auto-execute.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Configuration</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Updates apply immediately to the AI Action Runner and Orchestrator.
            </p>
          </div>
          <form action={updateAIControlCenterAction} className="space-y-6 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Automation mode</span>
                <select
                  name="automationMode"
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
                  Automation active
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Allowed Categories</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Toggle name="allowLeadFollowUp" label="Lead follow-up drafts" defaultChecked={setting.allowLeadFollowUp} />
                <Toggle name="allowDesignGeneration" label="Design generation (layout/visual)" defaultChecked={setting.allowDesignGeneration} />
                <Toggle name="allowQuotationDrafting" label="Quotation drafting/follow-up" defaultChecked={setting.allowQuotationDrafting} />
                <Toggle name="allowSalesPackageGeneration" label="Sales package generation" defaultChecked={setting.allowSalesPackageGeneration} />
                <Toggle name="allowPaymentReminder" label="Payment reminder drafts" defaultChecked={setting.allowPaymentReminder} />
                <Toggle name="allowCollectionsEscalation" label="Collections escalation recommendations" defaultChecked={setting.allowCollectionsEscalation} />
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Approval Requirements (Additional)</p>
              <p className="mt-2 text-sm text-neutral-600">
                These can only add approval requirements. Hard safety rules still apply even if a checkbox is unchecked.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Toggle name="requireApprovalForQuotations" label="Require approval for quotations" defaultChecked={setting.requireApprovalForQuotations} />
                <Toggle name="requireApprovalForContracts" label="Require approval for contracts" defaultChecked={setting.requireApprovalForContracts} />
                <Toggle name="requireApprovalForInvoices" label="Require approval for invoices" defaultChecked={setting.requireApprovalForInvoices} />
                <Toggle name="requireApprovalForPricingChanges" label="Require approval for pricing changes" defaultChecked={setting.requireApprovalForPricingChanges} />
                <Toggle name="requireApprovalForLegalEscalation" label="Require approval for legal escalation" defaultChecked={setting.requireApprovalForLegalEscalation} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-neutral-500">
                Last orchestrator run: <span className="font-medium text-neutral-900">{formatDateTime(setting.lastRunAt)}</span>
                <br />
                Pending queue: <span className="font-medium text-neutral-900">{pendingQueue}</span>
              </div>
              <PendingSubmitButton pendingText="Saving...">Save Settings</PendingSubmitButton>
            </div>
          </form>
        </section>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Recent AI Actions</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Latest action logs across the platform.
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
                <th className="px-4 py-3 text-left font-semibold">Confidence</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {!hasLogDelegate ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-neutral-600">
                    AI Action tables are not available yet. (Fresh database) Run migrations / Prisma schema sync, then refresh.
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-neutral-600">
                    No AI actions yet.
                  </td>
                </tr>
              ) : (
                recent.map((r: any) => (
                  <tr key={r.id} className="border-t border-neutral-200 bg-white">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-neutral-950">{r.action}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div className="font-medium text-neutral-900">{r.entityType}</div>
                      <div className="text-xs text-neutral-500">{r.entityId}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-900">{r.priority}</td>
                    <td className="px-4 py-3 text-neutral-900">{Number(r.confidence).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div className="line-clamp-2">{r.reason}</div>
                      {r.errorMessage ? <div className="mt-1 text-xs text-red-700 line-clamp-2">{r.errorMessage}</div> : null}
                    </td>
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

function SummaryCard(props: { title: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${props.emphasis ? "text-neutral-950" : "text-neutral-900"}`}>
        {props.value}
      </p>
    </div>
  );
}

function Toggle(props: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      <span className="font-medium text-neutral-900">{props.label}</span>
      <input type="checkbox" name={props.name} className="h-4 w-4 rounded border-neutral-300" defaultChecked={props.defaultChecked} />
    </label>
  );
}
