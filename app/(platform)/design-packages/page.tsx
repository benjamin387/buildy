import Link from "next/link";
import { DesignStyle, Permission, PropertyType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { listDesignPackages } from "@/lib/design-packages/service";
import { seedDesignPackagesAction } from "@/app/(platform)/design-packages/actions";
import { EmptyState } from "@/app/(platform)/projects/components/empty-state";

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function DesignPackagesIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission({ permission: Permission.QUOTE_READ });

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const pt = typeof params.pt === "string" ? params.pt : "ALL";
  const ds = typeof params.ds === "string" ? params.ds : "ALL";
  const active = typeof params.active === "string" ? params.active : "ALL";

  const propertyType = (pt === "ALL" ? "ALL" : (pt as PropertyType)) as PropertyType | "ALL";
  const designStyle = (ds === "ALL" ? "ALL" : (ds as DesignStyle)) as DesignStyle | "ALL";
  const isActive =
    active === "ALL" ? "ALL" : active === "true" ? true : active === "false" ? false : "ALL";

  const packages = await listDesignPackages({
    search: q || undefined,
    propertyType,
    designStyle,
    isActive,
  });

  const activeCount = packages.filter((p) => p.isActive).length;

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Templates / BOQ Engine
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            Design Packages
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Reusable design packages and room-by-room BOQ templates for fast, standardized quotation creation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/design-packages/new"
            className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            New Package
          </Link>
          <form action={seedDesignPackagesAction}>
            <button className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100">
              Seed Defaults
            </button>
          </form>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Packages" value={`${packages.length}`} />
        <SummaryCard title="Active" value={`${activeCount}`} />
        <SummaryCard title="Inactive" value={`${packages.length - activeCount}`} />
        <SummaryCard title="Rooms (Active)" value={`${packages.reduce((sum, p) => sum + p.rooms.length, 0)}`} />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-6">
          <label className="block sm:col-span-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Search
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Package code, name, description"
              className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Property Type
            </span>
            <select
              name="pt"
              defaultValue={pt}
              className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="ALL">ALL</option>
              <option value={PropertyType.HDB}>HDB</option>
              <option value={PropertyType.CONDO}>CONDO</option>
              <option value={PropertyType.LANDED}>LANDED</option>
              <option value={PropertyType.COMMERCIAL}>COMMERCIAL</option>
              <option value={PropertyType.OTHER}>OTHER</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Design Style
            </span>
            <select
              name="ds"
              defaultValue={ds}
              className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="ALL">ALL</option>
              <option value={DesignStyle.MODERN}>MODERN</option>
              <option value={DesignStyle.MINIMALIST}>MINIMALIST</option>
              <option value={DesignStyle.INDUSTRIAL}>INDUSTRIAL</option>
              <option value={DesignStyle.SCANDINAVIAN}>SCANDINAVIAN</option>
              <option value={DesignStyle.CONTEMPORARY}>CONTEMPORARY</option>
              <option value={DesignStyle.OTHERS}>OTHERS</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Active
            </span>
            <select
              name="active"
              defaultValue={active}
              className="mt-2 h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="ALL">ALL</option>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
            </select>
          </label>

          <div className="flex items-end gap-2 sm:col-span-6">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Apply Filters
            </button>
            <Link
              href="/design-packages"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {packages.length === 0 ? (
          <EmptyState
            title="No design packages yet"
            description="Create your first design package, or seed defaults to start from common templates."
            ctaLabel="Create Design Package"
            ctaHref="/design-packages/new"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Package</th>
                  <th className="px-4 py-4 text-left font-semibold">Property</th>
                  <th className="px-4 py-4 text-left font-semibold">Style</th>
                  <th className="px-4 py-4 text-left font-semibold">Budget Range</th>
                  <th className="px-4 py-4 text-left font-semibold">Rooms</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <tr key={pkg.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 text-neutral-900">
                      <div className="flex flex-col">
                        <span className="font-semibold">{pkg.name}</span>
                        <span className="text-xs text-neutral-500">{pkg.packageCode}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{pkg.propertyType}</td>
                    <td className="px-4 py-4 text-neutral-700">{pkg.designStyle ?? "-"}</td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatCurrency(pkg.estimatedBudgetMin ? Number(pkg.estimatedBudgetMin) : null)}{" "}
                      <span className="text-neutral-400">to</span>{" "}
                      {formatCurrency(pkg.estimatedBudgetMax ? Number(pkg.estimatedBudgetMax) : null)}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{pkg.rooms.length}</td>
                    <td className="px-4 py-4">
                      <span
                        className={[
                          "inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]",
                          pkg.isActive
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-neutral-200 bg-white text-neutral-700",
                        ].join(" ")}
                      >
                        {pkg.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/design-packages/${pkg.id}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        Open
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

function SummaryCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}
