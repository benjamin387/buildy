import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Permission, VendorType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createVendor } from "@/app/(platform)/projects/[projectId]/suppliers/actions";

export default async function VendorsPage() {
  await requirePermission({ permission: Permission.SUPPLIER_READ });

  const vendors = await prisma.vendor.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Vendor Master
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            Vendors
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Maintain supplier and subcontractor master records and onboarding status.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Projects
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Create Vendor</h2>
        <form action={createVendor} className="mt-5 grid gap-3 sm:grid-cols-4">
          <input
            name="name"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
            placeholder="Vendor name"
          />
          <select
            name="type"
            defaultValue={VendorType.SUBCONTRACTOR}
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
          >
            <option value={VendorType.SUPPLIER}>Supplier</option>
            <option value={VendorType.SUBCONTRACTOR}>Subcontractor</option>
            <option value={VendorType.BOTH}>Both</option>
          </select>
          <input
            name="contactPerson"
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Contact person"
          />
          <input
            name="email"
            type="email"
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
            placeholder="Email"
          />
          <input
            name="phone"
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Phone"
          />
          <div className="sm:col-span-1 flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">All Vendors</h2>
        </div>
        {vendors.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No vendors yet.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Name</th>
                  <th className="px-4 py-4 text-left font-semibold">Type</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Email</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">
                      {vendor.name}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{vendor.type}</td>
                    <td className="px-4 py-4 text-neutral-700">{vendor.status}</td>
                    <td className="px-4 py-4 text-neutral-700">{vendor.email ?? "-"}</td>
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
