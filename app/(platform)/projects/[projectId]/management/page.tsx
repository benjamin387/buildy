import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createProjectUpdate } from "@/app/(platform)/projects/[projectId]/management/actions";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function todayIsoDateTime(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function ProjectManagementPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PM_UPDATE_READ, projectId });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const updates = await prisma.projectUpdate.findMany({
    where: { projectId },
    include: { author: true },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });

  return (
    <main className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
          Project Management
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Updates
        </h2>
        <p className="mt-2 text-sm text-neutral-700">
          Role-based updates with internal vs client visibility. Logged into timeline and audit trail.
        </p>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">New Update</h3>
        <form action={createProjectUpdate} className="mt-5 grid gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Visibility</span>
              <select
                name="visibility"
                defaultValue="INTERNAL"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                <option value="INTERNAL">Internal</option>
                <option value="CLIENT">Client</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Date</span>
              <input
                name="occurredAt"
                type="date"
                defaultValue={todayIsoDateTime()}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
          </div>

          <input
            name="title"
            required
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Update title"
          />
          <textarea
            name="body"
            required
            rows={4}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Update details"
          />
          <div className="flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Publish Update
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-950">Recent Updates</h3>
        </div>
        {updates.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No updates yet.</div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {updates.map((update) => (
              <div key={update.id} className="px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      {update.title}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDateTime(update.occurredAt)} · {update.visibility} ·{" "}
                      {update.author?.email ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {update.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

