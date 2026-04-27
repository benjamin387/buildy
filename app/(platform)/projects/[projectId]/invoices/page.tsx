import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { computeProjectInvoiceSummary, listInvoicesByProject } from "@/lib/invoices/service";
import { InvoiceSummaryCards } from "@/app/(platform)/projects/[projectId]/invoices/components/invoice-summary-cards";
import { InvoiceStatusBadge } from "@/app/(platform)/projects/[projectId]/invoices/components/invoice-status-badge";
import { markOverdueInvoicesAction } from "@/app/(platform)/projects/[projectId]/invoices/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { StatusPill } from "@/app/components/ui/status-pill";

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

export default async function ProjectInvoicesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.INVOICE_READ, projectId });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const summary = await computeProjectInvoiceSummary(projectId);
  const invoices = await listInvoicesByProject(projectId);

  return (
    <main className="space-y-8">
      <PageHeader
        title="Invoices"
        subtitle={`GST-ready invoices linked to projects, contracts, quotations, and billing schedules for ${project.name}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/projects/${projectId}/billing`}>
              <ActionButton variant="secondary">Billing</ActionButton>
            </Link>
            <Link href={`/projects/${projectId}/invoices/new`}>
              <ActionButton>New Invoice</ActionButton>
            </Link>
          </div>
        }
      />

      <InvoiceSummaryCards
        totalInvoiced={summary.totalInvoiced}
        totalCollected={summary.totalCollected}
        totalOutstanding={summary.totalOutstanding}
        overdueAmount={summary.overdueAmount}
      />

      <SectionCard
        title="Invoice Register"
        description="Draft, send, and track payments with outstanding balances updated from receipts."
        actions={
          <form action={markOverdueInvoicesAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <ActionButton type="submit" variant="secondary">
              Mark Overdue
            </ActionButton>
          </form>
        }
      >
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Create a manual invoice or generate invoices from your progressive billing schedule."
            ctaHref={`/projects/${projectId}/invoices/new`}
            ctaLabel="Create Invoice"
          />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {invoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/projects/${projectId}/invoices/${inv.id}`}
                  className="block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:bg-stone-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-950">{inv.invoiceNumber}</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {inv.invoiceType} · {formatDate(inv.issueDate)} → {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusPill tone="neutral">{inv.invoiceType}</StatusPill>
                      <InvoiceStatusBadge status={inv.isOverdue ? "OVERDUE" : inv.status} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Tile label="Total" value={formatCurrency(Number(inv.totalAmount))} />
                    <Tile label="Outstanding" value={formatCurrency(Number(inv.outstandingAmount))} />
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-stone-50 text-neutral-700">
                    <tr>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Invoice No</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Type</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Issue</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Due</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Total</th>
                      <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em]">Outstanding</th>
                      <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-slate-200">
                        <td className="px-4 py-4 font-semibold text-neutral-900">{inv.invoiceNumber}</td>
                        <td className="px-4 py-4 text-neutral-700">{inv.invoiceType}</td>
                        <td className="px-4 py-4">
                          <InvoiceStatusBadge status={inv.isOverdue ? "OVERDUE" : inv.status} />
                        </td>
                        <td className="px-4 py-4 text-neutral-700 tabular-nums">{formatDate(inv.issueDate)}</td>
                        <td className="px-4 py-4 text-neutral-700 tabular-nums">{formatDate(inv.dueDate)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                          {formatCurrency(Number(inv.totalAmount))}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-neutral-950 tabular-nums">
                          {formatCurrency(Number(inv.outstandingAmount))}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Link href={`/projects/${projectId}/invoices/${inv.id}`}>
                              <ActionButton size="sm" variant="secondary">
                                View
                              </ActionButton>
                            </Link>
                            <Link href={`/projects/${projectId}/invoices/${inv.id}/print`}>
                              <ActionButton size="sm" variant="secondary">
                                Print
                              </ActionButton>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
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
    <div className="rounded-2xl border border-slate-200 bg-stone-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-1 font-semibold text-neutral-950 tabular-nums">{props.value}</p>
    </div>
  );
}
