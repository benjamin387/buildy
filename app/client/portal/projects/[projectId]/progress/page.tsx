import { prisma } from "@/lib/prisma";
import { requireClientPortalProject } from "@/lib/client-portal/auth";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function ClientPortalProgressPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireClientPortalProject({ projectId });

  const milestones = await prisma.projectMilestone.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }],
    select: { id: true, title: true, description: true, dueDate: true, completedDate: true, status: true },
    take: 200,
  });

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Progress</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">Project milestones</h2>
        <p className="mt-2 text-sm text-neutral-600">Key progress checkpoints shared by the project team.</p>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        {milestones.length === 0 ? (
          <p className="text-sm text-neutral-700">No milestones have been published yet.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => (
              <div key={m.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">{m.title}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      Status: {m.status} · Due {formatDate(m.dueDate)} · Completed {formatDate(m.completedDate)}
                    </p>
                    {m.description ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{m.description}</p>
                    ) : null}
                  </div>
                  <span className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
                    {m.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

