import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

export const dynamic = "force-dynamic";

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

export default async function QuotationsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const { page, pageSize, skip, take } = parsePagination(sp);

  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({
      include: {
        client: true,
        project: true,
        sections: {
          include: {
            lineItems: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
    }),
    prisma.quotation.count(),
  ]);

  const hrefForPage = (n: number) => buildPageHref("/quotation", new URLSearchParams(), n, pageSize);

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
              Legacy Quotations
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">Quotations</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Older quotation workflow (non-project linked). For new project-linked quotations, open a project and use the Quotations tab.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Go to Projects
          </Link>
          <Link
            href="/quotation/new"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            New Legacy Quotation
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        {quotations.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-6 text-center">
            <p className="text-lg font-semibold text-neutral-900">No quotations found</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
              Create your first legacy quotation (project-linked quotations live inside Projects).
            </p>
            <Link
              href="/quotation/new"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Create Legacy Quotation
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-4 text-left font-semibold">Reference</th>
                  <th className="px-4 py-4 text-left font-semibold">Date</th>
                  <th className="px-4 py-4 text-left font-semibold">Client</th>
                  <th className="px-4 py-4 text-left font-semibold">Project</th>
                  <th className="px-4 py-4 text-left font-semibold">Property</th>
                  <th className="px-4 py-4 text-left font-semibold">Sections</th>
                  <th className="px-4 py-4 text-left font-semibold">Line Items</th>
                  <th className="px-4 py-4 text-left font-semibold">Status</th>
                  <th className="px-4 py-4 text-left font-semibold">Total</th>
                  <th className="px-4 py-4 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => {
                  const lineItemCount = quotation.sections.reduce(
                    (sum, section) => sum + section.lineItems.length,
                    0,
                  );

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
                      <td className="px-4 py-4 text-neutral-700">{formatDate(quotation.issueDate)}</td>
                      <td className="px-4 py-4 text-neutral-900">
                        {quotation.clientNameSnapshot || quotation.client.name}
                      </td>
                      <td className="px-4 py-4 text-neutral-700">
                        {quotation.projectNameSnapshot || quotation.project.name}
                      </td>
                      <td className="px-4 py-4 text-neutral-700">{quotation.propertyType}</td>
                      <td className="px-4 py-4 text-neutral-700">{quotation.sections.length}</td>
                      <td className="px-4 py-4 text-neutral-700">{lineItemCount}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-800">
                          {quotation.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-neutral-950">
                        {formatCurrency(Number(quotation.totalAmount))}
                      </td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/quotation/${quotation.id}`}
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
        <div className="border-t border-neutral-200 px-4 py-4">
          <PaginationControls page={page} pageSize={pageSize} total={total} hrefForPage={hrefForPage} />
        </div>
      </section>
    </main>
  );
}
