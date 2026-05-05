import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";
import { computeComplianceRisks } from "@/lib/bidding/compliance-service";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { initTenderRequirementsAction, updateTenderRequirementAction } from "@/app/(platform)/bidding/tender-actions";
import { TenderRequirementStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function statusTone(status: TenderRequirementStatus) {
  if (status === "PROVIDED") return "success";
  if (status === "WAIVED" || status === "NOT_APPLICABLE") return "neutral";
  return "warning";
}

function riskTone(sev: string) {
  if (sev === "CRITICAL") return "danger";
  if (sev === "HIGH") return "warning";
  if (sev === "MEDIUM") return "info";
  return "neutral";
}

export default async function BidCompliancePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId } = await props.params;
  const nowMs = new Date().getTime();

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id: opportunityId },
        select: {
          id: true,
          opportunityNo: true,
          title: true,
          agency: true,
          procurementType: true,
          closingDate: true,
          approvedCostVersionId: true,
          costingLockedAt: true,
        },
      }),
    null as any,
  );
  if (!opp) notFound();

  const [requirements, risks, complianceDocs, generatedDocs] = await Promise.all([
    safeQuery(
      () =>
        prisma.tenderDocumentRequirement.findMany({
          where: { opportunityId },
          orderBy: [{ isMandatory: "desc" }, { status: "asc" }, { createdAt: "asc" }],
        }),
      [],
    ),
    safeQuery(() => computeComplianceRisks(opportunityId), []),
    safeQuery(
      () =>
        prisma.complianceDocument.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
          take: 50,
        }),
      [],
    ),
    safeQuery(
      () =>
        prisma.tenderGeneratedDocument.findMany({
          where: { opportunityId },
          orderBy: [{ createdAt: "desc" }],
          take: 50,
        }),
      [],
    ),
  ]);

  const mandatoryCount = requirements.filter((r: any) => r.isMandatory).length;
  const providedMandatory = requirements.filter((r: any) => r.isMandatory && r.status === "PROVIDED").length;
  const progress = mandatoryCount > 0 ? Math.round((providedMandatory / mandatoryCount) * 100) : 0;

  return (
    <main className="space-y-6">
      <SectionCard
        title="Compliance Pack"
        description="Track mandatory tender documents, expiry risks, and readiness before submission. Submission remains manual on GeBIZ."
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={progress >= 90 ? "success" : progress >= 60 ? "info" : "warning"}>{progress}% Ready</StatusPill>
          <p className="text-sm text-neutral-600">
            Mandatory provided: <span className="font-semibold text-neutral-950 tabular-nums">{providedMandatory}</span> /{" "}
            <span className="font-semibold text-neutral-950 tabular-nums">{mandatoryCount}</span>
          </p>
          <p className="text-sm text-neutral-600">
            Closing: <span className="font-semibold text-neutral-950">{formatDate(opp.closingDate)}</span>
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link
              href={`/bidding/${opportunityId}/documents/generator`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
            >
              Auto Document Generator
            </Link>
            <Link
              href={`/bidding/${opportunityId}/submission-pack`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
            >
              Submission Pack Builder
            </Link>
          </div>
        </div>
      </SectionCard>

      {risks.length ? (
        <SectionCard title="Risk Control" description="Warnings are generated from company compliance profile, document expiry dates, closing date risk, and cost approval status.">
          <div className="space-y-2">
            {risks.map((r: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-950">{r.title}</p>
                  <p className="mt-1 text-sm text-neutral-600">{r.description}</p>
                </div>
                <StatusPill tone={riskTone(String(r.severity))}>{String(r.severity)}</StatusPill>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Tender Submission Checklist" description="Maintain mandatory and optional document readiness.">
            {requirements.length === 0 ? (
              <div className="space-y-4">
                <EmptyState title="Checklist not initialized" description="Generate a default checklist based on tender type, then link documents and mark status." />
                <form action={initTenderRequirementsAction} className="flex justify-end">
                  <input type="hidden" name="opportunityId" value={opportunityId} />
                  <ActionButton type="submit">Initialize Checklist</ActionButton>
                </form>
              </div>
            ) : (
              <div className="space-y-3">
                {requirements.map((r: any) => (
                  <details key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-950">
                          {r.title}{" "}
                          {r.isMandatory ? <span className="ml-2 text-xs font-semibold text-rose-700">Mandatory</span> : <span className="ml-2 text-xs font-semibold text-neutral-500">Optional</span>}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Category: {r.category ?? "-"} · Due: {formatDate(r.dueDate)}
                        </p>
                        {r.satisfiedAt ? <p className="mt-1 text-xs text-neutral-500">Satisfied: {formatDate(r.satisfiedAt)}</p> : null}
                      </div>
                      <StatusPill tone={statusTone(r.status)}>{String(r.status).replaceAll("_", " ")}</StatusPill>
                    </summary>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <form action={updateTenderRequirementAction} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                        <input type="hidden" name="opportunityId" value={opportunityId} />
                        <input type="hidden" name="requirementId" value={r.id} />

                        <div>
                          <label className="block text-sm font-semibold text-neutral-900">Status</label>
                          <select
                            name="status"
                            defaultValue={r.status}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                          >
                            <option value="PENDING">Pending</option>
                            <option value="PROVIDED">Provided</option>
                            <option value="WAIVED">Waived</option>
                            <option value="NOT_APPLICABLE">Not applicable</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-neutral-900">Link Compliance Document</label>
                          <select
                            name="complianceDocumentId"
                            defaultValue={r.complianceDocumentId ?? ""}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                          >
                            <option value="">(None)</option>
                            {complianceDocs.map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.title} {d.expiryDate ? `· Exp ${formatDate(d.expiryDate)}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-neutral-900">Link Generated Document</label>
                          <select
                            name="generatedDocumentId"
                            defaultValue={r.generatedDocumentId ?? ""}
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                          >
                            <option value="">(None)</option>
                            {generatedDocs.map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.title} · v{d.versionNo}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-neutral-900">External URL (optional)</label>
                          <input
                            name="satisfiedByUrl"
                            defaultValue={r.satisfiedByUrl ?? ""}
                            placeholder="https://..."
                            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-sm font-semibold text-neutral-900">Notes</label>
                          <textarea
                            name="notes"
                            defaultValue={r.notes ?? ""}
                            className="mt-1 h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                            placeholder="Clarifications, where this doc is located, exceptions..."
                          />
                        </div>

                        <div className="sm:col-span-2 flex justify-end">
                          <ActionButton type="submit" size="sm">
                            Save
                          </ActionButton>
                        </div>
                      </form>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-1">
          <SectionCard title="Compliance Library Snapshot" description="Global document library used across tenders. Manage in Settings → Document Library.">
            {complianceDocs.length === 0 ? (
              <EmptyState title="No compliance documents" description="Add BizSAFE, insurance and track record docs into the document library." />
            ) : (
              <div className="space-y-2">
                {complianceDocs.slice(0, 12).map((d: any) => {
                  const exp = d.expiryDate ? new Date(d.expiryDate) : null;
                  const expSoon = exp && exp.getTime() < nowMs + 30 * 24 * 60 * 60 * 1000;
                  return (
                    <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-neutral-950">{d.title}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            {String(d.category).replaceAll("_", " ")} · Expiry: {formatDate(d.expiryDate)}
                          </p>
                          {d.fileUrl ? (
                            <a href={d.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline">
                              Open file
                            </a>
                          ) : null}
                        </div>
                        <StatusPill tone={expSoon ? "warning" : "neutral"}>{expSoon ? "EXPIRY" : "OK"}</StatusPill>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2">
                  <Link
                    href="/settings/document-library"
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
                  >
                    Open Document Library
                  </Link>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </section>
    </main>
  );
}
