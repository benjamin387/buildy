import "server-only";

import Link from "next/link";
import { TemplateCategory } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { listTemplateLibraryItems } from "@/lib/templates/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { toggleTemplateActiveAction } from "@/app/(platform)/templates/actions";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

export const dynamic = "force-dynamic";

function toSingle(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function labelCategory(c: TemplateCategory): string {
  return c
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\\s)\\S/g, (m) => m.toUpperCase());
}

export default async function TemplateLibraryIndexPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireExecutive();
  const sp = await props.searchParams;

  const categoryRaw = toSingle(sp.category);
  const q = toSingle(sp.q) ?? "";
  const activeRaw = toSingle(sp.active);

  const category =
    categoryRaw && Object.values(TemplateCategory).includes(categoryRaw as any)
      ? (categoryRaw as TemplateCategory)
      : null;

  const isActive =
    activeRaw === "true" ? true : activeRaw === "false" ? false : null;

  const { page, pageSize, skip, take } = parsePagination(sp);

  const { items: templates, total } = await listTemplateLibraryItems({
    category,
    q: q.trim() || null,
    isActive,
    skip,
    take,
  });

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (category) baseParams.set("category", category);
  if (activeRaw) baseParams.set("active", activeRaw);
  const hrefForPage = (n: number) => buildPageHref("/templates", baseParams, n, pageSize);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="System"
        title="Template Library"
        subtitle="Reusable templates for proposals, clauses, quotation terms, messages, BOQ starters and payment schedules."
        actions={
          <Link href="/templates/new">
            <ActionButton variant="primary">New Template</ActionButton>
          </Link>
        }
      />

      <SectionCard title="Search & Filters" description="Filter by category, status, and keyword search.">
        <form className="grid gap-4 sm:grid-cols-4" action="/templates" method="get">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Search
            </label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search code, title, content..."
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Category
            </label>
            <select
              name="category"
              defaultValue={category ?? ""}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              <option value="">All</option>
              {Object.values(TemplateCategory).map((c) => (
                <option key={c} value={c}>
                  {labelCategory(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Status
            </label>
            <select
              name="active"
              defaultValue={activeRaw ?? ""}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="sm:col-span-4 flex items-center justify-end">
            <ActionButton type="submit" variant="secondary">
              Apply Filters
            </ActionButton>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title={`Templates (${total})`}
        description="Click into a template to preview, copy, or edit."
      >
        <div className="space-y-4">
        {templates.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-stone-50 p-6 text-sm text-neutral-700">
            No templates found. Create one with <span className="font-semibold">New Template</span>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-neutral-700">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Category</th>
                  <th className="px-3 py-3 text-left font-semibold">Code</th>
                  <th className="px-3 py-3 text-left font-semibold">Title</th>
                  <th className="px-3 py-3 text-left font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-t border-slate-200/70">
                    <td className="px-3 py-3 text-neutral-700">{labelCategory(t.category)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-neutral-900">{t.code}</td>
                    <td className="px-3 py-3 text-neutral-950">{t.title}</td>
                    <td className="px-3 py-3">
                      {t.isActive ? (
                        <StatusPill tone="success">Active</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Inactive</StatusPill>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/templates/${t.id}`}>
                          <ActionButton variant="secondary" size="sm">
                            View
                          </ActionButton>
                        </Link>
                        <form action={toggleTemplateActiveAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="isActive" value={t.isActive ? "false" : "true"} />
                          <ActionButton variant="ghost" size="sm" type="submit">
                            {t.isActive ? "Deactivate" : "Activate"}
                          </ActionButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </SectionCard>
    </main>
  );
}

