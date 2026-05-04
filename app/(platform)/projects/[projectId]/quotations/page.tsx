import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function ProjectQuotationsListPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const quotations = await prisma.quotation.findMany({
    where: { projectId },
    select: {
      id: true,
      quotationNumber: true,
      version: true,
      isLatest: true,
      status: true,
      issueDate: true,
      subtotal: true,
      discountAmount: true,
      estimatedCost: true,
      gstAmount: true,
      totalAmount: true,
      profitAmount: true,
      marginPercent: true,
      createdAt: true,
    },
    orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
  });

  return (
    <main className="space-y-8">
      <PageHeader
        title="Quotations"
        subtitle={`BOQ-style sections, margin visibility, and payment terms for ${project.name}.`}
        actions={
          <Link href={`/projects/${projectId}/quotations/new`}>
            <ActionButton>New Quotation</ActionButton>
          </Link>
        }
      />

      <SectionCard title="Quotation Register" description="Only one version per project is marked as latest. Accepted versions are preserved.">
        {quotations.length === 0 ? (
          <EmptyState
            title="No quotations yet"
            description="Create a quotation to start BOQ-based costing and margin visibility for this project."
            ctaLabel="Create Quotation"
            ctaHref={`/projects/${projectId}/quotations/new`}
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {quotations.map((q) => (
                <Link
                  key={q.id}
                  href={`/projects/${projectId}/quotations/${q.id}`}
                  className="block rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:bg-stone-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">{q.quotationNumber}</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        V{q.version} · {formatDate(q.issueDate)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {q.isLatest ? <StatusPill tone="info">LATEST</StatusPill> : null}
                      <StatusPill tone="neutral">{q.status}</StatusPill>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Tile label="Total" value={formatCurrency(Number(q.totalAmount))} />
                    <Tile label="Subtotal" value={formatCurrency(Number(q.subtotal))} />
                    <Tile label="Est. Cost" value={formatCurrency(Number(q.estimatedCost))} />
                    <Tile label="Margin" value={`${Number(q.marginPercent ?? 0).toFixed(1)}%`} />
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <div className="min-w-[1100px] overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-neutral-700">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Quotation</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Version</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Issue</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Subtotal</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">GST</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Total</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Est. Cost</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Profit</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Margin</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.map((q) => {
                      const totalAmount = Number(q.totalAmount);
                      const gstAmount = Number(q.gstAmount);
                      const profit = Number(q.profitAmount ?? 0);
                      const estimatedCost = Number(q.estimatedCost);
                      const marginPct = Number(q.marginPercent ?? 0);

                      return (
                        <tr key={q.id} className="border-t border-slate-200">
                          <td className="px-4 py-4 font-semibold text-neutral-900">
                            <div className="flex flex-col">
                              <span>{q.quotationNumber}</span>
                              <span className="text-xs text-neutral-500">{q.id.slice(0, 8)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-neutral-700">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-900">V{q.version}</span>
                              {q.isLatest ? <StatusPill tone="info">LATEST</StatusPill> : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-neutral-700 tabular-nums">{formatDate(q.issueDate)}</td>
                          <td className="px-4 py-4">
                            <StatusPill tone="neutral">{q.status}</StatusPill>
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                            {formatCurrency(Number(q.subtotal))}
                          </td>
                          <td className="px-4 py-4 text-right text-neutral-900 tabular-nums">{formatCurrency(gstAmount)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">{formatCurrency(totalAmount)}</td>
                          <td className="px-4 py-4 text-right text-neutral-900 tabular-nums">{formatCurrency(estimatedCost)}</td>
                          <td className="px-4 py-4 text-right text-neutral-900 tabular-nums">{formatCurrency(profit)}</td>
                          <td className="px-4 py-4 text-right text-neutral-900 tabular-nums">
                            {marginPct.toFixed(1)}%
                          </td>
                          <td className="px-4 py-4">
                            <Link href={`/projects/${projectId}/quotations/${q.id}`}>
                              <ActionButton variant="secondary" size="sm">
                                View
                              </ActionButton>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </main>
  );
}

function Tile(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-stone-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{props.value}</p>
    </div>
  );
}

