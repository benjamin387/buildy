import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createCommunicationLog } from "@/app/(platform)/projects/[projectId]/comms/actions";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function todayIsoDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function ProjectCommsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.COMMS_READ, projectId });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const logs = await prisma.projectCommunicationLog.findMany({
    where: { projectId },
    include: { createdBy: true },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });

  return (
    <main className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
          Correspondence Log
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
          Email + WhatsApp
        </h2>
        <p className="mt-2 text-sm text-neutral-700">
          Log project-linked communications for auditability and context (manual logging for now).
        </p>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-neutral-950">New Log Entry</h3>
        <form action={createCommunicationLog} className="mt-5 grid gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-3 sm:grid-cols-4">
            <select
              name="channel"
              defaultValue="WHATSAPP"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="PHONE">Phone</option>
              <option value="MEETING">Meeting</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              name="direction"
              defaultValue="OUTBOUND"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
              <option value="INTERNAL">Internal</option>
            </select>
            <input
              name="occurredAt"
              type="date"
              defaultValue={todayIsoDate()}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
            <input
              name="participants"
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Participants"
            />
          </div>
          <input
            name="subject"
            className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Subject (optional)"
          />
          <textarea
            name="body"
            required
            rows={4}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Message / summary"
          />
          <div className="flex justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Save Log
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-950">Log</h3>
        </div>
        {logs.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No logs yet.</div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      {log.channel} · {log.direction}
                      {log.subject ? ` · ${log.subject}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {formatDateTime(log.occurredAt)} · {log.participants ?? "-"} ·{" "}
                      {log.createdBy?.email ?? "Unknown"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                  {log.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

