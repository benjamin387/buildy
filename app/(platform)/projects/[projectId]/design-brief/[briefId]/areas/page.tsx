import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission, RoomType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { addDesignAreaAction } from "@/app/(platform)/projects/[projectId]/design-brief/actions";

export default async function DesignAreasIndexPage({
  params,
}: {
  params: Promise<{ projectId: string; briefId: string }>;
}) {
  const { projectId, briefId } = await params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const brief = await prisma.designBrief.findUnique({
    where: { id: briefId },
    include: {
      areas: { orderBy: [{ createdAt: "asc" }] },
    },
  });
  if (!brief || brief.projectId !== projectId) notFound();

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${projectId}/design-brief/${briefId}`}
              className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
          </div>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Design Areas
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            {brief.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Build room-by-room collaboration: drafter notes, 3D notes, FF&amp;E schedule, and QS BOQ draft.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Add Area</h2>
        <form action={addDesignAreaAction} className="mt-5 grid gap-3 lg:grid-cols-12">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="briefId" value={briefId} />

          <label className="grid gap-2 text-sm lg:col-span-4">
            <span className="font-medium text-neutral-800">Area Name</span>
            <input
              name="name"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Living Room"
            />
          </label>

          <label className="grid gap-2 text-sm lg:col-span-4">
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

          <label className="grid gap-2 text-sm lg:col-span-4">
            <span className="font-medium text-neutral-800">Client Requirement (optional)</span>
            <input
              name="clientRequirement"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Keep existing flooring, TV feature wall"
            />
          </label>

          <div className="flex justify-end lg:col-span-12">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Add Area
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">All Areas</h2>
        </div>

        {brief.areas.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No areas yet.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Area</th>
                  <th className="px-4 py-4 text-left font-semibold">Room Type</th>
                  <th className="px-4 py-4 text-left font-semibold">Requirement</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {brief.areas.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-semibold text-neutral-900">{a.name}</td>
                    <td className="px-4 py-4 text-neutral-700">{a.roomType}</td>
                    <td className="px-4 py-4 text-neutral-700">{a.clientRequirement ?? "-"}</td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/projects/${projectId}/design-brief/${briefId}/areas/${a.id}`}
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

