import type {
  CondoType,
  DesignStyle,
  HdbType,
  LandedType,
  LeadStatus,
  PropertyType,
  ProjectType,
  PropertyCategory,
  ResidentialPropertyType,
} from "@prisma/client";

export type LeadFormDefaults = {
  leadNumber?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  marketingSource?: string | null;
  status?: LeadStatus | null;
  assignedSalesName?: string | null;
  assignedSalesEmail?: string | null;
  projectAddress?: string | null;
  projectType?: ProjectType | null;
  propertyType?: PropertyType | null;
  propertyAddress?: string | null;
  estimatedBudget?: number | null;
  preferredStartDate?: Date | null;
  remarks?: string | null;
  propertyCategory?: PropertyCategory | null;
  residentialPropertyType?: ResidentialPropertyType | null;
  hdbType?: HdbType | null;
  condoType?: CondoType | null;
  landedType?: LandedType | null;
  preferredDesignStyle?: DesignStyle | null;
  requirementSummary?: string | null;
  notes?: string | null;
  nextFollowUpAt?: Date | null;
};

function isoDate(value: Date): string {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function LeadFormFields(props: { defaults?: LeadFormDefaults; showStatus?: boolean }) {
  const d = props.defaults ?? {};
  const showStatus = props.showStatus !== false;
  const nextFollowUp = d.nextFollowUpAt ? isoDate(d.nextFollowUpAt) : "";
  const preferredStartDate = d.preferredStartDate ? isoDate(d.preferredStartDate) : "";

  return (
    <div className="grid gap-6">
      <Section title="Customer Info" description="Who we are speaking with.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead Number (optional)">
            <input
              name="leadNumber"
              defaultValue={d.leadNumber ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Auto-generated if empty"
            />
          </Field>
          <Field label="Marketing Source (optional)">
            <input
              name="marketingSource"
              defaultValue={d.marketingSource ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Instagram, Referral, Walk-in"
            />
          </Field>
          <Field label="Customer Name" required>
            <input
              name="customerName"
              required
              defaultValue={d.customerName ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Full name"
            />
          </Field>
          <Field label="Customer Email (optional)">
            <input
              name="customerEmail"
              type="email"
              defaultValue={d.customerEmail ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="name@email.com"
            />
          </Field>
          <Field label="Customer Phone" required>
            <input
              name="customerPhone"
              required
              defaultValue={d.customerPhone ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="+65..."
            />
          </Field>
          {showStatus ? (
            <Field label="Lead Status">
              <select
                name="status"
                defaultValue={d.status ?? "NEW"}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                <option value="NEW">NEW</option>
                <option value="CONTACTED">CONTACTED</option>
                <option value="QUALIFYING">QUALIFYING</option>
                <option value="SITE_VISIT_SCHEDULED">SITE_VISIT_SCHEDULED</option>
                <option value="QUOTATION_PENDING">QUOTATION_PENDING</option>
                <option value="CONVERTED">CONVERTED</option>
                <option value="LOST">LOST</option>
              </select>
            </Field>
          ) : null}
        </div>
      </Section>

      <Section title="Project Location" description="Where the renovation/design is for.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Project Address" required>
            <input
              name="projectAddress"
              required
              defaultValue={d.projectAddress ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
              placeholder="Full site address"
            />
          </Field>
          <Field label="Property Address (optional)">
            <input
              name="propertyAddress"
              defaultValue={d.propertyAddress ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2 sm:col-span-2"
              placeholder="If different from site address"
            />
          </Field>
          <Field label="Project Type">
            <select
              name="projectType"
              defaultValue={d.projectType ?? "RESIDENTIAL"}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="RESIDENTIAL">RESIDENTIAL</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
            </select>
          </Field>
          <Field label="Property Type (optional)">
            <select
              name="propertyType"
              defaultValue={d.propertyType ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(Not set)</option>
              <option value="HDB">HDB</option>
              <option value="CONDO">CONDO</option>
              <option value="LANDED">LANDED</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
              <option value="OTHER">OTHER</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Property Type" description="Capture property category and type to drive BOQ and scope templates later.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Property Category">
            <select
              name="propertyCategory"
              defaultValue={d.propertyCategory ?? "RESIDENTIAL"}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="RESIDENTIAL">RESIDENTIAL</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
            </select>
          </Field>
          <Field label="Residential Property Type (optional)">
            <select
              name="residentialPropertyType"
              defaultValue={d.residentialPropertyType ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(Not set)</option>
              <option value="HDB">HDB</option>
              <option value="CONDO">CONDO</option>
              <option value="LANDED">LANDED</option>
            </select>
          </Field>
          <Field label="HDB Type (optional)">
            <select
              name="hdbType"
              defaultValue={d.hdbType ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(Not set)</option>
              <option value="ONE_ROOM">ONE_ROOM</option>
              <option value="TWO_ROOM">TWO_ROOM</option>
              <option value="THREE_ROOM">THREE_ROOM</option>
              <option value="FOUR_ROOM">FOUR_ROOM</option>
              <option value="FIVE_ROOM">FIVE_ROOM</option>
              <option value="EXECUTIVE">EXECUTIVE</option>
              <option value="JUMBO">JUMBO</option>
            </select>
          </Field>
          <Field label="Condo Type (optional)">
            <select
              name="condoType"
              defaultValue={d.condoType ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(Not set)</option>
              <option value="CONDOMINIUM">CONDOMINIUM</option>
              <option value="APARTMENT">APARTMENT</option>
              <option value="WALK_UP">WALK_UP</option>
              <option value="CLUSTER_HOUSE">CLUSTER_HOUSE</option>
              <option value="EXECUTIVE_CONDOMINIUM">EXECUTIVE_CONDOMINIUM</option>
            </select>
          </Field>
          <Field label="Landed Type (optional)">
            <select
              name="landedType"
              defaultValue={d.landedType ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(Not set)</option>
              <option value="TERRACED_HOUSE">TERRACED_HOUSE</option>
              <option value="DETACHED_HOUSE">DETACHED_HOUSE</option>
              <option value="SEMI_DETACHED_HOUSE">SEMI_DETACHED_HOUSE</option>
              <option value="CORNER_TERRACE">CORNER_TERRACE</option>
              <option value="BUNGALOW_HOUSE">BUNGALOW_HOUSE</option>
              <option value="GOOD_CLASS_BUNGALOW">GOOD_CLASS_BUNGALOW</option>
              <option value="SHOPHOUSE">SHOPHOUSE</option>
              <option value="LAND_ONLY">LAND_ONLY</option>
              <option value="TOWN_HOUSE">TOWN_HOUSE</option>
              <option value="CONSERVATION_HOUSE">CONSERVATION_HOUSE</option>
              <option value="CLUSTER_HOUSE">CLUSTER_HOUSE</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Design Preference" description="Useful for design team handover and matching portfolio references.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred Design Style (optional)">
            <select
              name="preferredDesignStyle"
              defaultValue={d.preferredDesignStyle ?? ""}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            >
              <option value="">(Not set)</option>
              <option value="MODERN">MODERN</option>
              <option value="MINIMALIST">MINIMALIST</option>
              <option value="INDUSTRIAL">INDUSTRIAL</option>
              <option value="SCANDINAVIAN">SCANDINAVIAN</option>
              <option value="CONTEMPORARY">CONTEMPORARY</option>
              <option value="OTHERS">OTHERS</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Requirements / Notes" description="Capture scope hints, budget, and constraints.">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estimated Budget (optional)">
              <input
                name="estimatedBudget"
                inputMode="decimal"
                defaultValue={d.estimatedBudget ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. 80000"
              />
            </Field>
            <Field label="Preferred Start Date (optional)">
              <input
                name="preferredStartDate"
                type="date"
                defaultValue={preferredStartDate}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              />
            </Field>
          </div>
          <Field label="Requirement Summary (optional)">
            <textarea
              name="requirementSummary"
              rows={3}
              defaultValue={d.requirementSummary ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="e.g. Full kitchen, carpentry, electrical rewiring, timeline"
            />
          </Field>
          <Field label="Remarks (optional)">
            <textarea
              name="remarks"
              rows={2}
              defaultValue={d.remarks ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Customer-facing notes or extra requirements"
            />
          </Field>
          <Field label="Internal Notes (optional)">
            <textarea
              name="notes"
              rows={4}
              defaultValue={d.notes ?? ""}
              className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-400 focus:ring-2"
              placeholder="Any additional info, budget range, preferences, restrictions"
            />
          </Field>
        </div>
      </Section>

      <Section title="Follow-up" description="Keep sales pipeline disciplined.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next Follow-up (optional)">
            <input
              name="nextFollowUpAt"
              type="date"
              defaultValue={nextFollowUp}
              className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
            />
          </Field>
          <Field label="Assigned Sales (name / email) (optional)">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="assignedSalesName"
                defaultValue={d.assignedSalesName ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Name"
              />
              <input
                name="assignedSalesEmail"
                type="email"
                defaultValue={d.assignedSalesEmail ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="Email"
              />
            </div>
          </Field>
        </div>
      </Section>
    </div>
  );
}

function Section(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-950">{props.title}</h2>
      {props.description ? (
        <p className="mt-1 text-sm text-neutral-600">{props.description}</p>
      ) : null}
      <div className="mt-5">{props.children}</div>
    </section>
  );
}

function Field(props: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-neutral-800">
        {props.label} {props.required ? <span className="text-red-600">*</span> : null}
      </span>
      {props.children}
    </label>
  );
}
