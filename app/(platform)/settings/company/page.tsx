import "server-only";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { requireExecutive } from "@/lib/rbac/executive";
import { getCompanySetting } from "@/lib/settings/service";
import { getCompanyBranding } from "@/lib/branding";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { ProposalCoverPage } from "@/app/components/proposal/proposal-cover-page";
import { updateCompanyProfileAction } from "@/app/(platform)/settings/company/actions";
import { LogoUploadField } from "@/app/(platform)/settings/company/logo-upload-field";

export const dynamic = "force-dynamic";

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm",
        "placeholder:text-neutral-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-950 shadow-sm",
        "placeholder:text-neutral-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-neutral-900">{props.label}</p>
        {props.hint ? <p className="mt-1 text-xs leading-5 text-neutral-500">{props.hint}</p> : null}
      </div>
      {props.children}
    </div>
  );
}

export default async function CompanySettingsPage() {
  await requireExecutive();

  const [company, branding] = await Promise.all([getCompanySetting(), getCompanyBranding()]);

  const preview = {
    title: "Luxury Renovation Proposal",
    subtitle: "A curated concept, material direction, and investment plan for your home.",
    addressedTo: "Client Name",
    projectName: "Sample Project",
    projectAddress: "Singapore",
    dateLabel: new Intl.DateTimeFormat("en-SG", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date()),
  };

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Company Profile"
        subtitle="Branding, identity and company details used across proposals, public links, and client portal surfaces."
        backHref="/settings"
        backLabel="Settings"
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Profile & Branding"
          description="These values are stored in the database and used immediately in client-facing documents."
        >
          <form action={updateCompanyProfileAction} className="space-y-6" encType="multipart/form-data">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company Name" hint="Shown on proposal covers and client portal.">
                <Input name="companyName" defaultValue={company.companyName} required />
              </Field>
              <Field label="Website">
                <Input name="website" defaultValue={company.website} placeholder="https://example.com" required />
              </Field>
              <Field label="Legal Name" hint="Optional legal entity name for contracts/invoices.">
                <Input name="legalName" defaultValue={company.legalName ?? ""} placeholder="Buildy Pte Ltd" />
              </Field>
              <Field label="UEN" hint="Optional. Printed on invoices/contract headers if present.">
                <Input name="uen" defaultValue={company.uen ?? ""} placeholder="2019XXXXXXZ" />
              </Field>
              <Field label="Registered Address" hint="Optional. Used on invoices/contract headers.">
                <Input name="registeredAddress" defaultValue={company.registeredAddress ?? ""} placeholder="Singapore" />
              </Field>
              <Field label="Brand Color" hint="Hex color used for accents in proposals.">
                <Input name="brandColor" defaultValue={company.brandColor} placeholder="#111827" required />
              </Field>
              <Field label="Accent Color" hint="Secondary tone used in editorial gradients.">
                <Input name="accentColor" defaultValue={company.accentColor} placeholder="#78716C" required />
              </Field>
              <Field label="Contact Email">
                <Input name="contactEmail" defaultValue={company.contactEmail} placeholder="hello@company.com" required />
              </Field>
              <Field label="Contact Phone">
                <Input name="contactPhone" defaultValue={company.contactPhone} placeholder="+65 ..." required />
              </Field>
            </div>

            <Field
              label="Company Logo"
              hint="Upload a logo file to replace the old hardcoded brand asset. A text fallback is used automatically if no logo is saved."
            >
              <LogoUploadField companyName={company.companyName} currentLogoUrl={company.logoUrl ?? null} />
            </Field>

            <div className="grid gap-4">
              <Field label="Company Intro" hint="Short editorial paragraph used in proposals and cover contact card.">
                <Textarea name="companyIntro" defaultValue={company.companyIntro} rows={4} required />
              </Field>
              <Field label="Portfolio Summary" hint="High-level services and portfolio positioning.">
                <Textarea name="portfolioSummary" defaultValue={company.portfolioSummary} rows={4} required />
              </Field>
              <Field label="Why Choose Us (Optional)" hint="Used in premium proposal sections when enabled by theme.">
                <Textarea name="whyChooseUsText" defaultValue={company.whyChooseUsText ?? ""} rows={4} />
              </Field>
            </div>

            <div className="flex items-center justify-end">
              <ActionButton type="submit" variant="primary">
                Save Changes
              </ActionButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Live Preview" description="Client-facing cover preview using your current settings.">
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-stone-50 p-3">
              <ProposalCoverPage
                branding={branding}
                title={preview.title}
                subtitle={preview.subtitle}
                addressedTo={preview.addressedTo}
                projectName={preview.projectName}
                projectAddress={preview.projectAddress}
                dateLabel={preview.dateLabel}
              />
            </div>
            <p className="text-xs leading-6 text-neutral-600">
              Preview updates after saving. Proposal theme can be adjusted under{" "}
              <a className="font-semibold text-neutral-900 underline" href="/settings/proposal">
                Proposal Theme
              </a>
              .
            </p>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
