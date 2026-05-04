import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getDesignPackageById } from "@/lib/design-packages/service";
import { EmptyState } from "@/app/(platform)/projects/components/empty-state";

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function DesignPackageDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  await requirePermission({ permission: Permission.QUOTE_READ });

  const { packageId } = await params;
  const pkg = await getDesignPackageById(packageId);
  if (!pkg) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/design-packages"
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {pkg.packageCode}
            </span>
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
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Package
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {pkg.name}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            {pkg.description ?? "No description."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/design-packages/${pkg.id}/edit`}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Edit Package
          </Link>
          <Link
            href={`/design-packages/${pkg.id}/rooms/new`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            New Room Template
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Property Type
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
            {pkg.propertyType}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Design Style
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
            {pkg.designStyle ?? "-"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Budget Range
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
            {formatCurrency(pkg.estimatedBudgetMin ? Number(pkg.estimatedBudgetMin) : null)}{" "}
            <span className="text-neutral-400">to</span>{" "}
            {formatCurrency(pkg.estimatedBudgetMax ? Number(pkg.estimatedBudgetMax) : null)}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Room Templates</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Room templates can be inserted into quotations as BOQ sections.
            </p>
          </div>
        </div>

        {pkg.rooms.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No rooms yet"
              description="Create room templates such as Living Room, Kitchen, and Whole Unit Preliminary Works."
              ctaLabel="Create Room Template"
              ctaHref={`/design-packages/${pkg.id}/rooms/new`}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Room</th>
                  <th className="px-4 py-4 text-left font-semibold">Type</th>
                  <th className="px-4 py-4 text-left font-semibold">Items</th>
                  <th className="px-4 py-4 text-left font-semibold">Active</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pkg.rooms.map((room) => (
                  <tr key={room.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 text-neutral-900">
                      <div className="flex flex-col">
                        <span className="font-semibold">{room.name}</span>
                        <span className="text-xs text-neutral-500">{room.roomCode}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">{room.roomType}</td>
                    <td className="px-4 py-4 text-neutral-700">{room.boqItems.length}</td>
                    <td className="px-4 py-4 text-neutral-700">{room.isActive ? "Yes" : "No"}</td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/design-packages/${pkg.id}/rooms/${room.id}`}
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

