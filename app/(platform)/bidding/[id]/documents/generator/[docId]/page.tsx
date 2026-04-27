import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";

export const dynamic = "force-dynamic";

export default async function TenderGeneratedDocPreviewPage(props: { params: Promise<{ id: string; docId: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId, docId } = await props.params;

  const doc = await safeQuery(
    () =>
      prisma.tenderGeneratedDocument.findUnique({
        where: { id: docId },
        include: { opportunity: { select: { id: true, opportunityNo: true, title: true } } },
      }),
    null as any,
  );
  if (!doc || doc.opportunityId !== opportunityId) notFound();

  return (
    <main className="space-y-6">
      <SectionCard title="Generated Document Preview" description="Use browser print to export PDF. Sidebar/topbar are hidden in print mode.">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-950">
              {doc.title} · v{doc.versionNo}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              Opportunity <span className="font-semibold text-neutral-950">{doc.opportunity.opportunityNo}</span> · {doc.opportunity.title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral">{String(doc.docType).replaceAll("_", " ")}</StatusPill>
            <Link
              href={`/bidding/${opportunityId}/documents/generator`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
            >
              Back
            </Link>
            <span className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm print:hidden">
              Print: Ctrl/Cmd+P
            </span>
          </div>
        </div>
      </SectionCard>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
        <div className="p-0 print:p-0" dangerouslySetInnerHTML={{ __html: doc.contentHtml }} />
      </div>
    </main>
  );
}
