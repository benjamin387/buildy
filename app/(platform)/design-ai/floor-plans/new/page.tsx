import { requireUser } from "@/lib/auth/session";
import { getDefaultMockFloorPlanId } from "@/lib/design-ai/floor-plan-engine";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { LinkButton } from "@/app/(platform)/design-ai/floor-plans/_components/link-button";

const propertyTypes = ["Condominium", "HDB", "Landed", "Penthouse", "Commercial"];

export default async function NewFloorPlanPage() {
  await requireUser();

  const samplePlanId = getDefaultMockFloorPlanId();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title="New Floor Plan Intake"
        subtitle="Upload a floor plan visually for the upcoming AI parsing workflow. This prototype does not persist or process files yet."
        backHref="/design-ai/floor-plans"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <SectionCard title="Project and File Intake" description="Capture the front-of-house details before the live parser is connected.">
          <form className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Name" name="projectName" placeholder="e.g. Marina Bay Residence" />
              <Field label="Client Name" name="clientName" placeholder="e.g. Tan Family" />
              <SelectField label="Property Type" name="propertyType" options={propertyTypes} />
              <Field label="Site / Unit" name="siteLabel" placeholder="e.g. Tower B, Level 18" />
              <Field label="Floor Area" name="floorArea" placeholder="e.g. 1,420 sqft" />
              <Field label="Target Style" name="targetStyle" placeholder="e.g. Warm modern luxury" />
              <TextAreaField
                label="Planning Notes"
                name="planningNotes"
                className="sm:col-span-2"
                placeholder="Capture any room priorities, existing site constraints, or client instructions."
              />
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Floor Plan File
              </span>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8">
                <div className="max-w-2xl">
                  <p className="text-base font-semibold text-neutral-950">
                    Upload PDF, image, or CAD export
                  </p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">
                    The uploader is visual only in this first pass. Files are not stored, parsed, or sent to any downstream service yet.
                  </p>
                </div>
                <input
                  type="file"
                  name="floorPlanFile"
                  accept=".pdf,.png,.jpg,.jpeg,.dwg"
                  className="mt-5 block w-full max-w-xl text-sm text-neutral-700 file:mr-4 file:rounded-xl file:border-0 file:bg-neutral-950 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-neutral-900"
                />
              </div>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <LinkButton href="/design-ai/floor-plans" variant="secondary">
                Cancel
              </LinkButton>
              <LinkButton href={`/design-ai/floor-plans/${samplePlanId}`}>
                Open Sample Analysis
              </LinkButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Prototype Notes" description="Scope kept intentionally small for safe rollout.">
          <div className="space-y-4 text-sm text-neutral-700">
            <InfoBlock
              title="What works now"
              body="The module supports route navigation, visual intake, and a full mock review surface for rooms, palette, prompts, carpentry, and workflow planning."
            />
            <InfoBlock
              title="What is deferred"
              body="Real uploads, OCR or CAD parsing, persistence, permissions beyond the existing platform guard, and any pricing or proposal integrations."
            />
            <InfoBlock
              title="Suggested next hook"
              body="Connect the file intake to a parser service and replace the sample record lookup with generated plan sessions."
            />
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

function Field(props: { label: string; name: string; placeholder?: string }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {props.label}
      </span>
      <input
        name={props.name}
        type="text"
        placeholder={props.placeholder}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SelectField(props: { label: string; name: string; options: string[] }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {props.label}
      </span>
      <select
        name={props.name}
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

function TextAreaField(props: { label: string; name: string; placeholder?: string; className?: string }) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {props.label}
      </span>
      <textarea
        name={props.name}
        rows={5}
        placeholder={props.placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function InfoBlock(props: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <p className="mt-1 leading-6 text-neutral-600">{props.body}</p>
    </div>
  );
}
