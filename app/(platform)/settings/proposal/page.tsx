import "server-only";

import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { requireExecutive } from "@/lib/rbac/executive";
import { getProposalThemeSetting, getCompanySetting } from "@/lib/settings/service";
import { getCompanyBranding } from "@/lib/branding";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { ProposalCoverPage } from "@/app/components/proposal/proposal-cover-page";
import { updateProposalThemeAction } from "@/app/(platform)/settings/proposal/actions";

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

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm",
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

export default async function ProposalThemeSettingsPage() {
  await requireExecutive();

  const [theme, company, branding] = await Promise.all([
    getProposalThemeSetting(),
    getCompanySetting(),
    getCompanyBranding(),
  ]);

  const preview = {
    title: "Design Presentation",
    subtitle: "Concept narrative, room-by-room proposal, and investment summary.",
    addressedTo: "Client Name",
    projectName: "Sample Project",
    projectAddress: company.registeredAddress ?? "Singapore",
    dateLabel: new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(new Date()),
  };

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Proposal Theme"
        subtitle="Control proposal/presentation look-and-feel, section visibility, and brand colors."
        backHref="/settings"
        backLabel="Settings"
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Theme Controls" description="These controls affect proposal cover styling and which narrative sections are shown.">
          <form action={updateProposalThemeAction} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Theme name">
                <Input name="themeName" defaultValue={theme.themeName} required />
              </Field>
              <Field label="Cover style">
                <Select name="coverStyle" defaultValue={theme.coverStyle}>
                  <option value="EDITORIAL_HERO">Editorial Hero</option>
                  <option value="MINIMAL">Minimal</option>
                </Select>
              </Field>
              <Field label="Font style">
                <Select name="fontStyle" defaultValue={theme.fontStyle}>
                  <option value="SERIF_HEADINGS">Serif Headings</option>
                  <option value="SANS_SERIF">Sans Serif</option>
                </Select>
              </Field>
              <Field label="Primary color" hint="Hex or CSS color used for headings and gradients.">
                <Input name="primaryColor" defaultValue={theme.primaryColor} placeholder="#111827" required />
              </Field>
              <Field label="Secondary color" hint="Used for subtle editorial accent gradients.">
                <Input name="secondaryColor" defaultValue={theme.secondaryColor} placeholder="#78716C" required />
              </Field>
            </div>

            <div className="rounded-xl border border-slate-200 bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Visibility</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <input type="checkbox" name="showCompanyIntro" defaultChecked={theme.showCompanyIntro} className="h-4 w-4" />
                  <span className="text-sm font-semibold text-neutral-900">Show company intro</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <input type="checkbox" name="showPortfolio" defaultChecked={theme.showPortfolio} className="h-4 w-4" />
                  <span className="text-sm font-semibold text-neutral-900">Show portfolio summary</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <input type="checkbox" name="showWhyChooseUs" defaultChecked={theme.showWhyChooseUs} className="h-4 w-4" />
                  <span className="text-sm font-semibold text-neutral-900">Show why choose us</span>
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <input type="checkbox" name="showNextSteps" defaultChecked={theme.showNextSteps} className="h-4 w-4" />
                  <span className="text-sm font-semibold text-neutral-900">Show next steps</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <ActionButton type="submit" variant="primary">
                Save Theme
              </ActionButton>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Cover Preview" description="A live preview of the cover page using your current theme and branding.">
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
        </SectionCard>
      </div>
    </main>
  );
}
