import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountingProvider, AccountingSyncEntityType, Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import {
  recordPaymentReceiptAction,
  syncPaymentReceiptToXeroAction,
} from "@/app/(platform)/projects/[projectId]/invoices/actions";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

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

export default async function ProjectReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const { permissions } = await requirePermission({ permission: Permission.INVOICE_READ, projectId });
  const canSyncAccounting = permissions.has(Permission.SETTINGS_WRITE);

  const sp = (await searchParams) ?? {};
  const { page, pageSize, skip, take } = parsePagination(sp);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const invoices = await prisma.invoice.findMany({
    where: { projectId, status: { not: "VOID" } },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, invoiceNumber: true, outstandingAmount: true, status: true },
    take: 100,
  });

  const [receipts, total] = await Promise.all([
    prisma.paymentReceipt.findMany({
      where: { projectId },
      include: { invoice: { select: { invoiceNumber: true } } },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.paymentReceipt.count({ where: { projectId } }),
  ]);

  const hrefForPage = (n: number) =>
    buildPageHref(`/projects/${projectId}/receipts`, new URLSearchParams(), n, pageSize);

  const syncLogByReceiptId = canSyncAccounting
    ? await (async () => {
        const ids = receipts.map((r) => r.id);
        if (ids.length === 0) return new Map<string, { status: string; syncedAt: Date }>();

        const logs = await prisma.accountingSyncLog.findMany({
          where: {
            provider: AccountingProvider.XERO,
            entityType: AccountingSyncEntityType.PAYMENT_RECEIPT,
            internalId: { in: ids },
          },
          orderBy: [{ syncedAt: "desc" }],
          take: 400,
          select: { internalId: true, status: true, syncedAt: true },
        });

        const map = new Map<string, { status: string; syncedAt: Date }>();
        for (const l of logs) {
          if (!map.has(l.internalId)) map.set(l.internalId, { status: l.status, syncedAt: l.syncedAt });
        }
        return map;
      })()
    : new Map<string, { status: string; syncedAt: Date }>();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Collections
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Receipts for {project.name}
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Record payments against invoices. Receipts update invoice outstanding and progressive billing stage paid totals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${projectId}/invoices`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Invoice Register
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Record New Receipt</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Link the receipt to an invoice (required for now). Overpayment is prevented by default.
        </p>

        <form action={recordPaymentReceiptAction} className="mt-5 grid gap-4 sm:grid-cols-6">
          <input type="hidden" name="projectId" value={projectId} />

          <label className="grid gap-2 text-sm sm:col-span-3">
            <span className="font-medium text-neutral-800">Invoice</span>
            <select
              name="invoiceId"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              defaultValue={invoices[0]?.id ?? ""}
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} · {inv.status} · Outstanding {Number(inv.outstandingAmount).toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm sm:col-span-1">
            <span className="font-medium text-neutral-800">Date</span>
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

          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium text-neutral-800">Method</span>
            <input
              name="paymentMethod"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Bank transfer"
            />
          </label>

          <label className="grid gap-2 text-sm sm:col-span-2">
            <span className="font-medium text-neutral-800">Reference</span>
            <input
              name="referenceNo"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="Reference"
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
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Receipt Register</h3>

        {receipts.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No receipts recorded yet.</p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Receipt No</th>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold">Method</th>
                  <th className="px-4 py-3 text-left font-semibold">Reference</th>
                  {canSyncAccounting ? (
                    <th className="px-4 py-3 text-left font-semibold">Accounting</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-200 bg-white">
                    <td className="px-4 py-3 font-medium text-neutral-900">{r.receiptNumber}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {r.invoice ? (
                        <Link
                          href={`/projects/${projectId}/invoices/${r.invoiceId}`}
                          className="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-700"
                        >
                          {r.invoice.invoiceNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(r.paymentDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">
                      {formatCurrency(Number(r.amount))}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{r.paymentMethod ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{r.referenceNo ?? "-"}</td>
                    {canSyncAccounting ? (
                      <td className="px-4 py-3 text-neutral-700">
                        <div className="flex flex-col gap-2">
                          <div className="text-xs text-neutral-600">
                            {r.xeroPaymentId ? (
                              <span className="font-medium text-neutral-900">Linked</span>
                            ) : (
                              <span className="font-medium text-neutral-900">Not linked</span>
                            )}
                            {syncLogByReceiptId.get(r.id) ? (
                              <>
                                {" "}
                                · {syncLogByReceiptId.get(r.id)!.status}
                              </>
                            ) : null}
                          </div>
                          <form action={syncPaymentReceiptToXeroAction}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="receiptId" value={r.id} />
                            <input type="hidden" name="returnTo" value={`/projects/${projectId}/receipts`} />
                            <button className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-100">
                              Sync to Xero
                            </button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-6">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}
