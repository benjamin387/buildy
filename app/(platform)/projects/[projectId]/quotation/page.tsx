import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

export default async function ProjectQuotationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) notFound();

  const quotations = await prisma.quotation.findMany({
    where: { projectId },
    select: {
      id: true,
      quotationNumber: true,
      version: true,
      status: true,
      issueDate: true,
      totalAmount: true,
      profitAmount: true,
      marginPercent: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
            Quotation + BOQ Costing
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            Quotations for {project.name}
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Create and manage quotations, BOQ line items, and margin visibility
            per trade section.
          </p>
        </div>

        <Link
          href={`/projects/${projectId}/quotation/new`}
          className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
        >
          New Quotation
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {quotations.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center">
            <p className="text-lg font-semibold text-neutral-900">
              No quotations yet
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
              Create a quotation to start BOQ-based costing and margin tracking
              for this project.
            </p>
            <Link
              href={`/projects/${projectId}/quotation/new`}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Create Quotation
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Quotation</th>
                  <th className="px-4 py-4 text-left font-semibold">Version</th>
                  <th className="px-4 py-4 text-left font-semibold">Issue Date</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Total</th>
                  <th className="px-4 py-4 text-left font-semibold">Profit</th>
                  <th className="px-4 py-4 text-left font-semibold">Margin</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => {
                  const profit = Number(quotation.profitAmount ?? 0);
                  const marginPct = Number(quotation.marginPercent ?? 0);

                  return (
                    <tr key={quotation.id} className="border-t border-neutral-200">
                      <td className="px-4 py-4 font-medium text-neutral-900">
                        <div className="flex flex-col">
                          <span>{quotation.quotationNumber}</span>
                          <span className="text-xs text-neutral-500">
                            {quotation.id.slice(0, 8)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-neutral-700">{quotation.version}</td>
                      <td className="px-4 py-4 text-neutral-700">{formatDate(quotation.issueDate)}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-800">
                          {quotation.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-neutral-950">
                        {formatCurrency(Number(quotation.totalAmount))}
                      </td>
                      <td className="px-4 py-4 text-neutral-900">{formatCurrency(profit)}</td>
                      <td className="px-4 py-4 text-neutral-900">
                        <div className="flex flex-col">
                          <span className="font-semibold">{marginPct.toFixed(1)}%</span>
                          <span className="text-xs text-neutral-500">
                            {formatCurrency(profit)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/projects/${projectId}/quotation/${quotation.id}`}
                          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
