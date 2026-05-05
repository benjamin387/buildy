import Link from "next/link";
import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { StatusPill } from "@/app/components/ui/status-pill";

function money(v: { toString(): string } | number) {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(Number(v.toString()));
}

export default async function ProjectVariationOrdersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.QUOTE_READ, projectId });

  const [project, rows] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    prisma.variationOrder.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, include: { invoices: true } }),
  ]);

  if (!project) notFound();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="Project Engine"
        title="Variation Orders"
        subtitle="Track change orders, approval status, and invoicing conversion."
        backHref={`/projects/${projectId}/profitability`}
        actions={<Link href={`/projects/${projectId}/variation-orders/new`}><ActionButton>New Variation Order</ActionButton></Link>}
      />

      <SectionCard title="Variation Register">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                <th className="py-3 pr-4">Reference</th>
                <th className="py-3 pr-4">Title</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Subtotal</th>
                <th className="py-3 pr-4">GST</th>
                <th className="py-3 pr-4">Total</th>
                <th className="py-3 pr-4">Client Approved</th>
                <th className="py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 font-semibold text-neutral-900">{row.referenceNumber}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.title}</td>
                  <td className="py-3 pr-4"><StatusPill tone={row.status === "APPROVED" || row.status === "INVOICED" ? "success" : row.status === "REJECTED" ? "danger" : "warning"}>{row.status}</StatusPill></td>
                  <td className="py-3 pr-4 text-neutral-700">{money(row.subtotal)}</td>
                  <td className="py-3 pr-4 text-neutral-700">{money(row.gstAmount)}</td>
                  <td className="py-3 pr-4 text-neutral-900 font-semibold">{money(row.totalAmount)}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.clientApprovedAt ? row.clientApprovedAt.toLocaleDateString() : "-"}</td>
                  <td className="py-3"><Link className="text-sm font-semibold text-neutral-900 hover:text-neutral-600" href={`/projects/${projectId}/variation-orders/${row.id}`}>Open</Link></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={8} className="py-6 text-center text-neutral-500">No variation orders yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </main>
  );
}
