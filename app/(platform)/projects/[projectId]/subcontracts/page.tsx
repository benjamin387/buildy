import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default async function ProjectSubcontractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.SUBCONTRACT_READ, projectId });

  const sp = (await searchParams) ?? {};
  const { page, pageSize, skip, take } = parsePagination(sp);

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();

  const [subcontracts, total] = await Promise.all([
    prisma.subcontract.findMany({
      where: { projectId },
      include: { supplier: true },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.subcontract.count({ where: { projectId } }),
  ]);

  const hrefForPage = (n: number) =>
    buildPageHref(`/projects/${projectId}/subcontracts`, new URLSearchParams(), n, pageSize);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Subcontract Control
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Subcontracts
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Subcontracts contribute to committed cost. Track claims and supplier bills against each subcontract.
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/suppliers`}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          Create / Manage in Suppliers
        </Link>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-neutral-950">Subcontracts</h3>
        </div>
        {subcontracts.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">No subcontracts yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Title</th>
                  <th className="px-4 py-4 text-left font-semibold">Supplier</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-right font-semibold">Subtotal</th>
                  <th className="px-4 py-4 text-right font-semibold">Total</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {subcontracts.map((sc) => (
                  <tr key={sc.id} className="border-t border-neutral-200">
                    <td className="px-4 py-4 font-medium text-neutral-900">{sc.title}</td>
                    <td className="px-4 py-4 text-neutral-900">{sc.supplier.name}</td>
                    <td className="px-4 py-4 text-neutral-700">{sc.status}</td>
                    <td className="px-4 py-4 text-right text-neutral-900">
                      {formatCurrency(Number(sc.contractSubtotal))}
                    </td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950">
                      {formatCurrency(Number(sc.totalAmount))}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/projects/${projectId}/suppliers/subcontracts/${sc.id}`}
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
        <div className="border-t border-neutral-200 px-6 py-4">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}

