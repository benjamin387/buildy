import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProjectContractsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.CONTRACT_READ, projectId });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const contracts = await prisma.contract.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Final Job Contract
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Contracts for {project.name}
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Generate the final job contract from an approved quotation and track revisions.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}/contract/new`}
          className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          New Contract
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {contracts.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center">
            <p className="text-lg font-semibold text-neutral-900">No contracts yet</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
              Create a contract by selecting a source quotation for this project.
            </p>
            <Link
              href={`/projects/${projectId}/contract/new`}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Create Contract
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Number</th>
                  <th className="px-4 py-4 text-left font-semibold">Date</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">
                      {contract.contractNumber}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(contract.contractDate)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-800">
                        {contract.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/projects/${projectId}/contract/${contract.id}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                      >
                        View
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
