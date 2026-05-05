import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateCategory } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { getTemplateLibraryItemById } from "@/lib/templates/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { TemplateCopyButton } from "@/app/components/templates/copy-button";

export const dynamic = "force-dynamic";

function labelCategory(c: TemplateCategory): string {
  return c
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/(^|\\s)\\S/g, (m) => m.toUpperCase());
}

function extractVariables(vars: unknown): string[] {
  if (!vars) return [];
  if (Array.isArray(vars)) return vars.filter((v) => typeof v === "string") as string[];
  if (typeof vars === "object") return Object.keys(vars as any);
  return [];
}

export default async function TemplateDetailPage(props: {
  params: Promise<{ templateId: string }>;
}) {
  await requireExecutive();
  const { templateId } = await props.params;

  const tpl = await getTemplateLibraryItemById(templateId);
  if (!tpl) notFound();

  const variables = extractVariables(tpl.variablesJson);

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Template Library"
        title={tpl.title}
        subtitle={`${labelCategory(tpl.category)} · ${tpl.code}`}
        backHref="/templates"
        backLabel="Templates"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TemplateCopyButton text={tpl.code} label="Copy code" />
            <TemplateCopyButton text={tpl.content} label="Copy content" />
            <Link href={`/templates/${tpl.id}/edit`}>
              <ActionButton variant="primary">Edit</ActionButton>
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Meta" description="Status and variable documentation for future integrations.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Meta label="Category" value={labelCategory(tpl.category)} />
            <Meta label="Code" value={tpl.code} mono />
            <Meta label="Status" value={tpl.isActive ? "Active" : "Inactive"} pill={tpl.isActive ? "success" : "neutral"} />
            <Meta label="Updated" value={new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(tpl.updatedAt)} />
          </div>

          {tpl.description ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Description</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-800">{tpl.description}</p>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Variables</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {variables.length === 0 ? (
                <StatusPill tone="neutral">No variables documented</StatusPill>
              ) : (
                variables.map((v) => (
                  <StatusPill key={v} tone="neutral">
                    {v}
                  </StatusPill>
                ))
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Preview" description="Raw template preview. Rendering depends on the integration surface.">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-neutral-900">
              {tpl.content}
            </pre>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-stone-50 p-5 text-sm leading-7 text-neutral-700">
            <p className="font-semibold text-neutral-900">Use in modules</p>
            <p className="mt-2">
              This template is available to integrations via <span className="font-mono text-xs">TemplateLibraryItem</span>.
              Messaging templates with codes like <span className="font-mono text-xs">EMAIL_*</span> and{" "}
              <span className="font-mono text-xs">WHATSAPP_*</span> can be rendered as fallbacks if no MessageTemplate exists.
            </p>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

function Meta(props: { label: string; value: string; mono?: boolean; pill?: "success" | "neutral" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.label}</p>
      <div className="mt-2">
        {props.pill ? (
          <StatusPill tone={props.pill}>{props.value}</StatusPill>
        ) : (
          <p className={props.mono ? "font-mono text-xs text-neutral-950" : "text-sm font-semibold text-neutral-950"}>
            {props.value}
          </p>
        )}
      </div>
    </div>
  );
}

