import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { approveVariationOrder, createInvoiceFromVariationOrder } from "@/app/(platform)/projects/[projectId]/profitability/actions";

function money(v: { toString(): string } | number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(Number(v.toString()));
}

export default async function VariationOrderDetailPage({ params }: { params: Promise<{ projectId: string; variationOrderId: string }> }) {
  const { projectId, variationOrderId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const row = await prisma.variationOrder.findUnique({
    where: { id: variationOrderId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, invoices: true },
  });

  if (!row || row.projectId !== projectId) notFound();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="Project Engine"
        title={row.referenceNumber}
        subtitle={row.title}
        backHref={`/projects/${projectId}/variation-orders`}
        actions={<StatusPill tone={row.status === "APPROVED" || row.status === "INVOICED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>{row.status}</StatusPill>}
      />

      <SectionCard title="Commercial Summary">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Subtotal" value={money(row.subtotal)} />
          <Info label="GST" value={money(row.gstAmount)} />
          <Info label="Total" value={money(row.totalAmount)} />
          <Info label="Cost Subtotal" value={money(row.costSubtotal)} />
          <Info label="Client Approved" value={row.clientApprovedAt ? row.clientApprovedAt.toLocaleString() : "-"} />
          <Info label="Reason" value={row.reason || "-"} />
          <Info label="Created" value={row.createdAt.toLocaleString()} />
          <Info label="Updated" value={row.updatedAt.toLocaleString()} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <form action={approveVariationOrder}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="variationOrderId" value={row.id} />
            <ActionButton type="submit" disabled={row.status !== "PENDING_APPROVAL"}>Approve Variation Order</ActionButton>
          </form>
          <form action={createInvoiceFromVariationOrder}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="variationOrderId" value={row.id} />
            <ActionButton type="submit" variant="secondary" disabled={row.status !== "APPROVED" && row.status !== "INVOICED"}>Create Invoice</ActionButton>
          </form>
          <Link href={`/projects/${projectId}/variations/${row.id}`} className="inline-flex h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Open Full Variation Workflow</Link>
        </div>
      </SectionCard>

      <SectionCard title="Variation Items">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                <th className="py-3 pr-4">Description</th>
                <th className="py-3 pr-4">Qty</th>
                <th className="py-3 pr-4">Unit</th>
                <th className="py-3 pr-4">Unit Price</th>
                <th className="py-3 pr-4">Total Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {row.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4 text-neutral-900">{item.description}</td>
                  <td className="py-3 pr-4 text-neutral-700">{Number(item.quantity).toFixed(2)}</td>
                  <td className="py-3 pr-4 text-neutral-700">{item.unit}</td>
                  <td className="py-3 pr-4 text-neutral-700">{money(item.unitPrice)}</td>
                  <td className="py-3 pr-4 text-neutral-900 font-semibold">{money(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </main>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</p>
      <p className="mt-1 text-sm text-neutral-900">{props.value}</p>
    </div>
  );
}
