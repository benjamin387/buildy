import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireExecutive } from "@/lib/rbac/executive";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";
import { safeQuery } from "@/lib/server/safe-query";
import { convertGebizImportedItemAction, deleteGebizFeedSourceAction, runGebizImportNowAction, upsertGebizFeedSourceAction } from "@/app/(platform)/settings/gebiz/actions";

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

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 }).format(value);
}

export const dynamic = "force-dynamic";

function pillToneForRun(status: string): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "RUNNING") return "info";
  return "neutral";
}

export default async function GebizSettingsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireExecutive();
  await requirePermission({ permission: Permission.SETTINGS_READ });

  // If the Prisma client was not regenerated/restarted after schema updates, delegates can be missing.
  // Render a safe diagnostic instead of crashing the whole page.
  if (typeof (prisma as any).gebizFeedSource?.findMany !== "function") {
    return (
      <main className="space-y-6">
        <PageHeader
          kicker="Settings / Integrations"
          title="GeBIZ Auto-Feed"
          subtitle="Prisma client is missing the GeBIZ delegates. This is usually a stale dev server cache."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/settings">
                <ActionButton variant="secondary">Back to Settings</ActionButton>
              </Link>
            </div>
          }
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">Fix required</p>
          <p className="mt-1 text-amber-800">
            Run <span className="font-mono">npx prisma generate</span> and restart the dev server. If deployed, redeploy
            so the generated Prisma client includes the latest schema.
          </p>
        </div>
      </main>
    );
  }

  const sp = props.searchParams ? await props.searchParams : {};
  const error = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const notice = typeof sp.notice === "string" ? sp.notice : Array.isArray(sp.notice) ? sp.notice[0] : "";

  const [sources, runs, items, users] = await Promise.all([
    safeQuery(
      () =>
        prisma.gebizFeedSource.findMany({
          orderBy: [{ createdAt: "desc" }],
          include: {
            defaultOwnerUser: { select: { id: true, name: true, email: true } },
            _count: { select: { importedItems: true, importRuns: true } },
          },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.gebizImportRun.findMany({
          orderBy: [{ startedAt: "desc" }],
          take: 20,
          include: { feedSource: { select: { id: true, name: true } } },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.gebizImportedItem.findMany({
          orderBy: [{ createdAt: "desc" }],
          take: 40,
          include: {
            feedSource: { select: { id: true, name: true } },
            bidOpportunity: { select: { id: true, opportunityNo: true, status: true, title: true } },
          },
        }),
      [] as any[],
    ),
    safeQuery(
      () =>
        prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true, email: true },
          orderBy: [{ createdAt: "asc" }],
          take: 250,
        }),
      [] as any[],
    ),
  ]);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.buildy.sg"}/api/cron/gebiz-import`;
  const latestRun = runs?.[0] ?? null;

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings / Integrations"
        title="GeBIZ Auto-Feed"
        subtitle="Read-only RSS import for selected procurement categories. Imports create Bid Opportunities in WATCHING status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bidding">
              <ActionButton variant="secondary">Open Bidding</ActionButton>
            </Link>
            <Link href="/settings">
              <ActionButton variant="secondary">Back to Settings</ActionButton>
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          <span className="font-semibold">Error:</span> {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <SectionCard
        title="Cron Endpoint"
        description="Configure your scheduler (Vercel Cron / external) to call this endpoint with Authorization Bearer token (CRON_SECRET). x-cron-secret header is also accepted for backward compatibility."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Endpoint</p>
            <p className="mt-2 break-all font-mono text-xs text-neutral-900">{webhookUrl}</p>
            <p className="mt-3 text-xs text-neutral-600">Method: GET/POST. Query: `?dryRun=true` supported.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Security</p>
            <p className="mt-2 text-sm text-neutral-800">
              Header: <span className="font-mono text-xs">Authorization: Bearer</span>
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Must match <span className="font-mono">CRON_SECRET</span>. No secrets are exposed to client UI.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Manual Run</p>
            <p className="mt-2 text-sm text-neutral-600">Exec-only action to fetch and import now.</p>
            <form action={runGebizImportNowAction} className="mt-3">
              <ActionButton type="submit">Run Import Now</ActionButton>
            </form>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Last Import Status"
        description="Quick snapshot of the most recent run. Detailed per-source runs are below."
      >
        {latestRun ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Status</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusPill tone={pillToneForRun(String(latestRun.status))}>{String(latestRun.status)}</StatusPill>
                <span className="text-xs text-neutral-600">{latestRun.feedSource?.name ?? "-"}</span>
              </div>
              <p className="mt-2 text-xs text-neutral-600">{latestRun.message ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Fetched</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{latestRun.itemsFetched}</p>
              <p className="mt-2 text-xs text-neutral-500">Started {formatDateTime(latestRun.startedAt)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Imported</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{latestRun.itemsCreated}</p>
              <p className="mt-2 text-xs text-neutral-500">Finished {formatDateTime(latestRun.finishedAt)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Skipped</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-950">{latestRun.itemsSkipped}</p>
              <p className="mt-2 text-xs text-neutral-500">Duplicates/filters tracked in run JSON.</p>
            </div>
          </div>
        ) : (
          <EmptyState title="No import runs yet" description="Run import now or schedule the cron endpoint." />
        )}
      </SectionCard>

      <SectionCard title="Feed Sources" description="Add RSS feeds per procurement category. Auto-import can be disabled to review before converting.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
            <p className="text-sm font-semibold text-neutral-950">Add Feed Source</p>
            <form action={upsertGebizFeedSourceAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value="" />
              <Field label="Feed Name" name="name" placeholder="e.g. Renovation Works" required />
              <Field label="Procurement Category" name="procurementCategoryName" placeholder="e.g. Renovation / Building" />
              <div className="sm:col-span-2">
                <Field label="RSS Feed URL" name="rssUrl" placeholder="https://..." required />
              </div>
              <Field label="Minimum Est. Value (SGD)" name="minimumEstimatedValue" placeholder="e.g. 80000" inputMode="decimal" />
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Default Owner</label>
                <select name="defaultOwnerUserId" className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                  <option value="">(None)</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {(u.name ?? u.email) as string}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                <Toggle name="isEnabled" label="Enabled" defaultChecked />
                <Toggle name="autoImport" label="Auto-import to Bidding" defaultChecked />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-neutral-900">Keywords Include (optional)</label>
                <textarea name="keywordsInclude" className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="One per line (or comma-separated)" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-neutral-900">Keywords Exclude (optional)</label>
                <textarea name="keywordsExclude" className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="One per line (or comma-separated)" />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <ActionButton type="submit">Add Feed</ActionButton>
              </div>
            </form>
          </div>

          <div className="space-y-3">
            {sources.length === 0 ? (
              <EmptyState title="No feed sources" description="Add your first RSS feed to enable GeBIZ auto-import." />
            ) : (
              sources.map((s: any) => (
                <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">{s.name}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-neutral-600">{s.rssUrl}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        {s.procurementCategoryName ? `${s.procurementCategoryName} · ` : ""}Imported: {s._count.importedItems} · Runs: {s._count.importRuns}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={s.isEnabled ? "success" : "neutral"}>{s.isEnabled ? "ENABLED" : "DISABLED"}</StatusPill>
                      <StatusPill tone={s.autoImport ? "info" : "warning"}>{s.autoImport ? "AUTO" : "REVIEW"}</StatusPill>
                      <Link
                        href={`/api/settings/gebiz/import-now?dryRun=true&limit=15&sourceId=${encodeURIComponent(String(s.id))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                      >
                        Test Feed
                      </Link>
                    </div>
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-neutral-700 hover:underline">Edit settings</summary>
                    <form action={upsertGebizFeedSourceAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={s.id} />
                      <Field label="Feed Name" name="name" defaultValue={s.name} required />
                      <Field label="Procurement Category" name="procurementCategoryName" defaultValue={s.procurementCategoryName ?? ""} />
                      <div className="sm:col-span-2">
                        <Field label="RSS Feed URL" name="rssUrl" defaultValue={s.rssUrl} required />
                      </div>
                      <Field label="Minimum Est. Value (SGD)" name="minimumEstimatedValue" defaultValue={s.minimumEstimatedValue ? String(s.minimumEstimatedValue) : ""} inputMode="decimal" />
                      <div>
                        <label className="block text-sm font-semibold text-neutral-900">Default Owner</label>
                        <select name="defaultOwnerUserId" defaultValue={s.defaultOwnerUserId ?? ""} className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                          <option value="">(None)</option>
                          {users.map((u: any) => (
                            <option key={u.id} value={u.id}>
                              {(u.name ?? u.email) as string}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                        <Toggle name="isEnabled" label="Enabled" defaultChecked={Boolean(s.isEnabled)} />
                        <Toggle name="autoImport" label="Auto-import to Bidding" defaultChecked={Boolean(s.autoImport)} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-neutral-900">Keywords Include</label>
                        <textarea name="keywordsInclude" defaultValue={s.keywordsInclude ?? ""} className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-neutral-900">Keywords Exclude</label>
                        <textarea name="keywordsExclude" defaultValue={s.keywordsExclude ?? ""} className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" />
                      </div>
                      <div className="sm:col-span-2 flex justify-between gap-2">
                        <ActionButton
                          type="submit"
                          variant="danger"
                          formAction={deleteGebizFeedSourceAction}
                          formNoValidate
                        >
                          Delete
                        </ActionButton>
                        <ActionButton type="submit">Save</ActionButton>
                      </div>
                    </form>
                  </details>
                </div>
              ))
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Import History" description="Latest 20 import runs.">
        {runs.length === 0 ? (
          <EmptyState title="No import runs yet" description="Run import now or schedule the cron endpoint." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-stone-50 text-neutral-800">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Started</th>
                  <th className="px-4 py-3 text-left font-semibold">Feed</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Fetched</th>
                  <th className="px-4 py-3 text-right font-semibold">Created</th>
                  <th className="px-4 py-3 text-right font-semibold">Skipped</th>
                  <th className="px-4 py-3 text-left font-semibold">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {runs.map((r: any) => (
                  <tr key={r.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3 text-neutral-700">{formatDateTime(r.startedAt)}</td>
                    <td className="px-4 py-3 text-neutral-700">{r.feedSource?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={pillToneForRun(String(r.status))}>{String(r.status)}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700 tabular-nums">{r.itemsFetched}</td>
                    <td className="px-4 py-3 text-right text-neutral-700 tabular-nums">{r.itemsCreated}</td>
                    <td className="px-4 py-3 text-right text-neutral-700 tabular-nums">{r.itemsSkipped}</td>
                    <td className="px-4 py-3 text-neutral-600">{r.message ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Imported Opportunities" description="Latest imported items across all feeds. Auto-import items link directly to the bid workspace.">
        {items.length === 0 ? (
          <EmptyState title="No imported items yet" description="Once feeds are added and cron runs, items will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-stone-50 text-neutral-800">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Opportunity</th>
                  <th className="px-4 py-3 text-left font-semibold">Agency</th>
                  <th className="px-4 py-3 text-left font-semibold">Closing</th>
                  <th className="px-4 py-3 text-right font-semibold">Est. Value</th>
                  <th className="px-4 py-3 text-left font-semibold">Feed</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-neutral-950">{it.opportunityNo}</span>
                          {it.bidOpportunity ? (
                            <StatusPill tone="info">{String(it.bidOpportunity.status).replaceAll("_", " ")}</StatusPill>
                          ) : (
                            <StatusPill tone="warning">Not Converted</StatusPill>
                          )}
                        </div>
                        <p className="line-clamp-1 text-xs text-neutral-600">{it.title}</p>
                        {it.detailUrl ? (
                          <a href={it.detailUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-neutral-900 underline">
                            GeBIZ link
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{it.agency ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(it.closingDate)}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{it.estimatedValue != null ? formatCurrency(Number(it.estimatedValue)) : "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{it.feedSource?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {it.bidOpportunity ? (
                        <Link href={`/bidding/${it.bidOpportunity.id}`}>
                          <ActionButton size="sm" variant="secondary">
                            Open Bid
                          </ActionButton>
                        </Link>
                      ) : (
                        <form action={convertGebizImportedItemAction}>
                          <input type="hidden" name="importedItemId" value={it.id} />
                          <ActionButton size="sm">Convert</ActionButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">
        {props.label}
        {props.required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <input
        name={props.name}
        required={props.required}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}

function Toggle(props: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-semibold text-neutral-900">{props.label}</span>
      <input
        type="checkbox"
        name={props.name}
        defaultChecked={props.defaultChecked}
        className="h-4 w-4 accent-neutral-900"
      />
    </label>
  );
}
