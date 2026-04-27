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
import { generateTenderDocumentAction } from "@/app/(platform)/bidding/tender-actions";
import { TenderGeneratedDocumentType } from "@prisma/client";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

const DOC_TYPES: Array<{ type: TenderGeneratedDocumentType; label: string; description: string }> = [
  { type: "COMPANY_PROFILE", label: "Company Profile", description: "Company overview and compliance summary." },
  { type: "METHOD_STATEMENT", label: "Method Statement", description: "Work approach, QC and coordination narrative." },
  { type: "ORGANISATION_CHART", label: "Organisation Chart", description: "Project team roles and responsibilities." },
  { type: "SAFETY_PLAN", label: "Safety Plan", description: "WSH controls and RA/SWP approach." },
  { type: "MANPOWER_PLAN", label: "Manpower Plan", description: "Phase-based manpower deployment baseline." },
  { type: "WORK_SCHEDULE", label: "Work Schedule", description: "Programme baseline and milestones narrative." },
  { type: "PROJECT_EXPERIENCE", label: "Project Experience", description: "Relevant portfolio and references summary." },
  { type: "DECLARATIONS_CHECKLIST", label: "Declarations Checklist", description: "Checklist of forms and declarations." },
  { type: "SUBMISSION_COVER_LETTER", label: "Submission Cover Letter", description: "Cover letter to agency with commercial snapshot." },
];

export default async function TenderDocumentGeneratorPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id: opportunityId },
        select: { id: true, opportunityNo: true, title: true, agency: true, procurementType: true, closingDate: true },
      }),
    null as any,
  );
  if (!opp) notFound();

  const latest = await safeQuery(
    () =>
      prisma.tenderGeneratedDocument.findMany({
        where: { opportunityId },
        orderBy: [{ createdAt: "desc" }],
        take: 80,
      }),
    [],
  );

  const latestByType = new Map<string, any>();
  for (const doc of latest) {
    if (!latestByType.has(String(doc.docType))) latestByType.set(String(doc.docType), doc);
  }

  return (
    <main className="space-y-6">
      <SectionCard title="Auto Document Generator" description="Generate structured tender documents from compliance profile, tender details, and approved costing.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-neutral-600">
              Opportunity <span className="font-semibold text-neutral-950">{opp.opportunityNo}</span> · {opp.agency} · Closing {formatDate(opp.closingDate)}
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-950">{opp.title}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/bidding/${opportunityId}/compliance`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
            >
              Compliance Pack
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

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Generate Documents" description="Each generation creates a new version. Use preview routes for print/PDF export.">
          <div className="space-y-3">
            {DOC_TYPES.map((d) => {
              const last = latestByType.get(String(d.type));
              return (
                <div key={d.type} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-950">{d.label}</p>
                      <p className="mt-1 text-sm text-neutral-600">{d.description}</p>
                      <p className="mt-2 text-xs text-neutral-500">
                        Latest: {last ? `v${last.versionNo} · ${formatDate(last.createdAt)}` : "Not generated yet"}
                      </p>
                      {last ? (
                        <Link
                          href={`/bidding/${opportunityId}/documents/generator/${last.id}`}
                          className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline"
                        >
                          Preview / Print
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {last ? <StatusPill tone="success">Generated</StatusPill> : <StatusPill tone="neutral">New</StatusPill>}
                      <form action={generateTenderDocumentAction}>
                        <input type="hidden" name="opportunityId" value={opportunityId} />
                        <input type="hidden" name="docType" value={d.type} />
                        <ActionButton type="submit" size="sm">
                          Generate
                        </ActionButton>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Generated History" description="Latest 10 generated documents for this opportunity.">
          {latest.length === 0 ? (
            <EmptyState title="No generated documents" description="Generate company profile, method statement and cover letter first." />
          ) : (
            <div className="space-y-2">
              {latest.slice(0, 10).map((doc: any) => (
                <Link
                  key={doc.id}
                  href={`/bidding/${opportunityId}/documents/generator/${doc.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">
                        {doc.title} · v{doc.versionNo}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">{String(doc.docType).replaceAll("_", " ")} · {formatDate(doc.createdAt)}</p>
                    </div>
                    <StatusPill tone="neutral">{String(doc.status).replaceAll("_", " ")}</StatusPill>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </section>
    </main>
  );
}

