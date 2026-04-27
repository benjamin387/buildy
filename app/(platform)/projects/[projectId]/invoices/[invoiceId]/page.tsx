import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountingProvider, AccountingSyncEntityType, InvoiceStatus, Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getInvoiceById } from "@/lib/invoices/service";
import { prisma } from "@/lib/prisma";
import { InvoiceStatusBadge } from "@/app/(platform)/projects/[projectId]/invoices/components/invoice-status-badge";
import {
  createCreditNoteAction,
  recordPaymentReceiptAction,
  setInvoiceStatusAction,
  syncInvoiceToXeroAction,
} from "@/app/(platform)/projects/[projectId]/invoices/actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
import { ClientDeliveryActions } from "@/app/(platform)/components/client-delivery-actions";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";

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

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, invoiceId } = await params;
  const { permissions } = await requirePermission({ permission: Permission.INVOICE_READ, projectId });
  const canSyncAccounting = permissions.has(Permission.SETTINGS_WRITE);

  const invoice = await getInvoiceById({ projectId, invoiceId });
  if (!invoice) notFound();

  const canEdit = invoice.status === "DRAFT";
  const isLocked = invoice.status === "PAID" || invoice.status === "VOID";

  const receiptTotal = invoice.receipts.reduce((sum, r) => sum + Number(r.amount), 0);
  const sp = await searchParams;
  const deliveryToken = typeof sp.deliveryToken === "string" ? sp.deliveryToken : null;
  const lastSync = canSyncAccounting
    ? await prisma.accountingSyncLog.findFirst({
        where: {
          provider: AccountingProvider.XERO,
          entityType: AccountingSyncEntityType.INVOICE,
          internalId: invoiceId,
        },
        orderBy: [{ syncedAt: "desc" }],
      })
    : null;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/invoices`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <InvoiceStatusBadge status={invoice.status} />
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {invoice.invoiceType}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Invoice
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {invoice.invoiceNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Issue: {formatDate(invoice.issueDate)} · Due: {formatDate(invoice.dueDate)} · Project:{" "}
            {invoice.project.name}
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Outstanding</p>
          <p className="mt-1 text-3xl font-semibold">
            {formatCurrency(Number(invoice.outstandingAmount))}
          </p>
          <p className="mt-1 text-xs text-neutral-300">
            Total {formatCurrency(Number(invoice.totalAmount))} · Collected{" "}
            {formatCurrency(receiptTotal)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/projects/${projectId}/invoices/${invoiceId}/print`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Print / Save as PDF
        </Link>
        {canEdit ? (
          <Link
            href={`/projects/${projectId}/invoices/${invoiceId}/edit`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Edit Draft
          </Link>
        ) : null}

        {!isLocked && invoice.status === "DRAFT" ? (
          <form action={setInvoiceStatusAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="status" value={InvoiceStatus.SENT} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Mark Sent
            </button>
          </form>
        ) : null}
        {!isLocked && invoice.status === "SENT" ? (
          <form action={setInvoiceStatusAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="status" value={InvoiceStatus.VIEWED} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Mark Viewed
            </button>
          </form>
        ) : null}
      </div>

      <ClientDeliveryActions
        returnTo={`/projects/${projectId}/invoices/${invoiceId}`}
        projectId={projectId}
        documentType="INVOICE"
        documentId={invoiceId}
        deliveryToken={deliveryToken}
      />

      <MessagingPanel
        returnTo={`/projects/${projectId}/invoices/${invoiceId}`}
        projectId={projectId}
        relatedType="INVOICE"
        relatedId={invoiceId}
        documentType="INVOICE"
        documentId={invoiceId}
        defaultRecipientName={
          invoice.project.clientName || invoice.project.client?.name || invoice.project.client?.companyName || null
        }
        defaultRecipientEmail={invoice.project.clientEmail || invoice.project.client?.email || null}
        defaultRecipientPhone={invoice.project.clientPhone || invoice.project.client?.phone || null}
        defaultSubject={`Invoice ${invoice.invoiceNumber} - ${invoice.project.name}`}
        defaultBody={`Dear ${invoice.project.clientName || invoice.project.client?.name || "Client"},\n\nPlease find invoice ${invoice.invoiceNumber} for ${invoice.project.name}.\nOutstanding: ${formatCurrency(Number(invoice.outstandingAmount))} · Due: ${formatDate(invoice.dueDate)}\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <ActivityTimeline
        entityType="Invoice"
        entityId={invoiceId}
        take={20}
        title="Invoice Timeline"
        description="Status changes, deliveries, receipts, accounting sync and collections triggers."
      />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-neutral-950">Line Items</h2>
          <div className="mt-5 overflow-x-auto">
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
                {invoice.lineItems.map((li) => (
                  <tr key={li.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 text-neutral-700">{li.sku ?? "-"}</td>
                    <td className="px-3 py-3 text-neutral-900">{li.description}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {Number(li.quantity)}
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{li.unit}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">
                      {formatCurrency(Number(li.unitPrice))}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-900">
                      {formatCurrency(Number(li.lineAmount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoice.notes ? (
            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap leading-6">{invoice.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-950">Totals</h2>
            <div className="mt-5 grid gap-2 text-sm">
              <Row label="Subtotal" value={formatCurrency(Number(invoice.subtotal))} />
              <Row label="Discount" value={formatCurrency(Number(invoice.discountAmount))} />
              <Row label="GST" value={formatCurrency(Number(invoice.taxAmount))} />
              <div className="border-t border-neutral-200 pt-2">
                <Row label="Total" value={formatCurrency(Number(invoice.totalAmount))} strong />
                <Row label="Outstanding" value={formatCurrency(Number(invoice.outstandingAmount))} strong />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-950">Links</h2>
            <div className="mt-5 grid gap-2 text-sm text-neutral-700">
              <Row label="Project" value={invoice.project.name} />
              <Row label="Contract" value={invoice.contract?.contractNumber ?? "-"} />
              <Row label="Quotation" value={invoice.quotation?.quotationNumber ?? "-"} />
              <Row label="Variation Order" value={invoice.variationOrder?.referenceNumber ?? "-"} />
              <Row
                label="Payment Schedule"
                value={
                  invoice.paymentSchedules.length > 0
                    ? invoice.paymentSchedules.map((s) => s.label).join(", ")
                    : "-"
                }
              />
            </div>
          </section>

          {canSyncAccounting ? (
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-neutral-950">Accounting Sync</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Xero-ready foundation. Sync runs in dry-run mode until Xero env and OAuth are implemented.
              </p>

              <div className="mt-4 grid gap-2 text-sm text-neutral-700">
                <Row label="Xero Invoice ID" value={invoice.xeroInvoiceId ?? "-"} />
                <Row label="Last Sync" value={lastSync ? new Date(lastSync.syncedAt).toLocaleString("en-SG") : "-"} />
                <Row label="Last Status" value={lastSync?.status ?? "-"} />
              </div>

              {lastSync?.message ? (
                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                  <p className="font-semibold uppercase tracking-[0.16em] text-neutral-500">Message</p>
                  <p className="mt-2 whitespace-pre-wrap leading-5">{lastSync.message}</p>
                </div>
              ) : null}

              <form action={syncInvoiceToXeroAction} className="mt-4">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                  Sync Invoice to Xero (Dry-run)
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Receipts</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Recording receipts updates outstanding balances and schedule paid amounts.
            </p>
          </div>
        </div>

        {invoice.receipts.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No receipts recorded yet.</p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Receipt No</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Method</th>
                  <th className="px-4 py-3 text-left font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                {invoice.receipts.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-900">{r.receiptNumber}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(r.paymentDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">
                      {formatCurrency(Number(r.amount))}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{r.paymentMethod ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{r.referenceNo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLocked ? (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Record Receipt
            </p>
            <form action={recordPaymentReceiptAction} className="mt-4 grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="invoiceId" value={invoiceId} />

              <label className="grid gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-neutral-800">Payment Date</span>
                <input
                  name="paymentDate"
                  type="date"
                  required
                  defaultValue={todayIsoDate()}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>

              <label className="grid gap-2 text-sm sm:col-span-2">
                <span className="font-medium text-neutral-800">Amount</span>
                <input
                  name="amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
                  placeholder="0.00"
                />
              </label>

              <label className="grid gap-2 text-sm sm:col-span-1">
                <span className="font-medium text-neutral-800">Method</span>
                <input
                  name="paymentMethod"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Bank transfer"
                />
              </label>

              <label className="grid gap-2 text-sm sm:col-span-1">
                <span className="font-medium text-neutral-800">Reference</span>
                <input
                  name="referenceNo"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                  placeholder="Ref"
                />
              </label>

              <label className="grid gap-2 text-sm sm:col-span-6">
                <span className="font-medium text-neutral-800">Notes (optional)</span>
                <textarea
                  name="notes"
                  rows={2}
                  className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>

              <div className="sm:col-span-6 flex justify-end">
                <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Credit Notes</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Create a credit note to reduce outstanding amount (basic workflow; later extend for full credit allocations).
        </p>

        {invoice.creditNotes.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No credit notes.</p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">CN No</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoice.creditNotes.map((cn) => (
                  <tr key={cn.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-900">{cn.creditNoteNumber}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(cn.issueDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">
                      {formatCurrency(Number(cn.amount))}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{cn.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLocked ? (
          <form action={createCreditNoteAction} className="mt-6 grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="invoiceId" value={invoiceId} />

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Issue Date</span>
              <input
                name="issueDate"
                type="date"
                required
                defaultValue={todayIsoDate()}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Amount</span>
              <input
                name="amount"
                type="number"
                min={0.01}
                step="0.01"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm sm:col-span-6">
              <span className="font-medium text-neutral-800">Reason</span>
              <textarea
                name="reason"
                rows={2}
                required
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Reason for credit note"
              />
            </label>

            <div className="sm:col-span-6 flex justify-end">
              <button className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
                Create Credit Note
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function Row(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className={props.strong ? "font-semibold text-neutral-900" : "text-neutral-600"}>
        {props.label}
      </span>
      <span className={props.strong ? "font-semibold text-neutral-900" : "font-medium text-neutral-900"}>
        {props.value}
      </span>
    </div>
  );
}
