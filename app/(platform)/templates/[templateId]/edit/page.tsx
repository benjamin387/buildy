import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateCategory } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { getTemplateLibraryItemById } from "@/lib/templates/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { upsertTemplateLibraryItemAction } from "@/app/(platform)/templates/actions";

export const dynamic = "force-dynamic";

function labelCategory(c: TemplateCategory): string {
  return c
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\\s)\\S/g, (m) => m.toUpperCase());
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
    />
  );
}

export default async function EditTemplatePage(props: { params: Promise<{ templateId: string }> }) {
  await requireExecutive();
  const { templateId } = await props.params;

  const tpl = await getTemplateLibraryItemById(templateId);
  if (!tpl) notFound();

  const variablesJsonText =
    tpl.variablesJson === null || tpl.variablesJson === undefined
      ? ""
      : JSON.stringify(tpl.variablesJson, null, 2);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Template Library"
        title="Edit Template"
        subtitle={`${labelCategory(tpl.category)} · ${tpl.code}`}
        backHref={`/templates/${tpl.id}`}
        backLabel="Template"
        actions={
          <Link href={`/templates/${tpl.id}`}>
            <ActionButton variant="secondary">Cancel</ActionButton>
          </Link>
        }
      />

      <SectionCard title="Template Editor" description="Edits apply immediately for template consumers. Messaging uses MessageTemplate first, then template library fallback.">
        <form action={upsertTemplateLibraryItemAction} className="space-y-6">
          <input type="hidden" name="id" value={tpl.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Category</p>
              <select
                name="category"
                defaultValue={tpl.category}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                {Object.values(TemplateCategory).map((c) => (
                  <option key={c} value={c}>
                    {labelCategory(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Status</p>
              <label className="mt-2 flex items-center gap-3 rounded-md border border-slate-200 bg-stone-50 px-4 py-3">
                <input type="checkbox" name="isActive" defaultChecked={tpl.isActive} className="h-4 w-4" />
                <span className="text-sm font-semibold text-neutral-900">Active</span>
              </label>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Code</p>
              <Input name="code" defaultValue={tpl.code} required />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Title</p>
              <Input name="title" defaultValue={tpl.title} required />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Description</p>
            <Textarea name="description" rows={3} defaultValue={tpl.description ?? ""} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Content</p>
              <Textarea name="content" rows={14} defaultValue={tpl.content} required />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Variables JSON</p>
              <Textarea name="variablesJson" rows={14} defaultValue={variablesJsonText} />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <ActionButton type="submit" variant="primary">
              Save Template
            </ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

