import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { createContract } from "@/app/(platform)/projects/[projectId]/contract/actions";

function todayIsoDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function NewContractPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.CONTRACT_WRITE, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) notFound();

  const quotations = await prisma.quotation.findMany({
    where: { projectId, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Contract Generation
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">
            New Contract
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
            Select a source quotation. The contract values are derived from the quotation
            and will later include approved variation orders.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}/contract`}
          className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
        >
          Back
        </Link>
      </div>

      {quotations.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center">
            <p className="text-lg font-semibold text-neutral-900">No approved quotations</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
              A contract can only be generated from an approved quotation. Create and approve a
              quotation for this project first.
            </p>
            <Link
              href={`/projects/${projectId}/quotations`}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Go to Quotations
            </Link>
          </div>
        </section>
      ) : (
        <form
          action={createContract}
          className="grid gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid gap-2">
            <h2 className="text-lg font-semibold text-neutral-950">Source</h2>
            <p className="text-sm text-neutral-600">
              Project: {project.name} · Client: {project.client.name}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm sm:col-span-2">
              <span className="font-medium text-neutral-800">Quotation</span>
              <select
                name="quotationId"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                defaultValue={quotations[0]?.id ?? ""}
              >
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quotationNumber} · {q.status} ·{" "}
                    {new Date(q.issueDate).toISOString().slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Contract Date</span>
              <input
                name="contractDate"
                type="date"
                required
                defaultValue={todayIsoDate()}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
          </div>

          <div className="flex items-center justify-end">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Create Contract
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
