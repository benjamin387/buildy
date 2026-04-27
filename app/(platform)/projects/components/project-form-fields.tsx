import { ProjectStatus, PropertyType } from "@prisma/client";

function toDateInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export type ProjectFormDefaults = {
  projectCode?: string | null;
  status?: ProjectStatus;
  name?: string;
  projectType?: string;
  clientName?: string;
  clientCompany?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  siteAddress?: string;
  postalCode?: string | null;
  propertyType?: PropertyType;
  unitSizeSqft?: number | null;
  contractValue?: number;
  revisedContractValue?: number;
  estimatedCost?: number;
  committedCost?: number;
  actualCost?: number;
  startDate?: Date | null;
  targetCompletionDate?: Date | null;
  actualCompletionDate?: Date | null;
  notes?: string | null;
};

export function ProjectFormFields(props: {
  defaults?: ProjectFormDefaults;
  includeActualCompletionDate?: boolean;
}) {
  const d = props.defaults ?? {};

  return (
    <>
      <Section
        title="Basic Info"
        description="Project identity and type. Project code can be generated automatically."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project Code (optional)">
            <input
              name="projectCode"
              defaultValue={d.projectCode ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="PRJ-20260423-XXXXXX"
            />
          </Field>

          <Field label="Status">
            <select
              name="status"
              defaultValue={d.status ?? ProjectStatus.LEAD}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value={ProjectStatus.LEAD}>Lead</option>
              <option value={ProjectStatus.QUOTING}>Quoting</option>
              <option value={ProjectStatus.CONTRACTED}>Contracted</option>
              <option value={ProjectStatus.IN_PROGRESS}>In Progress</option>
              <option value={ProjectStatus.ON_HOLD}>On Hold</option>
              <option value={ProjectStatus.COMPLETED}>Completed</option>
              <option value={ProjectStatus.CANCELLED}>Cancelled</option>
            </select>
          </Field>

          <Field label="Project Name" className="sm:col-span-2">
            <input
              name="name"
              required
              defaultValue={d.name ?? ""}
              className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="E.g. Tanjong Pagar Condo Renovation"
            />
          </Field>

          <Field label="Project Type">
            <select
              name="projectType"
              defaultValue={d.projectType ?? "RESIDENTIAL"}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="OFFICE">Office</option>
              <option value="RETAIL">Retail</option>
              <option value="A_AND_A">A&amp;A</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Client Info" description="Client contact details for project coordination.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client Name">
            <input
              name="clientName"
              required
              defaultValue={d.clientName ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Client name"
            />
          </Field>

          <Field label="Client Company">
            <input
              name="clientCompany"
              defaultValue={d.clientCompany ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Company (optional)"
            />
          </Field>

          <Field label="Client Email">
            <input
              name="clientEmail"
              type="email"
              defaultValue={d.clientEmail ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="client@email.com"
            />
          </Field>

          <Field label="Client Phone">
            <input
              name="clientPhone"
              defaultValue={d.clientPhone ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="+65 ..."
            />
          </Field>
        </div>
      </Section>

      <Section title="Site Info" description="Site address and property attributes (legacy-compatible).">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Site Address" className="sm:col-span-2">
            <input
              name="siteAddress"
              required
              defaultValue={d.siteAddress ?? ""}
              className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Full site address"
            />
          </Field>

          <Field label="Postal Code">
            <input
              name="postalCode"
              defaultValue={d.postalCode ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Postal"
            />
          </Field>

          <Field label="Property Type">
            <select
              name="propertyType"
              required
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              defaultValue={d.propertyType ?? "CONDO"}
            >
              <option value="HDB">HDB</option>
              <option value="CONDO">Condo</option>
              <option value="LANDED">Landed</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          <Field label="Unit Size (sqft)">
            <input
              name="unitSizeSqft"
              type="number"
              min={0}
              step="1"
              defaultValue={d.unitSizeSqft ?? 0}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="980"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Commercial Snapshot"
        description="These values drive projected profit and later P&L tracking."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyField name="contractValue" label="Contract Value (excl GST)" defaultValue={d.contractValue ?? 0} />
          <MoneyField
            name="revisedContractValue"
            label="Revised Contract Value (excl GST)"
            defaultValue={d.revisedContractValue ?? 0}
          />
          <MoneyField name="estimatedCost" label="Estimated Cost" defaultValue={d.estimatedCost ?? 0} />
          <MoneyField name="committedCost" label="Committed Cost" defaultValue={d.committedCost ?? 0} />
          <MoneyField name="actualCost" label="Actual Cost" defaultValue={d.actualCost ?? 0} />
        </div>
      </Section>

      <Section title="Timeline" description="Planned start and target completion.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start Date">
            <input
              name="startDate"
              type="date"
              defaultValue={toDateInputValue(d.startDate)}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
          </Field>
          <Field label="Target Completion Date">
            <input
              name="targetCompletionDate"
              type="date"
              defaultValue={toDateInputValue(d.targetCompletionDate)}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
          </Field>
          {props.includeActualCompletionDate ? (
            <Field label="Actual Completion Date" className="sm:col-span-2">
              <input
                name="actualCompletionDate"
                type="date"
                defaultValue={toDateInputValue(d.actualCompletionDate)}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              />
            </Field>
          ) : null}
        </div>
      </Section>

      <Section title="Notes" description="Internal notes for this project.">
        <Field label="Notes">
          <textarea
            name="notes"
            rows={4}
            defaultValue={d.notes ?? ""}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
            placeholder="Notes (optional)"
          />
        </Field>
      </Section>
    </>
  );
}

function Section(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
        <p className="mt-1 text-sm text-neutral-600">{props.description}</p>
      </div>
      {props.children}
    </section>
  );
}

function Field(props: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid gap-2 text-sm ${props.className ?? ""}`}>
      <span className="font-medium text-neutral-800">{props.label}</span>
      {props.children}
    </label>
  );
}

function MoneyField(props: { name: string; label: string; defaultValue: number }) {
  return (
    <Field label={props.label}>
      <input
        name={props.name}
        type="number"
        min={0}
        step="0.01"
        defaultValue={props.defaultValue}
        className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
      />
    </Field>
  );
}

