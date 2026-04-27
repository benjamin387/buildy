import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import {
  addPackItemAction,
  approvePackAction,
  createTenderSubmissionPackAction,
  reorderPackItemsAction,
  requestPackApprovalAction,
  releasePackAction,
} from "@/app/(platform)/bidding/tender-actions";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function statusTone(status: string) {
  if (status === "RELEASED") return "success";
  if (status === "APPROVED") return "success";
  if (status === "APPROVAL_REQUIRED") return "warning";
  if (status === "ARCHIVED") return "neutral";
  return "info";
}

export default async function TenderSubmissionPackPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id: opportunityId },
        select: { id: true, opportunityNo: true, title: true, agency: true, closingDate: true },
      }),
    null as any,
  );
  if (!opp) notFound();

  const [pack, requirements, complianceDocs, generatedDocs] = await Promise.all([
    safeQuery(
      () =>
        prisma.tenderSubmissionPack.findFirst({
          where: { opportunityId },
          orderBy: [{ versionNo: "desc" }],
          include: {
            items: {
              orderBy: [{ sortOrder: "asc" }],
              include: { complianceDocument: true, generatedDocument: true },
            },
            approvals: { orderBy: [{ createdAt: "desc" }], take: 10 },
          },
        }),
      null as any,
    ),
    safeQuery(() => prisma.tenderDocumentRequirement.findMany({ where: { opportunityId } }), []),
    safeQuery(() => prisma.complianceDocument.findMany({ where: { status: "ACTIVE" }, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }], take: 200 }), []),
    safeQuery(() => prisma.tenderGeneratedDocument.findMany({ where: { opportunityId }, orderBy: [{ createdAt: "desc" }], take: 200 }), []),
  ]);

  const mandatoryCount = requirements.filter((r: any) => r.isMandatory).length;
  const providedMandatory = requirements.filter((r: any) => r.isMandatory && r.status === "PROVIDED").length;
  const readiness = mandatoryCount > 0 ? Math.round((providedMandatory / mandatoryCount) * 100) : 0;

  return (
    <main className="space-y-6">
      <SectionCard title="Submission Pack Builder" description="Select, reorder and approve the final tender submission pack. Final submission remains manual on GeBIZ.">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-neutral-600">
              Opportunity <span className="font-semibold text-neutral-950">{opp.opportunityNo}</span> · {opp.agency} · Closing {formatDate(opp.closingDate)}
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-950">{opp.title}</p>
            <p className="mt-2 text-sm text-neutral-600">
              Readiness: <span className="font-semibold text-neutral-950 tabular-nums">{readiness}%</span> (mandatory provided {providedMandatory}/{mandatoryCount})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/bidding/${opportunityId}/compliance`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
              Compliance Pack
            </Link>
            <Link href={`/bidding/${opportunityId}/documents/generator`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
              Auto Generator
            </Link>
          </div>
        </div>
      </SectionCard>

      {!pack ? (
        <SectionCard title="No submission pack yet" description="Create a pack version, then add documents in order of submission.">
          <div className="space-y-4">
            <EmptyState title="Create first pack" description="Each pack version is immutable after release. Create a new version if you need to revise." />
            <form action={createTenderSubmissionPackAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="opportunityId" value={opportunityId} />
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Pack Title</label>
                <input
                  name="title"
                  placeholder="e.g. Submission Pack v1"
                  className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                />
              </div>
              <div className="flex items-end justify-end">
                <ActionButton type="submit">Create Pack</ActionButton>
              </div>
            </form>
          </div>
        </SectionCard>
      ) : (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionCard title={`Pack Register · v${pack.versionNo}`} description="Reorder documents and export as ZIP or print-to-PDF pack.">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={statusTone(String(pack.status))}>{String(pack.status).replaceAll("_", " ")}</StatusPill>
                <p className="text-sm text-neutral-600">Created: <span className="font-semibold text-neutral-950">{formatDate(pack.createdAt)}</span></p>
                <p className="text-sm text-neutral-600">Approved: <span className="font-semibold text-neutral-950">{formatDate(pack.approvedAt)}</span></p>
                <p className="text-sm text-neutral-600">Released: <span className="font-semibold text-neutral-950">{formatDate(pack.releasedAt)}</span></p>
                <div className="ml-auto flex flex-wrap gap-2">
                  <a
                    href={`/api/bidding/submission-pack/${pack.id}/zip`}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                  >
                    Export ZIP
                  </a>
                  <Link
                    href={`/bidding/${opportunityId}/submission-pack/print?packId=${pack.id}`}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                  >
                    Print / PDF
                  </Link>
                </div>
              </div>

              {pack.items.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title="No documents added yet" description="Add compliance documents and generated documents to build a complete submission pack." />
                </div>
              ) : (
                <form action={reorderPackItemsAction} className="mt-4 space-y-3">
                  <input type="hidden" name="opportunityId" value={opportunityId} />
                  <input type="hidden" name="packId" value={pack.id} />
                  {pack.items.map((it: any) => (
                    <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-950">{it.title}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {String(it.sourceType).replaceAll("_", " ")} · Category: {it.category ?? "-"}
                          </p>
                          {it.complianceDocument?.fileUrl ? (
                            <a href={it.complianceDocument.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline">
                              Open file
                            </a>
                          ) : null}
                          {it.generatedDocument ? (
                            <Link href={`/bidding/${opportunityId}/documents/generator/${it.generatedDocument.id}`} className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline">
                              Preview generated doc
                            </Link>
                          ) : null}
                          {it.manualUrl ? (
                            <a href={it.manualUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline">
                              Open link
                            </a>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill tone="neutral">#{it.sortOrder}</StatusPill>
                          <input type="hidden" name="itemId" value={it.id} />
                          <input
                            name="sortOrder"
                            defaultValue={String(it.sortOrder ?? 0)}
                            inputMode="numeric"
                            className="h-10 w-24 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-semibold tabular-nums shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <ActionButton type="submit" size="sm" variant="secondary">
                      Save Order
                    </ActionButton>
                  </div>
                </form>
              )}

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                {String(pack.status) === "DRAFT" ? (
                  <form action={requestPackApprovalAction}>
                    <input type="hidden" name="opportunityId" value={opportunityId} />
                    <input type="hidden" name="packId" value={pack.id} />
                    <ActionButton type="submit" variant="secondary">
                      Request Approval
                    </ActionButton>
                  </form>
                ) : null}

                {String(pack.status) === "APPROVAL_REQUIRED" ? (
                  <form action={approvePackAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="opportunityId" value={opportunityId} />
                    <input type="hidden" name="packId" value={pack.id} />
                    <input
                      name="remarks"
                      placeholder="Approval remarks (optional)"
                      className="h-11 w-64 rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                    />
                    <ActionButton type="submit">Approve</ActionButton>
                  </form>
                ) : null}

                {String(pack.status) === "APPROVED" ? (
                  <form action={releasePackAction}>
                    <input type="hidden" name="opportunityId" value={opportunityId} />
                    <input type="hidden" name="packId" value={pack.id} />
                    <ActionButton type="submit">Release Pack</ActionButton>
                  </form>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-1">
            <SectionCard title="Add Document" description="Add compliance docs, generated docs, or manual links to the pack.">
              <form action={addPackItemAction} className="grid gap-3">
                <input type="hidden" name="opportunityId" value={opportunityId} />
                <input type="hidden" name="packId" value={pack.id} />
                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Source Type</label>
                  <select
                    name="sourceType"
                    defaultValue="COMPLIANCE_DOCUMENT"
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  >
                    <option value="COMPLIANCE_DOCUMENT">Compliance document</option>
                    <option value="GENERATED_DOCUMENT">Generated document</option>
                    <option value="MANUAL_URL">Manual URL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Compliance Document</label>
                  <select name="complianceDocumentId" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                    <option value="">(Select)</option>
                    {complianceDocs.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Generated Document</label>
                  <select name="generatedDocumentId" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                    <option value="">(Select)</option>
                    {generatedDocs.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.title} · v{d.versionNo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Manual URL</label>
                  <input
                    name="manualUrl"
                    placeholder="https://..."
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Title</label>
                  <input
                    name="title"
                    required
                    placeholder="e.g. BizSAFE Certificate"
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-900">Category (optional)</label>
                  <input
                    name="category"
                    placeholder="e.g. Compliance / Technical"
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <ActionButton type="submit">Add to Pack</ActionButton>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Approvals" description="Internal approval timeline for this submission pack.">
              {pack.approvals.length === 0 ? (
                <EmptyState title="No approvals yet" description="Request approval once the pack is complete." />
              ) : (
                <div className="space-y-2">
                  {pack.approvals.map((a: any) => (
                    <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-950">{a.approverName}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {String(a.status).replaceAll("_", " ")} · {formatDate(a.decidedAt ?? a.createdAt)}
                          </p>
                          {a.remarks ? <p className="mt-2 text-sm text-neutral-700">{a.remarks}</p> : null}
                        </div>
                        <StatusPill tone={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "danger" : "warning"}>{String(a.status)}</StatusPill>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </section>
      )}
    </main>
  );
}

