import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { createClientFollowUp, seedDefaultClientMessageTemplates } from "@/app/(platform)/design-ai/sales/actions";
import { SALES_STAGES } from "@/lib/design-ai/sales-constants";

export default async function DesignAiSalesPage() {
  await requireUser();

  const followUps = await prisma.clientFollowUp.findMany({
    orderBy: [{ priority: "desc" }, { nextFollowUpAt: "asc" }, { createdAt: "desc" }],
  });

  const now = new Date();
  const openCount = followUps.filter((x) => x.status === "OPEN").length;
  const highPriorityCount = followUps.filter((x) => x.priority === "HIGH" && x.status === "OPEN").length;
  const overdueCount = followUps.filter((x) => x.nextFollowUpAt && x.nextFollowUpAt < now && x.status === "OPEN").length;

  const stageMap = new Map<string, typeof followUps>();
  for (const stage of SALES_STAGES) stageMap.set(stage, []);
  for (const row of followUps) {
    const bucket = stageMap.get(row.stage) ?? [];
    bucket.push(row);
    stageMap.set(row.stage, bucket);
  }

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="AI Sales Assistant"
        subtitle="Track follow-ups, generate AI responses, and move clients from proposal to signed contract."
        backHref="/design-ai"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric title="Open Follow-ups" value={String(openCount)} hint="Active records" />
        <Metric title="High Priority" value={String(highPriorityCount)} hint="Needs immediate action" />
        <Metric title="Overdue" value={String(overdueCount)} hint="Past scheduled date" />
      </section>

      <SectionCard title="Create Follow-up" description="Add a new client follow-up record for AI assistance.">
        <form action={createClientFollowUp} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client Name" name="clientName" required />
          <Field label="Client Phone" name="clientPhone" required />
          <SelectField label="Stage" name="stage" options={Array.from(SALES_STAGES)} />
          <SelectField label="Priority" name="priority" options={["HIGH", "MEDIUM", "LOW"]} />
          <Field label="Design Brief ID" name="designBriefId" />
          <Field label="Quotation ID" name="quotationId" />
          <Field label="Proposal ID" name="proposalId" />
          <Field label="Next Follow-up" name="nextFollowUpAt" type="datetime-local" />
          <TextAreaField label="Client Concern" name="clientConcern" className="sm:col-span-2 lg:col-span-4" />
          <div className="sm:col-span-2 lg:col-span-4 flex gap-2 justify-end">
            <button formAction={seedDefaultClientMessageTemplates} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-slate-50">
              Seed Templates
            </button>
            <ActionButton type="submit">Create Follow-up</ActionButton>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Sales Pipeline Board" description="Kanban-style stage tracking with priority indicators.">
        {followUps.length === 0 ? (
          <EmptyState
            title="No follow-ups yet"
            description="Create a follow-up to start AI-assisted sales workflow."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from(stageMap.entries()).map(([stage, rows]) => (
              <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-neutral-900">{stage}</p>
                  <StatusPill>{String(rows.length)}</StatusPill>
                </div>
                <div className="space-y-2">
                  {rows.length === 0 ? <p className="text-xs text-neutral-500">No records</p> : null}
                  {rows.map((row) => (
                    <Link key={row.id} href={`/design-ai/sales/${row.id}`} className="block rounded-lg border border-white bg-white px-3 py-2 shadow-sm hover:border-slate-200">
                      <p className="text-sm font-semibold text-neutral-900">{row.clientName}</p>
                      <p className="mt-1 text-xs text-neutral-600">{row.clientPhone}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusPill tone={row.priority === "HIGH" ? "danger" : row.priority === "LOW" ? "success" : "warning"}>{row.priority}</StatusPill>
                        <StatusPill tone={row.status === "DONE" ? "success" : "info"}>{row.status}</StatusPill>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function Metric(props: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
      <p className="mt-1 text-sm text-neutral-600">{props.hint}</p>
    </div>
  );
}

function Field(props: { label: string; name: string; required?: boolean; type?: string }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <input name={props.name} required={props.required} type={props.type ?? "text"} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
    </label>
  );
}

function SelectField(props: { label: string; name: string; options: readonly string[] }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <select name={props.name} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200">
        {props.options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField(props: { label: string; name: string; className?: string }) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <textarea name={props.name} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
    </label>
  );
}
