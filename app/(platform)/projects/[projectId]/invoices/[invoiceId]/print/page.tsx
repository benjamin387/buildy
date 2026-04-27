import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { getCompanyBranding } from "@/lib/branding";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ projectId: string; invoiceId: string }>;
}) {
  const { projectId, invoiceId } = await params;
  await requirePermission({ permission: Permission.INVOICE_READ, projectId });

  const branding = await getCompanyBranding();

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      project: { include: { client: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      receipts: true,
    },
  });
  if (!invoice || invoice.projectId !== projectId) notFound();

  const paid = invoice.receipts.reduce((sum, r) => sum + Number(r.amount), 0);

  const fromAddress = branding.registeredAddress || "Singapore";
  const paymentInstructions =
    branding.paymentInstructions?.trim()
      ? branding.paymentInstructions.trim()
      : [
          branding.bankName ? `Bank: ${branding.bankName}` : null,
          branding.bankAccountName ? `Account name: ${branding.bankAccountName}` : null,
          branding.bankAccountNumber ? `Account no.: ${branding.bankAccountNumber}` : null,
          branding.paynowUen ? `PayNow UEN: ${branding.paynowUen}` : null,
          "Please include the invoice number as reference.",
        ]
          .filter(Boolean)
          .join("\n");

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
          href={`/projects/${projectId}/invoices/${invoiceId}`}
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
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
              Tax Invoice
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {invoice.invoiceNumber}
            </h1>
            <p className="mt-2 text-sm text-neutral-700">
              Issue date: {formatDate(invoice.issueDate)} · Due date:{" "}
              {formatDate(invoice.dueDate)}
            </p>
            <p className="mt-2 text-sm text-neutral-700">
              Type: {invoice.invoiceType} · Status: {invoice.status}
            </p>
          </div>

          <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-sm sm:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatCurrency(Number(invoice.totalAmount))}
            </p>
            <p className="mt-1 text-xs text-neutral-300">
              Paid {formatCurrency(paid)} · Outstanding{" "}
              {formatCurrency(Number(invoice.outstandingAmount))}
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              From
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">{branding.legalName ?? branding.companyName}</p>
            <p className="mt-1 text-sm text-neutral-700">{fromAddress}</p>
            {branding.uen ? <p className="mt-1 text-sm text-neutral-700">UEN: {branding.uen}</p> : null}
            {branding.contactPhone ? <p className="mt-1 text-sm text-neutral-700">{branding.contactPhone}</p> : null}
            {branding.contactEmail ? <p className="mt-1 text-sm text-neutral-700">{branding.contactEmail}</p> : null}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Bill To
            </p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">
              {invoice.project.client.name}
            </p>
            {invoice.project.client.email ? (
              <p className="mt-1 text-sm text-neutral-700">{invoice.project.client.email}</p>
            ) : null}
            {invoice.project.client.phone ? (
              <p className="mt-1 text-sm text-neutral-700">{invoice.project.client.phone}</p>
            ) : null}
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
            Project
          </p>
          <p className="mt-2 text-sm font-semibold text-neutral-900">{invoice.project.name}</p>
          <p className="mt-1 text-sm text-neutral-700">
            {invoice.project.addressLine1}
            {invoice.project.addressLine2 ? `, ${invoice.project.addressLine2}` : ""}
            {invoice.project.postalCode ? ` ${invoice.project.postalCode}` : ""}
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-neutral-950">Line Items</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">SKU</th>
                  <th className="px-3 py-3 text-left font-semibold">Description</th>
                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="px-3 py-3 text-left font-semibold">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold">Unit Price</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 text-neutral-700">{item.sku ?? "-"}</td>
                    <td className="px-3 py-3 text-neutral-900">{item.description}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {Number(item.quantity)}
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{item.unit}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {formatCurrency(Number(item.unitPrice))}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-900">
                      {formatCurrency(Number(item.lineAmount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-medium text-neutral-900">
              {formatCurrency(Number(invoice.subtotal))}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Discount</span>
            <span className="font-medium text-neutral-900">
              {formatCurrency(Number(invoice.discountAmount))}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">GST</span>
            <span className="font-medium text-neutral-900">
              {formatCurrency(Number(invoice.taxAmount))}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="font-semibold text-neutral-900">
              {formatCurrency(Number(invoice.totalAmount))}
            </span>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Payment Instructions
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
              {paymentInstructions}
            </p>
          </div>

          {invoice.notes ? (
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                {invoice.notes}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
