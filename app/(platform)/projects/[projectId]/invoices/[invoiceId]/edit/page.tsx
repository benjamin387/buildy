import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getInvoiceById } from "@/lib/invoices/service";
import { updateInvoiceDraftAction } from "@/app/(platform)/projects/[projectId]/invoices/actions";
import { InvoiceLinesEditor } from "@/app/(platform)/projects/[projectId]/invoices/components/invoice-lines-editor";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ projectId: string; invoiceId: string }>;
}) {
  const { projectId, invoiceId } = await params;
  await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });

  const invoice = await getInvoiceById({ projectId, invoiceId });
  if (!invoice) notFound();
  if (invoice.status !== "DRAFT") notFound();

  const gstRate = invoice.project.commercialProfile?.gstRate ? Number(invoice.project.commercialProfile.gstRate) : 0.09;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Edit Draft
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {invoice.invoiceNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Update draft line items and totals. GST and outstanding amount are recalculated on save.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/invoices/${invoiceId}`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      <form action={updateInvoiceDraftAction} className="grid gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="invoiceId" value={invoiceId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Due Date (optional)</span>
            <input
              name="dueDate"
              type="date"
              defaultValue={invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Title (optional)</span>
            <input
              name="title"
              defaultValue={invoice.title ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>
        </div>

        <label className="grid gap-2 text-sm">
          <span className="font-medium text-neutral-800">Notes (optional)</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={invoice.notes ?? ""}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
          />
        </label>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Line Items
          </p>
          <div className="mt-4">
            <InvoiceLinesEditor
              name="linesJson"
              gstRate={gstRate}
              initialDiscountAmount={Number(invoice.discountAmount)}
              initialLines={invoice.lineItems.map((l, idx) => ({
                id: l.id,
                itemId: l.itemId,
                sku: l.sku,
                description: l.description,
                unit: l.unit,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
                sortOrder: idx,
              }))}
              discountFieldId="edit-discount"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
            Save Draft
          </button>
        </div>
      </form>
    </main>
  );
}
