import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, VendorType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { createPurchaseOrderAction } from "@/app/(platform)/projects/[projectId]/purchase-orders/actions";
import { PurchaseOrderCreateFormClient } from "@/app/(platform)/projects/[projectId]/purchase-orders/components/po-create-form-client";

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

export default async function ProjectPurchaseOrdersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const suppliers = await prisma.vendor.findMany({
    where: { type: { in: [VendorType.SUPPLIER, VendorType.BOTH] } },
    orderBy: { name: "asc" },
  });
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { projectId },
    include: { supplier: true },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  const gstRate = profile?.gstRate ? Number(profile.gstRate) : 0.09;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Procurement
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Purchase Orders
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Issue POs to suppliers. Issued POs contribute to committed cost for project P&amp;L.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/suppliers`}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Suppliers
        </Link>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Create Purchase Order (Draft)</h3>
        <p className="mt-1 text-sm text-neutral-600">
          GST is applied only if the supplier is GST-registered. Totals are recalculated server-side on save.
        </p>

        <PurchaseOrderCreateFormClient
          projectId={projectId}
          gstRate={gstRate}
          suppliers={suppliers.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            gstRegistered: s.gstRegistered,
          }))}
          action={createPurchaseOrderAction}
        />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-950">Purchase Orders</h3>
        </div>
        {purchaseOrders.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No purchase orders yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">PO No</th>
                  <th className="px-4 py-4 text-left font-semibold">Supplier</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Issue</th>
                  <th className="px-4 py-4 text-right font-semibold">Total</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">{po.poNumber}</td>
                    <td className="px-4 py-4 text-neutral-900">{po.supplier.name}</td>
                    <td className="px-4 py-4 text-neutral-700">{po.status}</td>
                    <td className="px-4 py-4 text-neutral-700">{formatDate(po.issueDate)}</td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(po.totalAmount))}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/projects/${projectId}/purchase-orders/${po.id}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        View
                      </Link>
                    </td>
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
