import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertyType } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { updateDesignBrief } from "@/app/(platform)/design-ai/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";

const propertyTypes = Object.values(PropertyType);

export default async function EditDesignBriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const { id } = await params;
  const brief = await prisma.designBrief.findUnique({
    where: { id },
  });

  if (!brief) notFound();

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : "";

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="Edit Design Brief"
        subtitle="Update the client and property inputs used by the AI design workflow."
        backHref={`/design-ai/briefs/${brief.id}`}
      />

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </section>
      ) : null}

      <form action={updateDesignBrief} className="space-y-6">
        <input type="hidden" name="briefId" value={brief.id} />

        <SectionCard title="Client Information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client Name" name="clientName" required defaultValue={brief.clientName ?? ""} />
            <Field label="Client Phone" name="clientPhone" defaultValue={brief.clientPhone ?? ""} />
            <Field label="Client Email" name="clientEmail" type="email" defaultValue={brief.clientEmail ?? ""} />
            <SelectField label="Property Type" name="propertyType" required options={propertyTypes} defaultValue={brief.propertyType} />
          </div>
        </SectionCard>

        <SectionCard title="Project Parameters">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Property Address"
              name="propertyAddress"
              required
              className="sm:col-span-2"
              defaultValue={brief.propertyAddress ?? ""}
            />
            <Field
              label="Floor Area"
              name="floorArea"
              inputMode="decimal"
              placeholder="e.g. 1200.5"
              defaultValue={brief.floorArea ?? ""}
            />
            <Field
              label="Rooms"
              name="rooms"
              inputMode="numeric"
              placeholder="e.g. 4"
              defaultValue={brief.rooms ?? ""}
            />
            <Field
              label="Budget Min"
              name="budgetMin"
              type="number"
              step="0.01"
              min="0"
              defaultValue={toInputValue(brief.budgetMin)}
            />
            <Field
              label="Budget Max"
              name="budgetMax"
              type="number"
              step="0.01"
              min="0"
              defaultValue={toInputValue(brief.budgetMax)}
            />
            <Field
              label="Timeline"
              name="timeline"
              placeholder="e.g. 12 weeks"
              defaultValue={brief.timeline ?? ""}
            />
            <TextAreaField
              label="Requirements"
              name="requirements"
              required
              className="sm:col-span-2"
              defaultValue={brief.requirements ?? ""}
            />
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href={`/design-ai/briefs/${brief.id}`}>
            <ActionButton type="button" variant="secondary">
              Cancel
            </ActionButton>
          </Link>
          <ActionButton type="submit">Save Changes</ActionButton>
        </div>
      </form>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  step?: string;
  min?: string;
  defaultValue?: string;
  inputMode?: "text" | "email" | "decimal" | "numeric";
}) {
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
        defaultValue={props.defaultValue}
        inputMode={props.inputMode}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function TextAreaField(props: {
  label: string;
  name: string;
  required?: boolean;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <textarea
        name={props.name}
        required={props.required}
        rows={5}
        defaultValue={props.defaultValue}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  name: string;
  required?: boolean;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</span>
      <select
        name={props.name}
        required={props.required}
        defaultValue={props.defaultValue}
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

function toInputValue(value: { toString(): string } | number | null): string {
  if (value === null) return "";
  return value.toString();
}
