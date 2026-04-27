import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContractSigningClient } from "@/app/(sign)/sign/contracts/[requestId]/[partyId]/sign-client";

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

type ScopeSnapshot = {
  sections?: Array<{
    title?: string;
    description?: string | null;
    subtotal?: number;
    lineItems?: Array<{
      sku?: string;
      description?: string;
      unit?: string;
      quantity?: number;
      unitPrice?: number;
      totalPrice?: number;
    }>;
  }>;
  totals?: {
    subtotal?: number;
    discountAmount?: number;
    netSubtotal?: number;
    gstAmount?: number;
    totalAmount?: number;
  };
  paymentTerms?: Array<{
    title?: string;
    percent?: number | null;
    amount?: number | null;
  }>;
};

export default async function ContractSigningPage({
  params,
}: {
  params: Promise<{ requestId: string; partyId: string }>;
}) {
  const { requestId, partyId } = await params;

  const signatureRequest = await prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: {
      parties: true,
      contract: true,
    },
  });
  if (!signatureRequest) notFound();

  const party = signatureRequest.parties.find((p) => p.id === partyId);
  if (!party) notFound();

  const contract = signatureRequest.contract;
  if (!contract) notFound();

  const scope = (contract.scopeSnapshot ?? null) as ScopeSnapshot | null;

  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-10 text-neutral-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <ContractSigningClient
          requestId={requestId}
          partyId={partyId}
          partyName={party.name}
          partyEmail={party.email}
          initialStatus={party.status}
          expiresAt={signatureRequest.expiresAt ? signatureRequest.expiresAt.toISOString() : null}
          contractNumber={contract.contractNumber}
        />

        <section className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Contract Preview
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                {contract.contractNumber}
              </h2>
              <p className="mt-2 text-sm text-neutral-700">
                Date: {formatDate(contract.contractDate)} · Client: {contract.clientNameSnapshot}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Contract Value</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatCurrency(Number(contract.contractValue || contract.totalAmount))}
              </p>
            </div>
          </header>

          {contract.termsText ? (
            <section className="mt-6">
              <h3 className="text-sm font-semibold text-neutral-950">Terms & Conditions</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                {contract.termsText}
              </p>
            </section>
          ) : null}

          <section className="mt-8 space-y-6">
            {(scope?.sections ?? []).map((section, idx) => (
              <div key={`${section.title ?? "section"}-${idx}`}>
                <div className="flex items-baseline justify-between gap-6 border-b border-neutral-200 pb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-950">
                      {section.title ?? `Section ${idx + 1}`}
                    </h3>
                    {section.description ? (
                      <p className="mt-1 text-sm text-neutral-600">{section.description}</p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-neutral-950">
                    {formatCurrency(section.subtotal ?? 0)}
                  </p>
                </div>

                <table className="mt-4 min-w-full text-sm">
                  <thead className="text-neutral-600">
                    <tr>
                      <th className="py-2 text-left font-medium">SKU</th>
                      <th className="py-2 text-left font-medium">Description</th>
                      <th className="py-2 text-right font-medium">Qty</th>
                      <th className="py-2 text-left font-medium">Unit</th>
                      <th className="py-2 text-right font-medium">Rate</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section.lineItems ?? []).map((item, itemIdx) => (
                      <tr key={`${item.description ?? "item"}-${itemIdx}`} className="border-t border-neutral-100">
                        <td className="py-2 pr-4 text-neutral-700">{item.sku || "-"}</td>
                        <td className="py-2 pr-4">{item.description ?? "-"}</td>
                        <td className="py-2 text-right">{item.quantity ?? 0}</td>
                        <td className="py-2 pl-4">{item.unit ?? "-"}</td>
                        <td className="py-2 text-right">{formatCurrency(item.unitPrice ?? 0)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(item.totalPrice ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <section className="mt-8 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Subtotal</span>
              <span className="font-medium text-neutral-900">
                {formatCurrency(scope?.totals?.subtotal ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Discount</span>
              <span className="font-medium text-neutral-900">
                {formatCurrency(scope?.totals?.discountAmount ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Net Subtotal</span>
              <span className="font-medium text-neutral-900">
                {formatCurrency(scope?.totals?.netSubtotal ?? Number(contract.contractSubtotal))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">GST</span>
              <span className="font-medium text-neutral-900">
                {formatCurrency(scope?.totals?.gstAmount ?? Number(contract.gstAmount))}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
              <span className="font-semibold text-neutral-900">Total</span>
              <span className="font-semibold text-neutral-900">
                {formatCurrency(scope?.totals?.totalAmount ?? Number(contract.totalAmount))}
              </span>
            </div>
          </section>

          {(scope?.paymentTerms ?? []).length > 0 ? (
            <section className="mt-8">
              <h3 className="text-sm font-semibold text-neutral-950">Payment Terms</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-neutral-600">
                    <tr>
                      <th className="py-2 text-left font-medium">Label</th>
                      <th className="py-2 text-right font-medium">%</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(scope?.paymentTerms ?? []).map((term, index) => (
                      <tr key={`${term.title ?? "term"}-${index}`} className="border-t border-neutral-100">
                        <td className="py-2 pr-4">{term.title ?? "-"}</td>
                        <td className="py-2 text-right">
                          {term.percent === null || term.percent === undefined
                            ? "-"
                            : `${Number(term.percent).toFixed(2)}%`}
                        </td>
                        <td className="py-2 text-right">
                          {term.amount === null || term.amount === undefined
                            ? "-"
                            : formatCurrency(Number(term.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

