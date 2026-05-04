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

export default async function PrintQuotationPage({
  params,
}: {
  params: Promise<{ projectId: string; quotationId: string }>;
}) {
  const { projectId, quotationId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const branding = await getCompanyBranding();

  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      paymentTermsV2: { orderBy: { sortOrder: "asc" } },
      sections: {
        include: { lineItems: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!quotation || quotation.projectId !== projectId) notFound();

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
          href={`/projects/${projectId}/quotations/${quotationId}`}
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
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="h-10 w-auto max-w-[180px] object-contain"
                />
              ) : (
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-xs font-bold text-white">
                  {branding.companyName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-950">{branding.companyName}</p>
                <p className="text-xs text-neutral-500">{branding.website}</p>
              </div>
            </div>

            <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Renovation Quotation
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {quotation.quotationNumber}
            </h1>
            <p className="mt-2 text-sm text-neutral-700">
              Date: {formatDate(quotation.issueDate)} · Validity: {quotation.validityDays ?? 14}{" "}
              days
            </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Total Amount</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-950">
              {formatCurrency(Number(quotation.totalAmount))}
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              From
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">
              {branding.legalName ?? branding.companyName}
            </p>
            {branding.uen ? <p className="mt-1 text-sm text-neutral-700">UEN: {branding.uen}</p> : null}
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
            <p className="mt-2 text-sm font-semibold text-neutral-900">{quotation.clientNameSnapshot}</p>
            <p className="mt-1 text-sm text-neutral-700">{quotation.contactPersonSnapshot ?? ""}</p>
            <p className="mt-1 text-sm text-neutral-700">{quotation.contactPhoneSnapshot ?? ""}</p>
            <p className="mt-1 text-sm text-neutral-700">{quotation.contactEmailSnapshot ?? ""}</p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Project
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">{quotation.projectNameSnapshot}</p>
            <p className="mt-1 text-sm text-neutral-700">
              {quotation.projectAddress1}
              {quotation.projectAddress2 ? `, ${quotation.projectAddress2}` : ""}
            </p>
            <p className="mt-1 text-sm text-neutral-700">{quotation.projectPostalCode ?? ""}</p>
          </div>
        </section>

        <section className="mt-10 space-y-8">
          {quotation.sections.map((section) => (
            <div key={section.id}>
              <div className="flex items-baseline justify-between gap-6 border-b border-neutral-200 pb-2">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-950">{section.title}</h2>
                  {section.description ? (
                    <p className="mt-1 text-sm text-neutral-600">{section.description}</p>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-neutral-950">
                  {formatCurrency(Number(section.subtotal))}
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
                  {section.lineItems.map((item) => (
                    <tr key={item.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-4 text-neutral-700">{item.sku || "-"}</td>
                      <td className="py-2 pr-4">{item.description}</td>
                      <td className="py-2 text-right">{Number(item.quantity)}</td>
                      <td className="py-2 pl-4">{item.unit}</td>
                      <td className="py-2 text-right">{formatCurrency(Number(item.unitPrice))}</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(Number(item.totalPrice))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="mt-10 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(quotation.subtotal))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Discount</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(quotation.discountAmount))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">GST</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(quotation.gstAmount))}</span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(Number(quotation.totalAmount))}</span>
          </div>
        </section>

        {quotation.paymentTermsV2.length > 0 ? (
          <section className="mt-8">
            <h3 className="text-sm font-semibold text-neutral-950">Payment Terms</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-neutral-600">
                  <tr>
                    <th className="py-2 text-left font-medium">Label</th>
                    <th className="py-2 text-right font-medium">%</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                    <th className="py-2 text-left font-medium">Trigger</th>
                    <th className="py-2 text-right font-medium">Due Days</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.paymentTermsV2.map((term) => (
                    <tr key={term.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-4">{term.title}</td>
                      <td className="py-2 text-right">
                        {term.percent === null ? "-" : `${Number(term.percent).toFixed(2)}%`}
                      </td>
                      <td className="py-2 text-right">
                        {term.amount === null ? "-" : formatCurrency(Number(term.amount))}
                      </td>
                      <td className="py-2 pl-4">{term.triggerType ?? "-"}</td>
                      <td className="py-2 text-right">{term.dueDays === null ? "-" : term.dueDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : quotation.paymentTerms ? (
          <section className="mt-8">
            <h3 className="text-sm font-semibold text-neutral-950">Payment Terms</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{quotation.paymentTerms}</p>
          </section>
        ) : null}

        {quotation.exclusions ? (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-neutral-950">Exclusions</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{quotation.exclusions}</p>
          </section>
        ) : null}

        {quotation.notes ? (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-neutral-950">Notes</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{quotation.notes}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
