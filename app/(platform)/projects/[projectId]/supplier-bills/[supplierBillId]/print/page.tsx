import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

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

export default async function PrintSupplierBillPage({
  params,
}: {
  params: Promise<{ projectId: string; supplierBillId: string }>;
}) {
  const { projectId, supplierBillId } = await params;
  await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });

  const bill = await prisma.supplierBill.findUnique({
    where: { id: supplierBillId },
    include: { project: true, supplier: true, lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!bill || bill.projectId !== projectId) notFound();

  const company = {
    name: "Renovation Company Pte Ltd",
    address: "Singapore",
  };

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
          href={`/projects/${projectId}/supplier-bills/${supplierBillId}`}
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
              Supplier Bill
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {bill.billNumber}
            </h1>
            <p className="mt-2 text-sm text-neutral-700">
              Bill date: {formatDate(bill.billDate)} · Due date: {formatDate(bill.dueDate)}
            </p>
            <p className="mt-2 text-sm text-neutral-700">Status: {bill.status}</p>
          </div>

          <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-sm sm:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(Number(bill.totalAmount))}</p>
            <p className="mt-1 text-xs text-neutral-300">
              Subtotal {formatCurrency(Number(bill.subtotal))} · Tax {formatCurrency(Number(bill.taxAmount))}
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Project</p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">{bill.project.name}</p>
            <p className="mt-1 text-sm text-neutral-700">
              {bill.project.addressLine1}
              {bill.project.addressLine2 ? `, ${bill.project.addressLine2}` : ""}
              {bill.project.postalCode ? ` ${bill.project.postalCode}` : ""}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Supplier</p>
            <p className="mt-2 text-sm font-semibold text-neutral-900">{bill.supplier.name}</p>
            {bill.supplier.email ? <p className="mt-1 text-sm text-neutral-700">{bill.supplier.email}</p> : null}
            {bill.supplier.phone ? <p className="mt-1 text-sm text-neutral-700">{bill.supplier.phone}</p> : null}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-neutral-950">Bill Lines</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Description</th>
                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="px-3 py-3 text-right font-semibold">Unit Cost</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 text-neutral-900">{l.description}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{Number(l.quantity)}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{formatCurrency(Number(l.unitCost))}</td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.lineAmount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(bill.subtotal))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Tax</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(bill.taxAmount))}</span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(Number(bill.totalAmount))}</span>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Issued By</p>
          <p className="mt-2 text-sm font-semibold text-neutral-900">{company.name}</p>
          <p className="mt-1 text-sm text-neutral-700">{company.address}</p>
        </section>

        {bill.notes ? (
          <section className="mt-8 rounded-xl border border-neutral-200 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{bill.notes}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

