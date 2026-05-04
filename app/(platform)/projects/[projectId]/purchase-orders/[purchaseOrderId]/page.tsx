import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { issuePurchaseOrderAction, updatePurchaseOrderDraftAction } from "@/app/(platform)/projects/[projectId]/purchase-orders/actions";
import { PurchaseOrderLinesEditor } from "@/app/(platform)/projects/[projectId]/purchase-orders/components/po-lines-editor";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";

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

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; purchaseOrderId: string }>;
}) {
  const { projectId, purchaseOrderId } = await params;
  await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      supplier: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!po || po.projectId !== projectId) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true },
  });

  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  const gstRate = profile?.gstRate ? Number(profile.gstRate) : 0.09;

  const canEdit = po.status === "DRAFT";

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/purchase-orders`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-800">
              {po.status}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Purchase Order
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {po.poNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Supplier: {po.supplier.name} · Issue: {formatDate(po.issueDate)} · Expected delivery:{" "}
            {formatDate(po.expectedDeliveryDate)}
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
          <p className="mt-1 text-3xl font-semibold">{formatCurrency(Number(po.totalAmount))}</p>
          <p className="mt-1 text-xs text-neutral-300">
            Subtotal {formatCurrency(Number(po.subtotal))} · Tax {formatCurrency(Number(po.taxAmount))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit ? (
          <form action={issuePurchaseOrderAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Issue PO
            </button>
          </form>
        ) : null}
      </div>

      <MessagingPanel
        returnTo={`/projects/${projectId}/purchase-orders/${purchaseOrderId}`}
        projectId={projectId}
        relatedType="PURCHASE_ORDER"
        relatedId={purchaseOrderId}
        documentType="PURCHASE_ORDER"
        documentId={purchaseOrderId}
        defaultRecipientName={po.supplier.name}
        defaultRecipientEmail={po.supplier.email ?? null}
        defaultRecipientPhone={po.supplier.phone ?? null}
        defaultSubject={`Purchase Order ${po.poNumber}${project ? ` - ${project.name}` : ""}`}
        defaultBody={`Dear ${po.supplier.name},\n\nPlease find purchase order ${po.poNumber}${project ? ` for ${project.name}` : ""}.\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Lines</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {canEdit
            ? "Edit this draft purchase order. Totals are recalculated on save."
            : "This PO is not editable (not draft)."}
        </p>

        {canEdit ? (
          <form action={updatePurchaseOrderDraftAction} className="mt-5 grid gap-6">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Issue Date</span>
                <input
                  name="issueDate"
                  type="date"
                  required
                  defaultValue={po.issueDate.toISOString().slice(0, 10)}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Expected Delivery (optional)</span>
                <input
                  name="expectedDeliveryDate"
                  type="date"
                  defaultValue={po.expectedDeliveryDate ? po.expectedDeliveryDate.toISOString().slice(0, 10) : ""}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Notes (optional)</span>
              <textarea
                name="notes"
                rows={2}
                defaultValue={po.notes ?? ""}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <PurchaseOrderLinesEditor
              name="linesJson"
              gstRate={gstRate}
              isGstRegistered={po.supplier.gstRegistered}
              initialLines={po.lines.map((l, idx) => ({
                id: l.id,
                itemId: l.itemId,
                sku: l.sku,
                description: l.description,
                quantity: Number(l.quantity),
                unitCost: Number(l.unitCost),
                sortOrder: idx,
              }))}
            />

            <div className="flex justify-end">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Save Draft
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold">Description</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-700">{l.sku ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-900">{l.description}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{Number(l.quantity)}</td>
                    <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(Number(l.unitCost))}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.lineAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
