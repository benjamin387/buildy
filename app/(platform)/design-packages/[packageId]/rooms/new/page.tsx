import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, RoomType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { createRoomTemplateAction } from "@/app/(platform)/design-packages/actions";

export default async function NewRoomTemplatePage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  await requirePermission({ permission: Permission.QUOTE_WRITE });

  const { packageId } = await params;
  const pkg = await prisma.designPackage.findUnique({
    where: { id: packageId },
    select: { id: true, name: true, packageCode: true },
  });
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
            New Room Template
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {pkg.name}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Create a room template and then add BOQ template items.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <form action={createRoomTemplateAction} className="grid gap-5 lg:grid-cols-2">
          <input type="hidden" name="designPackageId" value={pkg.id} />

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Code</span>
            <input
              name="roomCode"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. LIVING, KITCHEN, WHOLE_UNIT_PRELIM"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Name</span>
            <input
              name="name"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Living Room"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Room Type</span>
            <select
              name="roomType"
              defaultValue={RoomType.LIVING_ROOM}
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
              defaultValue={0}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-2">
            <span className="font-medium text-neutral-800">Description (optional)</span>
            <textarea
              name="description"
              rows={3}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 outline-none ring-neutral-400 focus:ring-2"
              placeholder="What this room template covers and assumptions."
            />
          </label>

          <label className="flex items-center gap-3 text-sm lg:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-neutral-300 text-neutral-950" />
            <span className="font-medium text-neutral-800">Active</span>
          </label>

          <div className="flex justify-end lg:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Room Template
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

