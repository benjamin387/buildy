import "server-only";

import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/rbac/admin";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditSource } from "@prisma/client";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";

export const dynamic = "force-dynamic";

function toSingle(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AuditPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const sp = await props.searchParams;

  const entityType = (toSingle(sp.entityType) ?? "").trim();
  const entityId = (toSingle(sp.entityId) ?? "").trim();
  const actorEmail = (toSingle(sp.actorEmail) ?? "").trim();
  const actionRaw = (toSingle(sp.action) ?? "").trim();
  const sourceRaw = (toSingle(sp.source) ?? "").trim();
  const q = (toSingle(sp.q) ?? "").trim();

  const action =
    actionRaw && Object.values(AuditAction).includes(actionRaw as any)
      ? (actionRaw as AuditAction)
      : null;
  const source =
    sourceRaw && Object.values(AuditSource).includes(sourceRaw as any)
      ? (sourceRaw as AuditSource)
      : null;

  const take = 50;
  const cursor = (toSingle(sp.cursor) ?? "").trim() || null;

  const where: any = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actorEmail) where.actorEmail = { contains: actorEmail, mode: "insensitive" };
  if (action) where.action = action;
  if (source) where.source = source;
  if (q) {
    where.OR = [
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { actorName: { contains: q, mode: "insensitive" } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    select: {
      id: true,
      createdAt: true,
      entityType: true,
      entityId: true,
      action: true,
      source: true,
      actorName: true,
      actorEmail: true,
      actorRole: true,
      ipAddress: true,
      beforeJson: true,
      afterJson: true,
      metadataJson: true,
    },
  });

  const hasMore = logs.length > take;
  const rows = logs.slice(0, take);
  const nextCursor = hasMore ? rows[rows.length - 1]?.id ?? null : null;

  const exportUrl = new URL("/audit/export", "http://localhost");
  const paramsForExport = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const vv = Array.isArray(v) ? v[0] : v;
    if (typeof vv === "string" && vv.trim()) paramsForExport.set(k, vv);
  }
  exportUrl.search = paramsForExport.toString();

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="System"
        title="Audit Logs"
        subtitle="Immutable record of who did what, when, and why. Sensitive fields are masked."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/audit/export" prefetch={false} className="hidden" />
            <a href={exportUrl.pathname + (exportUrl.search ? `?${exportUrl.search}` : "")}>
              <ActionButton variant="secondary">Export CSV</ActionButton>
            </a>
          </div>
        }
      />

      <SectionCard title="Filters" description="Use filters to narrow results. Use entityId for exact record lookup.">
        <form className="grid gap-4 sm:grid-cols-6" action="/audit" method="get">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Search
            </label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Keyword (entity, actor...)"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Entity Type
            </label>
            <input
              name="entityType"
              defaultValue={entityType}
              placeholder="Project / Invoice / Lead"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Entity ID
            </label>
            <input
              name="entityId"
              defaultValue={entityId}
              placeholder="Exact ID"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Action
            </label>
            <select
              name="action"
              defaultValue={action ?? ""}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              <option value="">All</option>
              {Object.values(AuditAction).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Source
            </label>
            <select
              name="source"
              defaultValue={source ?? ""}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              <option value="">All</option>
              {Object.values(AuditSource).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Actor Email
            </label>
            <input
              name="actorEmail"
              defaultValue={actorEmail}
              placeholder="name@company.com"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </div>
          <div className="sm:col-span-6 flex items-center justify-end gap-2">
            <ActionButton type="submit" variant="secondary">
              Apply
            </ActionButton>
            <Link href="/audit">
              <ActionButton type="button" variant="ghost">
                Reset
              </ActionButton>
            </Link>
          </div>
        </form>
      </SectionCard>

      <SectionCard title={`Results (${rows.length}${hasMore ? "+" : ""})`} description="Expand a row to see diffs and metadata.">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-stone-50 p-6 text-sm text-neutral-700">
            No audit logs found for the current filters.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <details key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="neutral">{r.action}</StatusPill>
                      <StatusPill tone="neutral">{r.source}</StatusPill>
                      <span className="text-sm font-semibold text-neutral-950">{r.entityType}</span>
                      <span className="font-mono text-xs text-neutral-600">{r.entityId}</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDateTime(r.createdAt)}
                      {r.actorEmail ? ` · ${r.actorEmail}` : ""}
                      {r.actorRole ? ` · ${r.actorRole}` : ""}
                      {r.ipAddress ? ` · ${r.ipAddress}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-neutral-500">Details</span>
                </summary>

                <div className="mt-4 grid gap-3 border-t border-slate-200/70 pt-4 lg:grid-cols-3">
                  <Block title="Before (diff)" value={r.beforeJson} />
                  <Block title="After (diff)" value={r.afterJson} />
                  <Block title="Metadata" value={r.metadataJson} />
                </div>
              </details>
            ))}

            {hasMore && nextCursor ? (
              <div className="flex justify-center pt-2">
                <Link
                  href={withCursor(sp, nextCursor)}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                >
                  Load more
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function withCursor(
  sp: Record<string, string | string[] | undefined>,
  cursor: string,
): string {
  const u = new URL("http://localhost/audit");
  for (const [k, v] of Object.entries(sp)) {
    const vv = Array.isArray(v) ? v[0] : v;
    if (typeof vv === "string" && vv.trim()) u.searchParams.set(k, vv);
  }
  u.searchParams.set("cursor", cursor);
  return `${u.pathname}?${u.searchParams.toString()}`;
}

function Block(props: { title: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.title}</p>
      <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-neutral-800">
        {safeStringify(props.value)}
      </pre>
    </div>
  );
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
