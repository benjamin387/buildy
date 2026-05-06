import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { getProjectPermissions, requireUserId, requirePermission } from "@/lib/rbac";
import { updateQuotationCosts } from "@/app/(platform)/projects/[projectId]/quotation/[quotationId]/actions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { generateProposalFromQuotation } from "@/app/(platform)/proposals/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default async function ProjectQuotationDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; quotationId: string }>;
}) {
  const { projectId, quotationId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const userId = await requireUserId();
  const permissions = await getProjectPermissions({ userId, projectId });
  const canWrite = permissions.has(Permission.QUOTE_WRITE);

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      proposal: {
        select: {
          id: true,
        },
      },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
      project: { include: { client: true } },
    },
  });

  if (!quotation || quotation.projectId !== projectId) notFound();

  const isDraft = quotation.status === "DRAFT";

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/quotation`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              {quotation.status}
            </span>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              V{quotation.version}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Quotation Detail
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {quotation.quotationNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Issue {formatDate(quotation.issueDate)} · {quotation.projectNameSnapshot} ·{" "}
            {quotation.clientNameSnapshot}
          </p>
        </div>

        <div className="grid gap-2 rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Subtotal</p>
            <p className="text-xl font-semibold">{formatCurrency(Number(quotation.subtotal))}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">GST</p>
            <p className="text-xl font-semibold">{formatCurrency(Number(quotation.gstAmount))}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
            <p className="text-xl font-semibold">{formatCurrency(Number(quotation.totalAmount))}</p>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Profit</p>
            <p className="text-xl font-semibold">{formatCurrency(Number(quotation.profitAmount))}</p>
          </div>
          <p className="text-xs text-neutral-300">
            Margin {formatPct(Number(quotation.marginPercent))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {canWrite ? (
          <form action={generateProposalFromQuotation.bind(null, quotationId)}>
            <PendingSubmitButton
              pendingText={quotation.proposal ? "Refreshing..." : "Generating..."}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quotation.proposal ? "Regenerate Proposal" : "Generate Proposal"}
            </PendingSubmitButton>
          </form>
        ) : null}
        {quotation.proposal ? (
          <Link
            href={`/proposals/${quotation.proposal.id}`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            View Proposal
          </Link>
        ) : null}
        <Link
          href={`/projects/${projectId}/quotation/${quotationId}/print`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Print / Save as PDF
        </Link>
      </div>

      <form action={updateQuotationCosts} className="space-y-6">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="quotationId" value={quotationId} />

        {quotation.sections.map((section) => (
          <section
            key={section.id}
            className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">{section.title}</h2>
                {section.description ? (
                  <p className="mt-1 text-sm text-neutral-600">{section.description}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                  Section Subtotal
                </p>
                <p className="mt-1 text-lg font-semibold text-neutral-950">
                  {formatCurrency(Number(section.subtotal))}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-800">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">SKU</th>
                    <th className="px-3 py-3 text-left font-semibold">Description</th>
                    <th className="px-3 py-3 text-left font-semibold">Unit</th>
                    <th className="px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                    <th className="px-3 py-3 text-right font-semibold">Cost Price</th>
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                    <th className="px-3 py-3 text-right font-semibold">Cost</th>
                    <th className="px-3 py-3 text-right font-semibold">Profit</th>
                    <th className="px-3 py-3 text-right font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {section.lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-neutral-200">
                      <td className="px-3 py-3 text-neutral-700">{item.sku || "-"}</td>
                      <td className="px-3 py-3 text-neutral-900">{item.description}</td>
                      <td className="px-3 py-3 text-neutral-700">{item.unit}</td>
                      <td className="px-3 py-3 text-right text-neutral-700">{Number(item.quantity)}</td>
                      <td className="px-3 py-3 text-right">
                        {canWrite && isDraft ? (
                          <input
                            name={`unitPrice_${item.id}`}
                            type="number"
                            step="0.01"
                            min={0}
                            defaultValue={Number(item.unitPrice)}
                            className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                          />
                        ) : (
                          <span className="text-neutral-900">
                            {formatCurrency(Number(item.unitPrice))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {canWrite && isDraft ? (
                          <input
                            name={`costPrice_${item.id}`}
                            type="number"
                            step="0.01"
                            min={0}
                            defaultValue={Number(item.costPrice)}
                            className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                          />
                        ) : (
                          <span className="text-neutral-900">
                            {formatCurrency(Number(item.costPrice))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-neutral-950">
                        {formatCurrency(Number(item.totalPrice))}
                      </td>
                      <td className="px-3 py-3 text-right text-neutral-900">
                        {formatCurrency(Number(item.totalCost))}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-neutral-950">
                        {formatCurrency(Number(item.profit))}
                      </td>
                      <td className="px-3 py-3 text-right text-neutral-900">
                        {formatPct(Number(item.marginPercent))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {canWrite && isDraft ? (
          <div className="flex items-center justify-end">
            <button className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Changes
            </button>
          </div>
        ) : null}
      </form>
    </main>
  );
}
