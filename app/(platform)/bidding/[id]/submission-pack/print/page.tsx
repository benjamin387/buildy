import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";

export const dynamic = "force-dynamic";

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (m?.[1]) return m[1];
  return html;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "long", day: "2-digit" }).format(value);
}

export default async function TenderPackPrintPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ packId?: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId } = await props.params;
  const { packId } = await props.searchParams;

  const pack = await safeQuery(
    () =>
      prisma.tenderSubmissionPack.findUnique({
        where: { id: String(packId ?? "") },
        include: {
          opportunity: { select: { id: true, opportunityNo: true, title: true, agency: true, closingDate: true } },
          items: { orderBy: [{ sortOrder: "asc" }], include: { complianceDocument: true, generatedDocument: true } },
        },
      }),
    null as any,
  );
  if (!pack || pack.opportunityId !== opportunityId) notFound();

  return (
    <div className="bg-white text-neutral-900 print:bg-white">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .page-break { break-before: page; page-break-before: always; }
        }
      `}</style>

      <div className="print-hide mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border border-slate-200 bg-stone-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Tender Submission Pack</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{pack.title}</h1>
          <p className="mt-2 text-sm text-neutral-700">
            Opportunity <span className="font-semibold">{pack.opportunity.opportunityNo}</span> · {pack.opportunity.agency} · Closing {formatDate(pack.opportunity.closingDate)}
          </p>
          <p className="mt-3 text-sm text-neutral-600">Print this page to PDF for a single combined pack. ZIP export is available from the pack builder.</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 pb-14">
        <div className="border-b border-slate-200 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Submission Pack</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">{pack.opportunity.title}</h2>
          <p className="mt-3 text-sm text-neutral-700">
            {pack.opportunity.agency} · Opportunity {pack.opportunity.opportunityNo} · Closing {formatDate(pack.opportunity.closingDate)}
          </p>
        </div>

        {pack.items.map((item: any, idx: number) => {
          const title = item.title || `Document ${idx + 1}`;
          const generatedHtml = item.generatedDocument?.contentHtml ? extractBody(item.generatedDocument.contentHtml) : null;
          return (
            <section key={item.id} className="page-break py-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    {String(item.sourceType).replaceAll("_", " ")} {item.category ? `· ${item.category}` : ""}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{title}</h3>
                </div>
                <p className="text-sm font-semibold text-neutral-500">#{item.sortOrder}</p>
              </div>

              {generatedHtml ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="p-0" dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                </div>
              ) : item.complianceDocument?.fileUrl ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-stone-50 p-5">
                  <p className="text-sm text-neutral-700">
                    External document link:{" "}
                    <a className="font-semibold text-neutral-900 underline" href={item.complianceDocument.fileUrl} target="_blank" rel="noreferrer">
                      {item.complianceDocument.fileUrl}
                    </a>
                  </p>
                </div>
              ) : item.manualUrl ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-stone-50 p-5">
                  <p className="text-sm text-neutral-700">
                    External link:{" "}
                    <a className="font-semibold text-neutral-900 underline" href={item.manualUrl} target="_blank" rel="noreferrer">
                      {item.manualUrl}
                    </a>
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-slate-200 bg-stone-50 p-5">
                  <p className="text-sm text-neutral-700">No preview available for this item.</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

