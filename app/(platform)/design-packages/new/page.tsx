import Link from "next/link";
import { DesignStyle, Permission, PropertyType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createDesignPackageAction } from "@/app/(platform)/design-packages/actions";

export default async function NewDesignPackagePage() {
  await requirePermission({ permission: Permission.QUOTE_WRITE });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/design-packages"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Templates
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            New Design Package
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Create a reusable package with room templates and BOQ template items.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <form action={createDesignPackageAction} className="grid gap-5 lg:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Package Code</span>
            <input
              name="packageCode"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. PKG-HDB-MODERN"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Name</span>
            <input
              name="name"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Modern HDB Renovation"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Description</span>
            <textarea
              name="description"
              rows={3}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="What is included, positioning, and default assumptions."
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Property Type</span>
            <select
              name="propertyType"
              defaultValue={PropertyType.HDB}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value={PropertyType.HDB}>HDB</option>
              <option value={PropertyType.CONDO}>CONDO</option>
              <option value={PropertyType.LANDED}>LANDED</option>
              <option value={PropertyType.COMMERCIAL}>COMMERCIAL</option>
              <option value={PropertyType.OTHER}>OTHER</option>
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Design Style (optional)</span>
            <select
              name="designStyle"
              defaultValue=""
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(None)</option>
              <option value={DesignStyle.MODERN}>MODERN</option>
              <option value={DesignStyle.MINIMALIST}>MINIMALIST</option>
              <option value={DesignStyle.INDUSTRIAL}>INDUSTRIAL</option>
              <option value={DesignStyle.SCANDINAVIAN}>SCANDINAVIAN</option>
              <option value={DesignStyle.CONTEMPORARY}>CONTEMPORARY</option>
              <option value={DesignStyle.OTHERS}>OTHERS</option>
            </select>
          </label>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Estimated Budget Range (Optional)
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Min (SGD)</span>
                <input
                  type="number"
                  name="estimatedBudgetMin"
                  min="0"
                  step="0.01"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-neutral-800">Max (SGD)</span>
                <input
                  type="number"
                  name="estimatedBudgetMax"
                  min="0"
                  step="0.01"
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-950"
                />
                <span className="font-medium text-neutral-800">Active</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Package
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

