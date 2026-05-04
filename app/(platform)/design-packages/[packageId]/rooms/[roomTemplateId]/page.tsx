import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { getRoomTemplateById } from "@/lib/design-packages/service";

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function RoomTemplateDetailPage({
  params,
}: {
  params: Promise<{ packageId: string; roomTemplateId: string }>;
}) {
  await requirePermission({ permission: Permission.QUOTE_READ });

  const { packageId, roomTemplateId } = await params;
  const room = await getRoomTemplateById(roomTemplateId);
  if (!room || room.designPackageId !== packageId) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/design-packages/${packageId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {room.roomCode}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Room Template
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {room.name}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            {room.description ?? "No description."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/design-packages/${packageId}/rooms/${roomTemplateId}/edit`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Edit Room + BOQ Items
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Room Type
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
            {room.roomType}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Active
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
            {room.isActive ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            BOQ Items
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
            {room.boqItems.length}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">BOQ Template Items</h2>
          <p className="mt-1 text-sm text-neutral-600">
            These items will be copied into a quotation section when added from this room template.
          </p>
        </div>

        {room.boqItems.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">
            No items yet. Use “Edit” to add template items.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">SKU</th>
                  <th className="px-4 py-4 text-left font-semibold">Description</th>
                  <th className="px-4 py-4 text-left font-semibold">Category</th>
                  <th className="px-4 py-4 text-left font-semibold">Unit</th>
                  <th className="px-4 py-4 text-right font-semibold">Qty</th>
                  <th className="px-4 py-4 text-right font-semibold">Unit Price</th>
                  <th className="px-4 py-4 text-right font-semibold">Cost Price</th>
                  <th className="px-4 py-4 text-left font-semibold">Optional</th>
                </tr>
              </thead>
              <tbody>
                {room.boqItems.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 text-neutral-700">{item.sku ?? item.itemMaster?.sku ?? "-"}</td>
                    <td className="px-4 py-4 font-medium text-neutral-900">{item.description}</td>
                    <td className="px-4 py-4 text-neutral-700">{item.category}</td>
                    <td className="px-4 py-4 text-neutral-700">{item.unit}</td>
                    <td className="px-4 py-4 text-right text-neutral-700">{Number(item.defaultQuantity).toFixed(2)}</td>
                    <td className="px-4 py-4 text-right text-neutral-700">{formatCurrency(Number(item.defaultUnitPrice))}</td>
                    <td className="px-4 py-4 text-right text-neutral-700">{formatCurrency(Number(item.defaultCostPrice))}</td>
                    <td className="px-4 py-4 text-neutral-700">{item.isOptional ? "Yes" : "No"}</td>
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

