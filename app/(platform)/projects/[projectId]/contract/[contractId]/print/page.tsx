import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getCompanyBranding } from "@/lib/branding";

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

type ContractScopeSnapshot = {
  quotation?: { quotationNumber?: string; version?: number };
  sections?: Array<{
    title?: string;
    description?: string | null;
    subtotal?: number;
    lineItems?: Array<{
      sku?: string | null;
      description?: string;
      unit?: string | null;
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
    triggerType?: string | null;
    dueDays?: number | null;
  }>;
};

export default async function PrintContractPage({
  params,
}: {
  params: Promise<{ projectId: string; contractId: string }>;
}) {
  const { projectId, contractId } = await params;
  await requirePermission({ permission: Permission.CONTRACT_READ, projectId });

  const branding = await getCompanyBranding();

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { quotation: true, clauses: { orderBy: { sortOrder: "asc" } } },
  });
  if (!contract || contract.projectId !== projectId) notFound();

  const scope = (contract.scopeSnapshot ?? null) as ContractScopeSnapshot | null;
  const sections = scope?.sections ?? [];
  const paymentTerms = scope?.paymentTerms ?? [];
  const sourceQuotationLabel = scope?.quotation?.quotationNumber
    ? `${scope.quotation.quotationNumber}${scope.quotation.version ? ` v${scope.quotation.version}` : ""}`
    : contract.quotation?.quotationNumber ?? null;

  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-10 text-neutral-900 print:bg-white print:px-0 print:py-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            .no-print { display: none !important; }
            .page { box-shadow: none !important; border: none !important; border-radius: 0 !important; }
          }
        `,
        }}
      />

      <div className="no-print mx-auto mb-6 flex max-w-4xl items-center justify-between">
        <Link
          href={`/projects/${projectId}/contract/${contractId}`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Print (Save as PDF)
        </button>
      </div>

      <div className="page mx-auto max-w-4xl rounded-2xl border border-neutral-200 bg-white p-10 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-8 print:shadow-none">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Job Contract
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {contract.contractNumber}
            </h1>
            <p className="mt-2 text-sm text-neutral-700">
              Date: {formatDate(contract.contractDate)}
              {sourceQuotationLabel ? ` · Source: ${sourceQuotationLabel}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              Contract Value
            </p>
            <p className="mt-1 text-2xl font-semibold text-neutral-950">
              {formatCurrency(Number(contract.totalAmount))}
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Company
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">
              {branding.legalName ?? branding.companyName}
            </p>
            {branding.uen ? (
              <p className="mt-1 text-sm text-neutral-700">UEN: {branding.uen}</p>
            ) : null}
            {branding.registeredAddress ? (
              <p className="mt-1 text-sm text-neutral-700">{branding.registeredAddress}</p>
            ) : null}
            <p className="mt-1 text-sm text-neutral-700">{branding.contactEmail}</p>
            <p className="mt-1 text-sm text-neutral-700">{branding.contactPhone}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Client
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">
              {contract.clientNameSnapshot}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Project
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">
              {contract.projectNameSnapshot}
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              {contract.projectAddress1}
              {contract.projectAddress2 ? `, ${contract.projectAddress2}` : ""}
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              {contract.projectPostalCode ?? ""}
            </p>
          </div>
        </section>

        {contract.clauses.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-neutral-950">Clauses</h2>
            <div className="mt-4 space-y-6 text-sm text-neutral-700">
              {contract.clauses.map((clause, idx) => (
                <div key={clause.id} className="break-inside-avoid">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    {idx + 1}. {clause.title}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap leading-6">{clause.content}</p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-10 space-y-6 text-sm text-neutral-700">
            <Block title="Scope of Work" value={contract.scopeOfWork} />
            <Block title="Payment Terms" value={contract.paymentTerms} />
            <Block title="Warranty" value={contract.warrantyTerms} />
            <Block title="Variation Orders" value={contract.variationPolicy} />
            <Block title="Defects / Handover" value={contract.defectsPolicy} />
            <Block title="Insurance" value={contract.insurancePolicy} />
          </section>
        )}

        {sections.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-neutral-950">Scope (Snapshot)</h2>
            <div className="mt-4 space-y-6">
              {sections.map((section, index) => (
                <div key={`${section.title ?? "section"}-${index}`} className="rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-baseline justify-between gap-6">
                    <div>
                      <p className="text-sm font-semibold text-neutral-950">
                        {section.title ?? `Section ${index + 1}`}
                      </p>
                      {section.description ? (
                        <p className="mt-1 text-sm text-neutral-600">{section.description}</p>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-neutral-950">
                      {formatCurrency(section.subtotal ?? 0)}
                    </p>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-neutral-100 text-neutral-800">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">SKU</th>
                          <th className="px-3 py-2 text-left font-semibold">Description</th>
                          <th className="px-3 py-2 text-right font-semibold">Qty</th>
                          <th className="px-3 py-2 text-left font-semibold">Unit</th>
                          <th className="px-3 py-2 text-right font-semibold">Rate</th>
                          <th className="px-3 py-2 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(section.lineItems ?? []).map((item, idx) => (
                          <tr key={`${item.description ?? "item"}-${idx}`} className="border-t border-neutral-200">
                            <td className="px-3 py-2 text-neutral-700">{item.sku ?? "-"}</td>
                            <td className="px-3 py-2 text-neutral-900">{item.description ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-neutral-900">{item.quantity ?? 0}</td>
                            <td className="px-3 py-2 text-neutral-700">{item.unit ?? "-"}</td>
                            <td className="px-3 py-2 text-right text-neutral-900">{formatCurrency(item.unitPrice ?? 0)}</td>
                            <td className="px-3 py-2 text-right font-medium text-neutral-900">{formatCurrency(item.totalPrice ?? 0)}</td>
                          </tr>
                        ))}
                        {(section.lineItems ?? []).length === 0 ? (
                          <tr className="border-t border-neutral-200">
                            <td colSpan={6} className="px-3 py-3 text-sm text-neutral-600">
                              No line items captured in snapshot.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {paymentTerms.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-neutral-950">Payment Schedule (Snapshot)</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-neutral-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Label</th>
                    <th className="px-3 py-2 text-right font-semibold">%</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 text-left font-semibold">Trigger</th>
                    <th className="px-3 py-2 text-right font-semibold">Due Days</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTerms.map((term, idx) => (
                    <tr key={`${term.title ?? "term"}-${idx}`} className="border-t border-neutral-200">
                      <td className="px-3 py-2 font-medium text-neutral-900">{term.title ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-neutral-900">
                        {term.percent === null || term.percent === undefined ? "-" : `${Number(term.percent).toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-2 text-right text-neutral-900">
                        {term.amount === null || term.amount === undefined ? "-" : formatCurrency(Number(term.amount))}
                      </td>
                      <td className="px-3 py-2 text-neutral-700">{term.triggerType ?? "-"}</td>
                      <td className="px-3 py-2 text-right text-neutral-900">
                        {term.dueDays === null || term.dueDays === undefined ? "-" : term.dueDays}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="mt-10 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Contract Subtotal</span>
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

        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Client Signature
            </p>
            <div className="mt-10 border-t border-neutral-200 pt-2 text-sm text-neutral-700">
              Signature / Name / Date
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Company Signature
            </p>
            <div className="mt-10 border-t border-neutral-200 pt-2 text-sm text-neutral-700">
              Signature / Name / Date
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Block(props: { title: string; value: string | null | undefined }) {
  if (!props.value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-6">{props.value}</p>
    </div>
  );
}
