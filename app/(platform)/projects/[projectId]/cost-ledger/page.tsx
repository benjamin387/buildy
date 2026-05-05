import { notFound } from "next/navigation";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { createProjectCostLedgerEntry } from "@/app/(platform)/projects/[projectId]/profitability/actions";

export default async function ProjectCostLedgerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const [project, rows] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    prisma.projectCostLedger.findMany({ where: { projectId }, orderBy: [{ incurredDate: "desc" }, { createdAt: "desc" }], take: 200 }),
  ]);

  if (!project) notFound();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="Project Engine"
        title="Cost Ledger"
        subtitle="Manual and source-linked cost entries for project-level control."
        backHref={`/projects/${projectId}/profitability`}
      />

      <SectionCard title="Create Ledger Entry">
        <form action={createProjectCostLedgerEntry} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Source Type" name="sourceType" required placeholder="PO / BILL / MANUAL / SUBCONTRACT" />
          <Field label="Source ID" name="sourceId" />
          <Field label="Category" name="category" required placeholder="Material / Labor / Logistics" />
          <Field label="Cost Type" name="costType" required placeholder="COMMITTED / ACTUAL" />
          <Field label="Amount" name="amount" type="number" min="0" step="0.01" required />
          <Field label="GST Amount" name="gstAmount" type="number" min="0" step="0.01" />
          <Field label="Status" name="status" required defaultValue="POSTED" />
          <Field label="Incurred Date" name="incurredDate" type="date" required />
          <label className="sm:col-span-2 lg:col-span-4">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Description</span>
            <textarea name="description" required rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
          </label>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <ActionButton type="submit">Create Entry</ActionButton>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Ledger Table">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-neutral-500">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Source</th>
                <th className="py-3 pr-4">Description</th>
                <th className="py-3 pr-4">Category</th>
                <th className="py-3 pr-4">Cost Type</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">GST</th>
                <th className="py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-4 text-neutral-700">{row.incurredDate.toLocaleDateString()}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.sourceType}{row.sourceId ? ` (${row.sourceId})` : ""}</td>
                  <td className="py-3 pr-4 text-neutral-900">{row.description}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.category}</td>
                  <td className="py-3 pr-4 text-neutral-700">{row.costType}</td>
                  <td className="py-3 pr-4 text-neutral-700">{money(row.amount)}</td>
                  <td className="py-3 pr-4 text-neutral-700">{money(row.gstAmount)}</td>
                  <td className="py-3 text-neutral-900 font-semibold">{money(row.totalAmount)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-neutral-500">No ledger entries yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </main>
  );
}

function money(v: { toString(): string } | number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(Number(v.toString()));
}

function Field(props: { label: string; name: string; required?: boolean; placeholder?: string; type?: string; min?: string; step?: string; defaultValue?: string }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <input
        name={props.name}
        required={props.required}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        min={props.min}
        step={props.step}
        defaultValue={props.defaultValue}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}
