import Link from "next/link";
import {
  AccountingMappingType,
  AccountingProvider,
  Permission,
  type PermissionLevel,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { isXeroOAuthConfigured, isXeroRuntimeConfigured } from "@/lib/accounting/xero-client";
import {
  clearSyncLogsAction,
  initializeAccountingDefaultsAction,
  markConnectionConnectedStubAction,
  markConnectionDisconnectedAction,
  syncContactsAction,
  syncRecentInvoicesAction,
  syncRecentReceiptsAction,
  syncRecentSupplierBillsAction,
  syncItemsAction,
  upsertAccountMappingAction,
} from "@/app/(platform)/settings/accounting/actions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";

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

function formatPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function badgeClass(status: string): string {
  if (status === "CONNECTED" || status === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "ERROR") return "border-red-200 bg-red-50 text-red-700";
  if (status === "SKIPPED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-neutral-300 bg-neutral-50 text-neutral-700";
}

const provider = AccountingProvider.XERO;

export default async function AccountingSettingsPage() {
  await requirePermission({ permission: Permission.SETTINGS_READ });

  const [connection, taxCodes, mappings, logs] = await Promise.all([
    prisma.accountingConnection.findFirst({ where: { provider }, orderBy: [{ updatedAt: "desc" }] }),
    prisma.taxCode.findMany({ where: { provider }, orderBy: [{ code: "asc" }] }),
    prisma.accountMapping.findMany({ where: { provider }, orderBy: [{ mappingType: "asc" }, { internalKey: "asc" }] }),
    prisma.accountingSyncLog.findMany({
      where: { provider },
      orderBy: [{ syncedAt: "desc" }],
      take: 80,
    }),
  ]);

  const oauthConfigured = isXeroOAuthConfigured();
  const runtimeConfigured = isXeroRuntimeConfigured();

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Settings / Accounting
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Accounting Sync (Xero-ready)
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Foundation layer for syncing invoices, supplier bills, payments, contacts, tax codes, and items to an accounting provider.
              No real Xero API calls are made yet; sync buttons generate payloads and write audit logs safely.
            </p>
          </div>
          <Link
            href="/settings/security"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Security Center
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Provider</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">Xero</p>
          <p className="mt-2 text-sm text-neutral-600">
            OAuth configured: <span className="font-medium text-neutral-900">{oauthConfigured ? "Yes" : "No"}</span>
            <br />
            Runtime creds: <span className="font-medium text-neutral-900">{runtimeConfigured ? "Yes" : "No"}</span>
          </p>
          <p className="mt-3 text-xs text-neutral-500">
            Env: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `XERO_TENANT_ID`, `XERO_ACCESS_TOKEN`
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Connection</p>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(
                connection?.status ?? "DISCONNECTED",
              )}`}
            >
              {connection?.status ?? "DISCONNECTED"}
            </span>
            <span className="text-sm text-neutral-700">
              {connection?.organisationName ?? "No organisation"}
            </span>
          </div>
          <p className="mt-3 text-sm text-neutral-600">
            Tenant: {connection?.tenantId ?? "-"}
            <br />
            Connected: {formatDateTime(connection?.connectedAt)}
            <br />
            Refreshed: {formatDateTime(connection?.refreshedAt)}
          </p>

          <div className="mt-4 grid gap-2">
            <form action={initializeAccountingDefaultsAction}>
              <PendingSubmitButton pendingText="Initializing...">Initialize defaults</PendingSubmitButton>
            </form>
            <form action={markConnectionDisconnectedAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Mark Disconnected
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Sync Tools</p>
          <p className="mt-3 text-sm text-neutral-700">
            Trigger safe payload preparation and write sync logs.
          </p>
          <div className="mt-4 grid gap-2">
            <form action={syncContactsAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Sync Contacts (Dry-run)
              </button>
            </form>
            <form action={syncItemsAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Sync Items/SKUs (Dry-run)
              </button>
            </form>
            <form action={syncRecentInvoicesAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Sync Recent Invoices (Dry-run)
              </button>
            </form>
            <form action={syncRecentSupplierBillsAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Sync Recent Supplier Bills (Dry-run)
              </button>
            </form>
            <form action={syncRecentReceiptsAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Sync Recent Receipts (Dry-run)
              </button>
            </form>
            <form action={clearSyncLogsAction}>
              <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100">
                Clear Sync Logs
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Connection Stub (for testing)</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Optional: mark a connection as CONNECTED in the database so downstream flows can proceed during development.
          </p>
        </div>
        <form action={markConnectionConnectedStubAction} className="grid gap-4 p-6 md:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Organisation Name</span>
            <input
              name="organisationName"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. My Renovation Pte Ltd"
              defaultValue={connection?.organisationName ?? ""}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Tenant ID</span>
            <input
              name="tenantId"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Xero tenant id (placeholder)"
              defaultValue={connection?.tenantId ?? ""}
            />
          </label>
          <div className="flex items-end justify-end">
            <PendingSubmitButton pendingText="Saving...">Mark Connected</PendingSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Tax Codes</h2>
          <p className="mt-1 text-sm text-neutral-600">
            GST-ready coding: standard-rated (9%) and exempt supported. Provider code mapping will be refined during real Xero integration.
          </p>
        </div>

        {taxCodes.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">
            No tax codes. Click “Initialize defaults”.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Code</th>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-right font-semibold">Rate</th>
                  <th className="px-4 py-3 text-left font-semibold">Active</th>
                </tr>
              </thead>
              <tbody>
                {taxCodes.map((t) => (
                  <tr key={t.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-900">{t.code}</td>
                    <td className="px-4 py-3 text-neutral-700">{t.name}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{formatPct(Number(t.rate))}</td>
                    <td className="px-4 py-3 text-neutral-700">{t.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Account Mappings</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Map internal keys (e.g. `GST9`) to provider codes/accounts. This keeps core operational models provider-agnostic.
          </p>
        </div>

        <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-5">
          <form action={upsertAccountMappingAction} className="grid gap-3 md:grid-cols-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Mapping Type</span>
              <select
                name="mappingType"
                defaultValue={AccountingMappingType.TAX_CODE}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                {Object.values(AccountingMappingType).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Internal Key</span>
              <input
                name="internalKey"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. GST9"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">External Code</span>
              <input
                name="externalCode"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. OUTPUTGST"
              />
            </label>
            <div className="grid gap-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Description</span>
                <input
                  name="description"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Optional"
                />
              </label>
              <div className="flex justify-end">
                <PendingSubmitButton pendingText="Saving..." className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60">
                  Save Mapping
                </PendingSubmitButton>
              </div>
            </div>
          </form>
        </div>

        {mappings.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">
            No mappings. Initialize defaults or add a mapping above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Internal Key</th>
                  <th className="px-4 py-3 text-left font-semibold">External Code</th>
                  <th className="px-4 py-3 text-left font-semibold">Active</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-700">{m.mappingType}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900">{m.internalKey}</td>
                    <td className="px-4 py-3 text-neutral-700">{m.externalCode}</td>
                    <td className="px-4 py-3 text-neutral-700">{m.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Sync Logs</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Every sync attempt writes a log row. During foundation phase, actions typically record SKIPPED or SUCCESS (dry-run).
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No sync logs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Entity</th>
                  <th className="px-4 py-3 text-left font-semibold">Internal ID</th>
                  <th className="px-4 py-3 text-left font-semibold">Direction</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-700">{formatDateTime(l.syncedAt)}</td>
                    <td className="px-4 py-3 text-neutral-700">{l.entityType}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-800">{l.internalId}</td>
                    <td className="px-4 py-3 text-neutral-700">{l.direction}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${badgeClass(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{l.message ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
