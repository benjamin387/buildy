import { prisma } from "@/lib/prisma";
import { requireClientPortalProject } from "@/lib/client-portal/auth";

export const dynamic = "force-dynamic";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function ClientPortalInvoicesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireClientPortalProject({ projectId });

  const invoices = await prisma.invoice.findMany({
    where: { projectId },
    orderBy: [{ issueDate: "desc" }],
    include: { receipts: { orderBy: [{ paymentDate: "desc" }] } },
    take: 100,
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + Number(i.outstandingAmount), 0);
  const totalCollected = invoices.reduce((sum, i) => sum + i.receipts.reduce((s2, r) => s2 + Number(r.amount), 0), 0);

  return (
    <main className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="Total Invoiced" value={formatCurrency(totalInvoiced)} />
        <Card title="Total Collected" value={formatCurrency(totalCollected)} />
        <Card title="Outstanding" value={formatCurrency(totalOutstanding)} />
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Invoices</h2>
        <p className="mt-2 text-sm text-neutral-600">Invoice status and payments received.</p>

        {invoices.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-700">No invoices yet.</p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-neutral-200">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Issue</th>
                  <th className="px-4 py-3 text-left font-semibold">Due</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-900">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(inv.issueDate)}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 text-neutral-900">{inv.status}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(Number(inv.totalAmount))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(Number(inv.outstandingAmount))}</td>
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

function Card(props: { title: string; value: string }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">{props.title}</p>
      <p className="mt-3 text-xl font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

