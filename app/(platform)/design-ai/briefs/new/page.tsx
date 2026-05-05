import Link from "next/link";
import { PropertyType } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { createDesignBrief } from "@/app/(platform)/design-ai/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";

const propertyTypes = Object.values(PropertyType);

export default async function NewDesignBriefPage() {
  await requireUser();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="Create Design Brief"
        subtitle="Capture client and property requirements to generate strategy-ready AI output."
        backHref="/design-ai/briefs"
      />

      <form action={createDesignBrief} className="space-y-6">
        <SectionCard title="Client Information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client Name" name="clientName" required />
            <Field label="Client Phone" name="clientPhone" />
            <Field label="Client Email" name="clientEmail" type="email" />
            <SelectField label="Property Type" name="propertyType" required options={propertyTypes} />
          </div>
        </SectionCard>

        <SectionCard title="Project Parameters">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property Address" name="propertyAddress" required className="sm:col-span-2" />
            <Field label="Floor Area" name="floorArea" placeholder="e.g. 1,200 sqft" />
            <Field label="Rooms" name="rooms" placeholder="e.g. 3 bedrooms, 1 study" />
            <Field label="Budget Min" name="budgetMin" type="number" step="0.01" min="0" />
            <Field label="Budget Max" name="budgetMax" type="number" step="0.01" min="0" />
            <Field label="Preferred Style" name="preferredStyle" placeholder="e.g. Modern Luxe" />
            <Field label="Timeline" name="timeline" placeholder="e.g. 12 weeks" />
            <TextAreaField label="Requirements" name="requirements" required className="sm:col-span-2" />
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/design-ai/briefs">
            <ActionButton variant="secondary">Cancel</ActionButton>
          </Link>
          <ActionButton type="submit">Create Design Brief</ActionButton>
        </div>
      </form>
    </main>
  );
}

function Field(props: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; className?: string; step?: string; min?: string }) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        required={props.required}
        step={props.step}
        min={props.min}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function TextAreaField(props: { label: string; name: string; required?: boolean; className?: string }) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <textarea
        name={props.name}
        required={props.required}
        rows={5}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectField(props: { label: string; name: string; required?: boolean; options: string[] }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <select
        name={props.name}
        required={props.required}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      >
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
