import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPortalProject } from "@/lib/client-portal/auth";
import { acceptQuotationAction, rejectQuotationAction } from "@/app/client/portal/projects/[projectId]/quotation/actions";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function ClientPortalQuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requireClientPortalProject({ projectId });

  const sp = await searchParams;
  const statusToast = typeof sp.status === "string" ? sp.status : "";

  const quotation = await prisma.quotation.findFirst({
    where: { projectId, status: { in: ["SENT", "APPROVED"] }, isLatest: true },
    orderBy: [{ createdAt: "desc" }],
    include: { paymentTermsV2: { orderBy: { sortOrder: "asc" } } },
  });

  if (!quotation) {
    return (
      <main className="space-y-6">
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Quotation</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">No quotation available</h2>
          <p className="mt-2 text-sm text-neutral-600">
            Your project team has not sent a quotation yet.
          </p>
        </section>
      </main>
    );
  }

  const canRespond = quotation.status === "SENT";

  return (
    <main className="space-y-6">
      {statusToast ? (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {statusToast === "accepted" ? "Quotation accepted. Thank you." : null}
          {statusToast === "rejected" ? "Quotation rejected. Your remarks have been sent to the team." : null}
        </section>
      ) : null}

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Quotation</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
              {quotation.quotationNumber} <span className="text-neutral-400">· V{quotation.version}</span>
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Status: <span className="font-semibold text-neutral-900">{quotation.status}</span> · Issue {formatDate(quotation.issueDate)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Total (incl. GST)</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-950">{formatCurrency(Number(quotation.totalAmount))}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Payment Terms</p>
            {quotation.paymentTermsV2.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-700">No staged payment terms provided.</p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-100 text-neutral-800">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold">Stage</th>
                      <th className="px-3 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotation.paymentTermsV2.map((t) => (
                      <tr key={t.id} className="border-t border-neutral-200">
                        <td className="px-3 py-3 text-neutral-900">{t.title}</td>
                        <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                          {t.amount === null ? "-" : formatCurrency(Number(t.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Your Response</p>
            {canRespond ? (
              <div className="mt-3 space-y-3">
                <form action={acceptQuotationAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="quotationId" value={quotation.id} />
                  <button className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                    Accept Quotation
                  </button>
                </form>

                <form action={rejectQuotationAction} className="space-y-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="quotationId" value={quotation.id} />
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-neutral-800">Rejection remarks</span>
                    <textarea
                      name="remarks"
                      required
                      rows={4}
                      className="rounded-xl border border-neutral-300 bg-white p-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                      placeholder="Please tell us what you would like to change."
                    />
                  </label>
                  <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                    Reject Quotation
                  </button>
                </form>
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-700">
                This quotation is already {quotation.status.toLowerCase()}.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

