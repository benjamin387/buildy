import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { listVariationsByProject } from "@/lib/variation-orders/service";
import { PaginationControls } from "@/app/components/ui/pagination";
import { buildPageHref, parsePagination } from "@/lib/utils/pagination";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function statusBadge(status: string): string {
  if (status === "APPROVED" || status === "INVOICED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PENDING_APPROVAL") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-300 bg-neutral-50 text-neutral-700";
}

export default async function VariationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const sp = (await searchParams) ?? {};
  const { page, pageSize, skip, take } = parsePagination(sp);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, projectCode: true, clientName: true },
  });
  if (!project) notFound();

  const [{ items: rows, total }, approvedAgg] = await Promise.all([
    listVariationsByProject(projectId, { skip, take }),
    prisma.variationOrder.aggregate({
      where: { projectId, status: { in: ["APPROVED", "INVOICED"] } },
      _sum: { subtotal: true, costSubtotal: true },
    }),
  ]);

  const approvedRevenue = Number(approvedAgg._sum.subtotal ?? 0);
  const approvedCost = Number(approvedAgg._sum.costSubtotal ?? 0);

  const hrefForPage = (n: number) =>
    buildPageHref(`/projects/${projectId}/variations`, new URLSearchParams(), n, pageSize);

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Project / Variation Orders
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              {project.projectCode ? `${project.projectCode} · ` : ""}{project.name}
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              Change control for scope variations. Only approved variations affect revised contract value and invoicing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
            >
              Back
            </Link>
            <Link
              href={`/projects/${projectId}/variations/new`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              New Variation
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total VOs" value={`${total}`} />
        <SummaryCard label="Approved Variation Revenue (net)" value={formatCurrency(approvedRevenue)} />
        <SummaryCard label="Approved Variation Cost (est)" value={formatCurrency(approvedCost)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Register</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {project.clientName ? `Client: ${project.clientName}. ` : ""}Click a VO to view details, send for approval, or invoice.
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-6 text-sm text-neutral-600">
            No variation orders yet. Create one when the scope changes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">No.</th>
                  <th className="px-4 py-3 text-left font-semibold">Title</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Revenue (net)</th>
                  <th className="px-4 py-3 text-right font-semibold">Cost (est)</th>
                  <th className="px-4 py-3 text-right font-semibold">Profit</th>
                  <th className="px-4 py-3 text-right font-semibold">Margin</th>
                  <th className="px-4 py-3 text-right font-semibold">Time Impact</th>
                  <th className="px-4 py-3 text-left font-semibold">Approved</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((vo) => {
                  const revenue = Number(vo.subtotal);
                  const cost = Number(vo.costSubtotal);
                  const profit = revenue - cost;
                  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
                  const approvedAt = vo.approvedAt ?? null;
                  return (
                    <tr key={vo.id} className="border-t border-neutral-200 bg-white">
                      <td className="px-4 py-3 font-medium text-neutral-950">
                        <Link href={`/projects/${projectId}/variations/${vo.id}`} className="hover:underline">
                          {vo.referenceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-neutral-900">{vo.title}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusBadge(vo.status)}`}>
                          {vo.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(revenue)}</td>
                      <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(cost)}</td>
                      <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatCurrency(profit)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{margin.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{vo.timeImpactDays ?? 0}d</td>
                      <td className="px-4 py-3 text-neutral-700">{approvedAt ? formatDate(approvedAt) : "-"}</td>
                    </tr>
                  );
                })}
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

function SummaryCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.value}</p>
    </div>
  );
}

