import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { computeProjectPnlMetrics } from "@/lib/pnl/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { generateProjectProfitSnapshot } from "@/app/(platform)/projects/[projectId]/profitability/actions";

function money(v: number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(v);
}

export default async function ProjectProfitabilityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PNL_READ, projectId });

  const [project, metrics, latestSnapshot] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, revisedContractValue: true, contractValue: true } }),
    computeProjectPnlMetrics(projectId),
    prisma.projectProfitSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!project) notFound();

  const contractValue = Number(project.revisedContractValue) > 0 ? Number(project.revisedContractValue) : Number(project.contractValue);
  const totalRevenue = contractValue + metrics.approvedVariationRevenue;
  const projectedCost = Math.max(metrics.estimatedCost, metrics.committedCost, metrics.actualCost);
  const grossProfit = totalRevenue - projectedCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="Project Engine"
        title="Profitability Dashboard"
        subtitle="Real-time project revenue, cost, margin, and risk controls."
        backHref={`/projects/${projectId}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/projects/${projectId}/cost-ledger`}><ActionButton variant="secondary">Cost Ledger</ActionButton></Link>
            <Link href={`/projects/${projectId}/variation-orders`}><ActionButton variant="secondary">Variation Orders</ActionButton></Link>
            <form action={generateProjectProfitSnapshot}>
              <input type="hidden" name="projectId" value={projectId} />
              <ActionButton type="submit">Generate Snapshot</ActionButton>
            </form>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Contract Value" value={money(contractValue)} />
        <Card title="Approved Variations" value={money(metrics.approvedVariationRevenue)} />
        <Card title="Total Revenue" value={money(totalRevenue)} />
        <Card title="Projected Cost" value={money(projectedCost)} />
        <Card title="Committed Cost" value={money(metrics.committedCost)} />
        <Card title="Actual Cost" value={money(metrics.actualCost)} />
        <Card title="Gross Profit" value={money(grossProfit)} />
        <Card title="Gross Margin" value={`${grossMargin.toFixed(2)}%`} />
        <Card title="Amount Invoiced" value={money(metrics.invoicedRevenueNet)} />
        <Card title="Amount Paid" value={money(metrics.collectedRevenue)} />
        <Card title="Outstanding" value={money(metrics.outstandingReceivables)} />
        <Card title="Overdue" value={money(metrics.overdueInvoiceOutstanding)} />
      </section>

      <SectionCard title="AI Risk Panel" description="Automated risk checks across margin, cost drift, billing, and supplier exposure.">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={grossMargin < 12 ? "danger" : grossMargin < 18 ? "warning" : "success"}>{grossMargin < 12 ? "Margin Below Target" : "Margin Healthy"}</StatusPill>
          <StatusPill tone={metrics.billsExceedingPo.length > 0 ? "warning" : "success"}>{metrics.billsExceedingPo.length > 0 ? "PO Exceeded" : "PO Within Control"}</StatusPill>
          <StatusPill tone={metrics.approvedVariationRevenue <= 0 && metrics.actualCost > metrics.estimatedCost ? "warning" : "success"}>{metrics.approvedVariationRevenue <= 0 && metrics.actualCost > metrics.estimatedCost ? "Missing Variation Order Risk" : "Variation Controls OK"}</StatusPill>
          <StatusPill tone={metrics.approvedVariationRevenue > 0 && metrics.invoicedRevenueNet < metrics.approvedVariationRevenue * 0.6 ? "warning" : "success"}>{metrics.approvedVariationRevenue > 0 && metrics.invoicedRevenueNet < metrics.approvedVariationRevenue * 0.6 ? "Unbilled Approved Work" : "Approved Work Billing OK"}</StatusPill>
          <StatusPill tone={metrics.overdueInvoiceOutstanding > 0 ? "danger" : "success"}>{metrics.overdueInvoiceOutstanding > 0 ? "Overdue Payment" : "Payment Timeliness OK"}</StatusPill>
          <StatusPill tone={metrics.unpaidSupplierBillOutstanding > 0 ? "danger" : "success"}>{metrics.unpaidSupplierBillOutstanding > 0 ? "Unpaid Supplier Risk" : "Supplier Payments OK"}</StatusPill>
        </div>

        {latestSnapshot ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Latest Snapshot ({latestSnapshot.createdAt.toLocaleString()})</p>
            <p className="mt-2 text-sm text-neutral-700">{latestSnapshot.aiRiskSummary || "No AI summary."}</p>
          </div>
        ) : null}
      </SectionCard>
    </main>
  );
}

function Card(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.title}</p>
      <p className="mt-2 text-xl font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}
