import Link from "next/link";
import { notFound } from "next/navigation";
import { DesignStyle, Permission, PropertyType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { updateDesignPackageAction } from "@/app/(platform)/design-packages/actions";

export default async function EditDesignPackagePage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  await requirePermission({ permission: Permission.QUOTE_WRITE });

  const { packageId } = await params;
  const pkg = await prisma.designPackage.findUnique({ where: { id: packageId } });
  if (!pkg) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/design-packages/${packageId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {pkg.packageCode}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Edit Package
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {pkg.name}
          </h1>
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <form action={updateDesignPackageAction} className="grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="packageId" value={pkg.id} />

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Package Code</span>
            <input
              name="packageCode"
              required
              defaultValue={pkg.packageCode}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Name</span>
            <input
              name="name"
              required
              defaultValue={pkg.name}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={pkg.description ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Property Type</span>
            <select
              name="propertyType"
              defaultValue={pkg.propertyType}
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
              defaultValue={pkg.designStyle ?? ""}
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

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 lg:col-span-2">
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
                  defaultValue={pkg.estimatedBudgetMin ? Number(pkg.estimatedBudgetMin) : ""}
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
                  defaultValue={pkg.estimatedBudgetMax ? Number(pkg.estimatedBudgetMax) : ""}
                  className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                />
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={pkg.isActive}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-950"
                />
                <span className="font-medium text-neutral-800">Active</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Changes
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

