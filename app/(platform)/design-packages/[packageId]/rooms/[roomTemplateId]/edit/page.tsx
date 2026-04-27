import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, RoomType, ScopeCategory } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  addRoomBoqTemplateItemAction,
  deleteRoomBoqTemplateItemAction,
  updateRoomBoqTemplateItemAction,
  updateRoomTemplateAction,
} from "@/app/(platform)/design-packages/actions";

function numberOrBlank(value: unknown): string {
  if (value === null || value === undefined) return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

export default async function EditRoomTemplatePage({
  params,
}: {
  params: Promise<{ packageId: string; roomTemplateId: string }>;
}) {
  await requirePermission({ permission: Permission.QUOTE_WRITE });

  const { packageId, roomTemplateId } = await params;

  const room = await prisma.roomTemplate.findUnique({
    where: { id: roomTemplateId },
    include: {
      designPackage: { select: { id: true, name: true, packageCode: true } },
      boqItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!room || room.designPackageId !== packageId) notFound();

  const itemMasters = await prisma.itemMaster.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      sku: true,
      name: true,
      unitId: true,
      unit: { select: { id: true, code: true, name: true } },
    },
    orderBy: { name: "asc" },
    take: 250,
  });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/design-packages/${packageId}/rooms/${roomTemplateId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <span className="inline-flex rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-700">
              {room.roomCode}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Edit Room Template
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {room.name}
          </h1>
          <p className="mt-2 text-sm text-neutral-700">
            Package: {room.designPackage?.name ?? "-"} ({room.designPackage?.packageCode ?? "-"})
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Room Details</h2>
        <form action={updateRoomTemplateAction} className="mt-5 grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="designPackageId" value={packageId} />
          <input type="hidden" name="roomTemplateId" value={roomTemplateId} />

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Code</span>
            <input
              name="roomCode"
              required
              defaultValue={room.roomCode}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Name</span>
            <input
              name="name"
              required
              defaultValue={room.name}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Type</span>
            <select
              name="roomType"
              defaultValue={room.roomType}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              {Object.values(RoomType).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Sort Order</span>
            <input
              name="sortOrder"
              type="number"
              defaultValue={room.sortOrder}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Description (optional)</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={room.description ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="flex items-center gap-3 text-sm lg:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={room.isActive} className="h-4 w-4 rounded border-neutral-300 text-neutral-950" />
            <span className="font-medium text-neutral-800">Active</span>
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Room
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Add BOQ Template Item</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Items copied into quotations will use these defaults. Optional items are excluded from totals by default.
        </p>

        <form action={addRoomBoqTemplateItemAction} className="mt-5 grid gap-3 lg:grid-cols-12">
          <input type="hidden" name="designPackageId" value={packageId} />
          <input type="hidden" name="roomTemplateId" value={roomTemplateId} />

          <label className="grid gap-2 text-sm lg:col-span-3">
            <span className="font-medium text-neutral-800">Item Master (optional)</span>
            <select
              name="itemMasterId"
              defaultValue=""
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(None)</option>
              {itemMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.sku})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">SKU (optional)</span>
            <input
              name="sku"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="SKU"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-4">
            <span className="font-medium text-neutral-800">Description</span>
            <input
              name="description"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Supply and install vinyl flooring"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-3">
            <span className="font-medium text-neutral-800">Category</span>
            <select
              name="category"
              defaultValue={ScopeCategory.OTHER}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              {Object.values(ScopeCategory).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Unit</span>
            <input
              name="unit"
              required
              defaultValue="lot"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Qty</span>
            <input
              name="defaultQuantity"
              type="number"
              step="0.01"
              min="0"
              defaultValue={0}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Unit Price</span>
            <input
              name="defaultUnitPrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={0}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Cost Price</span>
            <input
              name="defaultCostPrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue={0}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Sort</span>
            <input
              name="sortOrder"
              type="number"
              defaultValue={room.boqItems.length}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-right outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="flex items-center gap-3 text-sm lg:col-span-2">
            <input type="checkbox" name="isOptional" className="h-4 w-4 rounded border-neutral-300 text-neutral-950" />
            <span className="font-medium text-neutral-800">Optional</span>
          </label>

          <div className="flex justify-end lg:col-span-12">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Add Item
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">BOQ Template Items</h2>
        </div>

        {room.boqItems.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No items yet.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
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
                  <th className="px-4 py-4 text-right font-semibold">Sort</th>
                  <th className="px-4 py-4 text-left font-semibold">Optional</th>
                  <th className="px-4 py-4 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {room.boqItems.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-200 align-top">
                    <td className="px-4 py-4 text-neutral-700">
                      <input
                        form={`update-${item.id}`}
                        name="sku"
                        defaultValue={item.sku ?? ""}
                        className="h-10 w-32 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                        placeholder="-"
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-900">
                      <input
                        form={`update-${item.id}`}
                        name="description"
                        defaultValue={item.description}
                        className="h-10 w-[360px] max-w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                      <div className="mt-2">
                        <select
                          form={`update-${item.id}`}
                          name="itemMasterId"
                          defaultValue={item.itemMasterId ?? ""}
                          className="h-10 w-[360px] max-w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                        >
                          <option value="">(No Item Master link)</option>
                          {itemMasters.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <select
                        form={`update-${item.id}`}
                        name="category"
                        defaultValue={item.category}
                        className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      >
                        {Object.values(ScopeCategory).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <input
                        form={`update-${item.id}`}
                        name="unit"
                        defaultValue={item.unit}
                        className="h-10 w-20 rounded-lg border border-neutral-300 bg-white px-2 text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <input
                        form={`update-${item.id}`}
                        name="defaultQuantity"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={numberOrBlank(item.defaultQuantity)}
                        className="h-10 w-24 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <input
                        form={`update-${item.id}`}
                        name="defaultUnitPrice"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={numberOrBlank(item.defaultUnitPrice)}
                        className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <input
                        form={`update-${item.id}`}
                        name="defaultCostPrice"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={numberOrBlank(item.defaultCostPrice)}
                        className="h-10 w-28 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <input
                        form={`update-${item.id}`}
                        name="sortOrder"
                        type="number"
                        defaultValue={item.sortOrder}
                        className="h-10 w-20 rounded-lg border border-neutral-300 bg-white px-2 text-right text-sm outline-none ring-neutral-400 focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          form={`update-${item.id}`}
                          type="checkbox"
                          name="isOptional"
                          defaultChecked={item.isOptional}
                          className="h-4 w-4 rounded border-neutral-300 text-neutral-950"
                        />
                        Optional
                      </label>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <form id={`update-${item.id}`} action={updateRoomBoqTemplateItemAction}>
                          <input type="hidden" name="designPackageId" value={packageId} />
                          <input type="hidden" name="roomTemplateId" value={roomTemplateId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button className="inline-flex h-10 items-center justify-center rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white transition hover:bg-neutral-800">
                            Save
                          </button>
                        </form>

                        <form action={deleteRoomBoqTemplateItemAction}>
                          <input type="hidden" name="designPackageId" value={packageId} />
                          <input type="hidden" name="roomTemplateId" value={roomTemplateId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800 transition hover:bg-red-100">
                            Delete
                          </button>
                        </form>
                      </div>
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

