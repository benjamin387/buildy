import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { addBidDocumentAction, toggleBidChecklistAction, toggleBidComplianceChecklistAction, initializeBidComplianceChecklistAction } from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidDocumentsPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id },
        include: {
          documents: { orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] },
          submissionChecklist: { orderBy: [{ sortOrder: "asc" }] },
          complianceChecklist: { orderBy: [{ sortOrder: "asc" }] },
        },
      }),
    null as any,
  );
  if (!opp) notFound();

  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Compliance Checklist" description="Risk controls for SG tenders/quotations (BizSAFE, insurance, tax, contract risk).">
          {(opp.complianceChecklist ?? []).length === 0 ? (
            <div className="space-y-3">
              <EmptyState title="Compliance checklist not initialized" description="This bid was created before compliance items were enabled. Generate defaults to start tracking." />
              <form action={initializeBidComplianceChecklistAction} className="flex justify-end">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <ActionButton type="submit">Generate Compliance Checklist</ActionButton>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              {(opp.complianceChecklist ?? []).map((c: any) => (
                <div key={c.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{c.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {c.isRequired ? "Required" : "Optional"} · {c.itemKey}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={c.status === "COMPLETED" ? "success" : c.status === "NOT_APPLICABLE" ? "neutral" : "warning"}>
                      {String(c.status).replaceAll("_", " ")}
                    </StatusPill>
                    <form action={toggleBidComplianceChecklistAction} className="flex gap-2">
                      <input type="hidden" name="opportunityId" value={opp.id} />
                      <input type="hidden" name="itemId" value={c.id} />
                      <button type="submit" name="status" value="COMPLETED" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        Done
                      </button>
                      <button type="submit" name="status" value="PENDING" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        Pending
                      </button>
                      <button type="submit" name="status" value="NOT_APPLICABLE" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        N/A
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Submission Checklist" description="Track required attachments and internal submission items.">
          {(opp.submissionChecklist ?? []).length === 0 ? (
            <EmptyState title="No checklist items" description="Checklist items will be created when the opportunity is created." />
          ) : (
            <div className="space-y-2">
              {(opp.submissionChecklist ?? []).map((c: any) => (
                <div key={c.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-950">{c.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {c.isRequired ? "Required" : "Optional"} · {c.itemKey}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={c.status === "COMPLETED" ? "success" : c.status === "NOT_APPLICABLE" ? "neutral" : "warning"}>
                      {String(c.status).replaceAll("_", " ")}
                    </StatusPill>
                    <form action={toggleBidChecklistAction} className="flex gap-2">
                      <input type="hidden" name="opportunityId" value={opp.id} />
                      <input type="hidden" name="itemId" value={c.id} />
                      <button type="submit" name="status" value="COMPLETED" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        Done
                      </button>
                      <button type="submit" name="status" value="PENDING" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        Pending
                      </button>
                      <button type="submit" name="status" value="NOT_APPLICABLE" className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        N/A
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Documents" description="Track bid documents. Upload links can be stored as file URLs (S3/Drive) for now.">
            {(opp.documents ?? []).length === 0 ? (
              <EmptyState title="No documents yet" description="Add the first bid document below." />
            ) : (
              <div className="space-y-2">
                {(opp.documents ?? []).map((d: any) => (
                  <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-950">{d.documentName}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {d.documentType ? d.documentType : "Document"} · Due {formatDate(d.dueDate)}
                        </p>
                        {d.fileUrl ? (
                          <a href={d.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline">
                            Open file
                          </a>
                        ) : null}
                      </div>
                      <StatusPill tone={d.status === "SUBMITTED" ? "success" : d.status === "UPLOADED" ? "info" : d.status === "PREPARED" ? "warning" : "neutral"}>
                        {String(d.status).replaceAll("_", " ")}
                      </StatusPill>
                    </div>
                    {d.notes ? <p className="mt-2 text-xs text-neutral-600">{d.notes}</p> : null}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <p className="text-sm font-semibold text-neutral-950">Add Document</p>
              <form action={addBidDocumentAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="opportunityId" value={opp.id} />
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-neutral-900">Document Name</label>
                  <input name="documentName" required className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="e.g. Pricing schedule / Company profile" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Document Type</label>
                  <input name="documentType" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="e.g. PDF" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Due Date</label>
                  <input name="dueDate" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="YYYY-MM-DD" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-neutral-900">File URL (optional)</label>
                  <input name="fileUrl" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="https://..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-neutral-900">Notes</label>
                  <textarea name="notes" className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200" placeholder="Any notes..." />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <ActionButton type="submit">Add Document</ActionButton>
                </div>
              </form>
            </div>
          </SectionCard>
        </div>
      </section>
    </main>
  );
}
