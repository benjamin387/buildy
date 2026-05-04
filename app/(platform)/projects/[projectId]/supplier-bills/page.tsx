import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { SupplierBillCreateFormClient } from "@/app/(platform)/projects/[projectId]/supplier-bills/components/bill-create-form-client";
import { createSupplierBillAction } from "@/app/(platform)/projects/[projectId]/supplier-bills/actions";
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

export default async function ProjectSupplierBillsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });

  const sp = (await searchParams) ?? {};
  const { page, pageSize, skip, take } = parsePagination(sp);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const profile = await prisma.projectCommercialProfile.findUnique({
    where: { projectId },
    select: { gstRate: true },
  });
  const gstRate = profile?.gstRate ? Number(profile.gstRate) : 0.09;

  const suppliers = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { projectId },
    orderBy: [{ issueDate: "desc" }],
    select: { id: true, poNumber: true },
    take: 50,
  });
  const subcontracts = await prisma.subcontract.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, title: true },
    take: 50,
  });

  const [bills, total] = await Promise.all([
    prisma.supplierBill.findMany({
      where: { projectId },
      include: { supplier: true, purchaseOrder: true, subcontract: true },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.supplierBill.count({ where: { projectId } }),
  ]);

  const hrefForPage = (n: number) =>
    buildPageHref(`/projects/${projectId}/supplier-bills`, new URLSearchParams(), n, pageSize);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Supplier Billing
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Supplier Bills
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Approving supplier bills records actual costs into project P&amp;L.
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
        <h3 className="text-lg font-semibold text-neutral-950">Create Supplier Bill (Draft)</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Bills can optionally link to a PO and/or subcontract. Approved bills create actual cost entries.
        </p>

        <SupplierBillCreateFormClient
          projectId={projectId}
          gstRate={gstRate}
          suppliers={suppliers.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            gstRegistered: s.gstRegistered,
          }))}
          purchaseOrders={purchaseOrders}
          subcontracts={subcontracts}
          action={createSupplierBillAction}
        />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-950">Bills</h3>
        </div>
        {bills.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No supplier bills yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Bill No</th>
                  <th className="px-4 py-4 text-left font-semibold">Supplier</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Bill Date</th>
                  <th className="px-4 py-4 text-right font-semibold">Total</th>
                  <th className="px-4 py-4 text-left font-semibold">Linked</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">{b.billNumber}</td>
                    <td className="px-4 py-4 text-neutral-900">{b.supplier.name}</td>
                    <td className="px-4 py-4 text-neutral-700">{b.status}</td>
                    <td className="px-4 py-4 text-neutral-700">{formatDate(b.billDate)}</td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(b.totalAmount))}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {b.purchaseOrder ? `PO ${b.purchaseOrder.poNumber}` : ""}
                      {b.subcontract ? `${b.purchaseOrder ? " · " : ""}SC ${b.subcontract.title}` : ""}
                      {!b.purchaseOrder && !b.subcontract ? "-" : null}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/projects/${projectId}/supplier-bills/${b.id}`}
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
        <div className="border-t border-neutral-200 px-6 py-4">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}

