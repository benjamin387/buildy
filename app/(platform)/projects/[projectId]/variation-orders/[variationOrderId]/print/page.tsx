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

export default async function PrintVariationOrderPage({
  params,
}: {
  params: Promise<{ projectId: string; variationOrderId: string }>;
}) {
  const { projectId, variationOrderId } = await params;
  await requirePermission({ permission: Permission.PNL_READ, projectId });

  const vo = await prisma.variationOrder.findUnique({
    where: { id: variationOrderId },
    include: { project: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!vo || vo.projectId !== projectId) notFound();

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
          href={`/projects/${projectId}/pnl`}
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
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">Variation Order</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{vo.referenceNumber}</h1>
            <p className="mt-2 text-sm text-neutral-700">Status: {vo.status}</p>
            <p className="mt-2 text-sm text-neutral-700">
              Project: {vo.project.name}
            </p>
          </div>

          <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white shadow-sm sm:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-300">Total</p>
            <p className="mt-1 text-2xl font-semibold">{formatCurrency(Number(vo.totalAmount))}</p>
            <p className="mt-1 text-xs text-neutral-300">
              Subtotal {formatCurrency(Number(vo.subtotal))} · GST {formatCurrency(Number(vo.gstAmount))}
            </p>
          </div>
        </header>

        <section className="mt-8 rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Work Description</p>
          <p className="mt-2 text-sm font-semibold text-neutral-900">{vo.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{vo.description ?? "-"}</p>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-neutral-950">Line Items</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Description</th>
                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                  <th className="px-3 py-3 text-left font-semibold">Unit</th>
                  <th className="px-3 py-3 text-right font-semibold">Unit Rate</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {vo.lineItems.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-200">
                    <td className="px-3 py-3 text-neutral-900">{l.description}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{Number(l.quantity)}</td>
                    <td className="px-3 py-3 text-neutral-700">{l.unit}</td>
                    <td className="px-3 py-3 text-right text-neutral-900">{formatCurrency(Number(l.unitPrice))}</td>
                    <td className="px-3 py-3 text-right font-medium text-neutral-900">{formatCurrency(Number(l.totalPrice))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10 grid gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">Subtotal</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(vo.subtotal))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-600">GST</span>
            <span className="font-medium text-neutral-900">{formatCurrency(Number(vo.gstAmount))}</span>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(Number(vo.totalAmount))}</span>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Generated</p>
          <p className="mt-2 text-sm text-neutral-700">{formatDate(vo.createdAt)}</p>
        </section>
      </div>
    </main>
  );
}
