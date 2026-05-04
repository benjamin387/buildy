import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission, VendorType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createSubcontract } from "@/app/(platform)/projects/[projectId]/suppliers/actions";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ProjectSuppliersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.SUPPLIER_READ, projectId });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const vendors = await prisma.vendor.findMany({
    where: { type: { in: [VendorType.SUBCONTRACTOR, VendorType.BOTH] } },
    orderBy: { name: "asc" },
  });

  const subcontracts = await prisma.subcontract.findMany({
    where: { projectId },
    include: { supplier: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Supplier + Subcontractor Onboarding
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Suppliers &amp; Subcontracts
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Manage vendors, compliance, and subcontract controls (warranty, variation, insurance, defects, payments).
          </p>
        </div>
        <Link
          href="/vendors"
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Vendor Master
        </Link>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">Create Subcontract</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Create a subcontract draft linked to this project.
        </p>

        {vendors.length === 0 ? (
          <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
            No subcontractors found in vendor master. Create one in{" "}
            <Link href="/vendors" className="font-medium underline">
              Vendor Master
            </Link>{" "}
            first.
          </div>
        ) : (
          <form action={createSubcontract} className="mt-5 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="projectId" value={projectId} />
            <select
              name="vendorId"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
              defaultValue={vendors[0]?.id ?? ""}
            >
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name} · {vendor.type} · {vendor.status}
                </option>
              ))}
            </select>
            <input
              name="title"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
              placeholder="Subcontract title (e.g. Carpentry works)"
            />
            <textarea
              name="scopeOfWork"
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-4"
              rows={2}
              placeholder="Scope of work / inclusions"
            />
            <input
              name="contractSubtotal"
              type="number"
              min={0}
              step="0.01"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Subtotal (excl GST)"
            />
            <div className="sm:col-span-3 flex justify-end">
              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
                Create Subcontract
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-950">Subcontracts</h3>
        </div>
        {subcontracts.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No subcontracts yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Title</th>
                  <th className="px-4 py-4 text-left font-semibold">Vendor</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Total</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {subcontracts.map((subcontract) => (
                  <tr key={subcontract.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">
                      {subcontract.title}
                    </td>
                    <td className="px-4 py-4 text-neutral-900">
                      {subcontract.supplier.name}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{subcontract.status}</td>
                    <td className="px-4 py-4 font-semibold text-neutral-950">
                      {formatCurrency(Number(subcontract.totalAmount))}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/projects/${projectId}/suppliers/subcontracts/${subcontract.id}`}
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
