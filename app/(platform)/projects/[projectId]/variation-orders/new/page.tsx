import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { createVariationOrder } from "@/app/(platform)/projects/[projectId]/profitability/actions";

export default async function NewProjectVariationOrderPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requirePermission({ permission: Permission.QUOTE_WRITE, projectId });

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="Project Engine"
        title="New Variation Order"
        subtitle="Create a variation order draft and send it to approval/invoicing flow."
        backHref={`/projects/${projectId}/variation-orders`}
      />

      <SectionCard title="Variation Inputs">
        <form action={createVariationOrder} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Title" name="title" required />
          <Field label="Reason" name="reason" />
          <Field label="Quotation ID (optional)" name="quotationId" />
          <Field label="Unit" name="unit" defaultValue="lot" />
          <Field label="Quantity" name="quantity" type="number" step="0.01" min="0" defaultValue="1" required />
          <Field label="Selling Unit Price" name="unitPrice" type="number" step="0.01" min="0" required />
          <Field label="Cost Unit Price" name="costPrice" type="number" step="0.01" min="0" required />
          <label className="sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Description</span>
            <textarea name="description" rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <ActionButton type="submit">Create Variation Order</ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

function Field(props: { label: string; name: string; required?: boolean; type?: string; step?: string; min?: string; defaultValue?: string }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <input
        name={props.name}
        required={props.required}
        type={props.type ?? "text"}
        step={props.step}
        min={props.min}
        defaultValue={props.defaultValue}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}
