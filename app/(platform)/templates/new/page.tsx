import "server-only";

import Link from "next/link";
import { TemplateCategory } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
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

export default async function NewTemplatePage() {
  await requireExecutive();

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Template Library"
        title="New Template"
        subtitle="Create a reusable template item. Use variables like {{projectName}} and document links like {{documentLink}}."
        backHref="/templates"
        backLabel="Templates"
        actions={
          <Link href="/templates">
            <ActionButton variant="secondary">Cancel</ActionButton>
          </Link>
        }
      />

      <SectionCard title="Template Details" description="Codes should be stable. Use EMAIL_* and WHATSAPP_* prefixes for messaging templates.">
        <form action={upsertTemplateLibraryItemAction} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Category</p>
              <select
                name="category"
                defaultValue={TemplateCategory.QUOTATION_TERMS}
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
              <label className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3">
                <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4" />
                <span className="text-sm font-semibold text-neutral-900">Active</span>
              </label>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Code</p>
              <Input name="code" placeholder="STD_QUOTATION_TERMS" required />
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Unique within the category. Example: <span className="font-mono">EMAIL_PROPOSAL_SENT</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Title</p>
              <Input name="title" placeholder="Standard Quotation Terms" required />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Description</p>
            <Textarea name="description" rows={3} placeholder="Optional notes for internal use." />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Content</p>
              <Textarea name="content" rows={14} placeholder="Template content. For EMAIL templates you may store JSON: {subjectTemplate, bodyTemplate}." required />
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Use variables in double curly braces, e.g. <span className="font-mono">{"{{projectName}}"}</span>.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Variables JSON</p>
              <Textarea
                name="variablesJson"
                rows={14}
                placeholder='Optional JSON to document variables, e.g. ["projectName","documentLink"]'
              />
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Optional. Stored as JSON for variable chips and future validations.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <ActionButton type="submit" variant="primary">
              Create Template
            </ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

