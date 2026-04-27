import Link from "next/link";
import { Permission, ComplianceDocumentCategory, ComplianceDocumentStatus } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/server/safe-query";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";
import { upsertComplianceDocumentAction } from "@/app/(platform)/settings/document-library/actions";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatDateInput(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function expiryTone(expiryDate: Date | null | undefined) {
  if (!expiryDate) return "neutral";
  const ms = expiryDate.getTime() - new Date().getTime();
  if (ms < 0) return "danger";
  if (ms < 30 * 24 * 60 * 60 * 1000) return "warning";
  return "neutral";
}

export default async function DocumentLibrarySettingsPage() {
  await requirePermission({ permission: Permission.SETTINGS_READ });
  await requireUser();

  const docs = await safeQuery(
    () =>
      prisma.complianceDocument.findMany({
        orderBy: [{ status: "asc" }, { expiryDate: "asc" }, { createdAt: "desc" }],
        take: 300,
      }),
    [],
  );
  const nowMs = new Date().getTime();

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Settings</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">Document Library</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Store reusable compliance and tender documents with expiry tracking. These documents can be linked to tender checklists and submission packs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/settings/company-compliance"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
          >
            Company Compliance Profile
          </Link>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add / Update Document" description="Use URLs for now. Upload storage can be wired later.">
          <form action={upsertComplianceDocumentAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value="" />
            <Field label="Title" name="title" required placeholder="e.g. BizSAFE Level 3 Certificate" />
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Category</label>
              <select
                name="category"
                defaultValue={ComplianceDocumentCategory.OTHER}
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              >
                {Object.values(ComplianceDocumentCategory).map((c) => (
                  <option key={c} value={c}>
                    {String(c).replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <Field label="File URL" name="fileUrl" placeholder="https://..." />
            <Field label="Issue Date" name="issueDate" placeholder="YYYY-MM-DD" />
            <Field label="Expiry Date" name="expiryDate" placeholder="YYYY-MM-DD" />
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Status</label>
              <select
                name="status"
                defaultValue={ComplianceDocumentStatus.ACTIVE}
                className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              >
                {Object.values(ComplianceDocumentStatus).map((s) => (
                  <option key={s} value={s}>
                    {String(s).replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Description</label>
              <textarea
                name="description"
                className="mt-2 h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Notes, scope, policy details, tender usage..."
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <ActionButton type="submit">Save Document</ActionButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Library Register" description="Expiry badges help detect risk before tender submission.">
          {docs.length === 0 ? (
            <EmptyState title="No documents yet" description="Add BizSAFE, insurance, financial statements and track record documents." />
          ) : (
            <div className="space-y-2">
              {docs.map((d: any) => (
                <details key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">{d.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {String(d.category).replaceAll("_", " ")} · Status {String(d.status).replaceAll("_", " ")} · Exp {formatDate(d.expiryDate)}
                      </p>
                    </div>
                    <StatusPill tone={expiryTone(d.expiryDate)}>{d.expiryDate ? (d.expiryDate.getTime() < nowMs ? "Expired" : "Valid") : "No expiry"}</StatusPill>
                  </summary>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <form action={upsertComplianceDocumentAction} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                      <input type="hidden" name="id" value={d.id} />
                      <Field label="Title" name="title" required defaultValue={d.title} />
                      <div>
                        <label className="block text-sm font-semibold text-neutral-900">Category</label>
                        <select
                          name="category"
                          defaultValue={d.category}
                          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        >
                          {Object.values(ComplianceDocumentCategory).map((c) => (
                            <option key={c} value={c}>
                              {String(c).replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Field label="File URL" name="fileUrl" defaultValue={d.fileUrl ?? ""} placeholder="https://..." />
                      <Field label="Issue Date" name="issueDate" defaultValue={formatDateInput(d.issueDate)} placeholder="YYYY-MM-DD" />
                      <Field label="Expiry Date" name="expiryDate" defaultValue={formatDateInput(d.expiryDate)} placeholder="YYYY-MM-DD" />
                      <div>
                        <label className="block text-sm font-semibold text-neutral-900">Status</label>
                        <select
                          name="status"
                          defaultValue={d.status}
                          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        >
                          {Object.values(ComplianceDocumentStatus).map((s) => (
                            <option key={s} value={s}>
                              {String(s).replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-neutral-900">Description</label>
                        <textarea
                          name="description"
                          defaultValue={d.description ?? ""}
                          className="mt-2 h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                      </div>
                      <div className="sm:col-span-2 flex justify-end gap-2">
                        {d.fileUrl ? (
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                            Open File
                          </a>
                        ) : null}
                        <ActionButton type="submit" variant="secondary">
                          Update
                        </ActionButton>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
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
        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}
