import type { CompanyBranding } from "@/lib/branding";
import { ProposalCoverPage } from "@/app/components/proposal/proposal-cover-page";
import { ProposalDesignConcept } from "@/app/components/proposal/proposal-design-concept";
import { ProposalAreaBreakdown, type ProposalArea } from "@/app/components/proposal/proposal-area-breakdown";
import { ProposalFFESection, type ProposalFFEItem } from "@/app/components/proposal/proposal-ffe-section";
import { ProposalBOQSummary, type ProposalBoqAreaRow } from "@/app/components/proposal/proposal-boq-summary";
import { ProposalInvestmentSummary } from "@/app/components/proposal/proposal-investment-summary";
import { ProposalSection } from "@/app/components/proposal/proposal-section";
import { ProposalNextSteps } from "@/app/components/proposal/proposal-next-steps";
import { ProposalSignatureCTA } from "@/app/components/proposal/proposal-signature-cta";

export type ProposalPresentationData = {
  branding: CompanyBranding;
  title: string;
  subtitle?: string;
  addressedTo: string;
  projectName: string;
  projectAddress: string;
  dateLabel: string;
  heroImageUrl?: string | null;

  designConceptText: string;
  roomNarrativeText?: string | null;
  materialExplanationText?: string | null;
  budgetExplanationText?: string | null;
  whyChooseUsText?: string | null;
  upsellPitchText?: string | null;
  nextStepsText?: string | null;

  areas: ProposalArea[];
  ffeItems: ProposalFFEItem[];
  boqRows: ProposalBoqAreaRow[];
  preliminaryBuild: number;
  ffeAllowance: number;
  quotationTotal: number | null;

  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  includeWhyChooseUs?: boolean;
};

export function ProposalPresentation(props: {
  data: ProposalPresentationData;
  mode: "print" | "portal" | "public";
}) {
  const d = props.data;
  const theme = d.branding.proposalTheme;

  return (
    <div className="space-y-8">
      <ProposalCoverPage
        branding={d.branding}
        title={d.title}
        subtitle={d.subtitle}
        addressedTo={d.addressedTo}
        projectName={d.projectName}
        projectAddress={d.projectAddress}
        dateLabel={d.dateLabel}
        heroImageUrl={d.heroImageUrl}
      />

      <ProposalDesignConcept text={d.designConceptText} />

      {d.roomNarrativeText?.trim() ? (
        <ProposalSection eyebrow="Narrative" title="Room-by-room narrative" subtitle="A concise story for each space and how it supports daily life.">
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{d.roomNarrativeText}</p>
        </ProposalSection>
      ) : null}

      {d.materialExplanationText?.trim() ? (
        <ProposalSection eyebrow="Materials" title="Materials and finishes" subtitle="Performance-driven selections that protect the concept and withstand daily use.">
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{d.materialExplanationText}</p>
        </ProposalSection>
      ) : null}

      <ProposalAreaBreakdown areas={d.areas} />

      <ProposalFFESection items={d.ffeItems} />

      <ProposalBOQSummary rows={d.boqRows} />

      <ProposalInvestmentSummary
        preliminaryBuild={d.preliminaryBuild}
        ffeAllowance={d.ffeAllowance}
        quotationTotal={d.quotationTotal}
        notes={d.budgetExplanationText ?? null}
      />

      {d.upsellPitchText?.trim() ? (
        <ProposalSection eyebrow="Upgrades" title="Optional upgrades" subtitle="Add-ons that elevate comfort, quality, and long-term value.">
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{d.upsellPitchText}</p>
        </ProposalSection>
      ) : null}

      {theme.showPortfolio ? (
        <ProposalSection
          eyebrow="Portfolio"
          title="Experience and approach"
          subtitle="A concise snapshot of what we deliver and how we manage the process."
          avoidBreakInside
        >
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">{d.branding.portfolioSummary}</p>
        </ProposalSection>
      ) : null}

      {theme.showWhyChooseUs && d.includeWhyChooseUs !== false ? (
        <ProposalSection
          eyebrow="Why choose us"
          title="Controls, craftsmanship and communication"
          subtitle="Designed to be buildable. Documented from scope to delivery."
        >
          <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">
            {(d.whyChooseUsText?.trim() ? d.whyChooseUsText : d.branding.whyChooseUsText) ?? ""}
          </p>
        </ProposalSection>
      ) : null}

      {theme.showNextSteps ? <ProposalNextSteps text={d.nextStepsText ?? null} /> : null}

      <ProposalSignatureCTA branding={d.branding} primaryCta={d.primaryCta} secondaryCta={d.secondaryCta} />
    </div>
  );
}
