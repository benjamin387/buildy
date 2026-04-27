import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountingProvider, AccountingSyncEntityType, Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  approveSupplierBillAction,
  syncSupplierBillToXeroAction,
} from "@/app/(platform)/projects/[projectId]/supplier-bills/actions";
import { MessagingPanel } from "@/app/(platform)/components/messaging-panel";
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

export default async function SupplierBillDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; supplierBillId: string }>;
}) {
  const { projectId, supplierBillId } = await params;
  const { permissions } = await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });
  const canSyncAccounting = permissions.has(Permission.SETTINGS_WRITE);

  const bill = await prisma.supplierBill.findUnique({
    where: { id: supplierBillId },
    include: {
      supplier: true,
      purchaseOrder: true,
      subcontract: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!bill || bill.projectId !== projectId) notFound();

  const canApprove = bill.status === "DRAFT" || bill.status === "RECEIVED";
  const lastSync = canSyncAccounting
    ? await prisma.accountingSyncLog.findFirst({
        where: {
          provider: AccountingProvider.XERO,
          entityType: AccountingSyncEntityType.SUPPLIER_BILL,
          internalId: supplierBillId,
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
              href={`/projects/${projectId}/supplier-bills`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-800">
              {bill.status}
            </span>
          </div>

          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Supplier Bill
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {bill.billNumber}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Supplier: {bill.supplier.name} · Bill date: {formatDate(bill.billDate)} · Due:{" "}
            {formatDate(bill.dueDate)}
          </p>
          <p className="mt-1 text-sm text-neutral-700">
            Linked: {bill.purchaseOrder ? `PO ${bill.purchaseOrder.poNumber}` : "No PO"} ·{" "}
            {bill.subcontract ? `Subcontract ${bill.subcontract.title}` : "No subcontract"}
          </p>
        </div>

        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-md">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
          <p className="mt-1 text-3xl font-semibold">
            {formatCurrency(Number(bill.totalAmount))}
          </p>
          <p className="mt-1 text-xs text-neutral-300">
            Subtotal {formatCurrency(Number(bill.subtotal))} · Tax {formatCurrency(Number(bill.taxAmount))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {canApprove ? (
          <form action={approveSupplierBillAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="supplierBillId" value={supplierBillId} />
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Approve (Record Actual Cost)
            </button>
          </form>
        ) : null}
      </div>

      <MessagingPanel
        returnTo={`/projects/${projectId}/supplier-bills/${supplierBillId}`}
        projectId={projectId}
        relatedType="SUPPLIER_BILL"
        relatedId={supplierBillId}
        documentType="SUPPLIER_BILL"
        documentId={supplierBillId}
        defaultRecipientName={bill.supplier.name}
        defaultRecipientEmail={bill.supplier.email ?? null}
        defaultRecipientPhone={bill.supplier.phone ?? null}
        defaultSubject={`Supplier Bill ${bill.billNumber}`}
        defaultBody={`Dear ${bill.supplier.name},\n\nPlease find supplier bill ${bill.billNumber}.\n\nThank you.`}
        defaultChannel="EMAIL"
      />

      <ActivityTimeline
        entityType="SupplierBill"
        entityId={supplierBillId}
        take={20}
        title="Supplier Bill Timeline"
        description="Drafting, approvals, accounting sync and delivery history."
      />

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Lines</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Description</th>
                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Unit Cost</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l) => (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3 text-neutral-900">{l.description}</td>
                  <td className="px-4 py-3 text-right text-neutral-900">{Number(l.quantity)}</td>
                  <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(Number(l.unitCost))}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900">
                    {formatCurrency(Number(l.lineAmount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bill.notes ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap leading-6">{bill.notes}</p>
          </div>
        ) : null}
      </section>

      {canSyncAccounting ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">Accounting Sync</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Xero-ready foundation. Sync runs in dry-run mode until Xero env and OAuth are implemented.
          </p>

          <div className="mt-4 grid gap-2 text-sm text-neutral-700">
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Last Sync</span>
              <span className="font-medium text-neutral-900">
                {lastSync ? new Date(lastSync.syncedAt).toLocaleString("en-SG") : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Last Status</span>
              <span className="font-medium text-neutral-900">{lastSync?.status ?? "-"}</span>
            </div>
          </div>

          {lastSync?.message ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
              <p className="font-semibold uppercase tracking-[0.16em] text-neutral-500">Message</p>
              <p className="mt-2 whitespace-pre-wrap leading-5">{lastSync.message}</p>
            </div>
          ) : null}

          <form action={syncSupplierBillToXeroAction} className="mt-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="supplierBillId" value={supplierBillId} />
            <button className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Sync Supplier Bill to Xero (Dry-run)
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
