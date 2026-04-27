import "server-only";

import { cache } from "react";
import { Prisma } from "@prisma/client";
import { getCompanySetting, getProposalThemeSetting } from "@/lib/settings/service";

export type ProposalTheme = {
  themeName: string;
  coverStyle: string;
  fontStyle: string;
  primaryColor: string;
  secondaryColor: string;
  showCompanyIntro: boolean;
  showPortfolio: boolean;
  showWhyChooseUs: boolean;
  showNextSteps: boolean;
};

export type CompanyBranding = {
  companyName: string;
  legalName: string | null;
  uen: string | null;
  registeredAddress: string | null;
  logoUrl: string | null;
  brandColor: string; // hex or css color
  accentColor: string; // hex or css color
  contactEmail: string;
  contactPhone: string;
  website: string;
  companyIntro: string;
  portfolioSummary: string;
  whyChooseUsText: string | null;
  gstRegistered: boolean;
  gstRate: Prisma.Decimal;
  defaultPaymentTerms: string | null;
  paymentInstructions: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  paynowUen: string | null;
  proposalTheme: ProposalTheme;
};

export const getCompanyBranding = cache(async (): Promise<CompanyBranding> => {
  const [company, theme] = await Promise.all([getCompanySetting(), getProposalThemeSetting()]);

  return {
    companyName: company.companyName,
    legalName: company.legalName ?? null,
    uen: company.uen ?? null,
    registeredAddress: company.registeredAddress ?? null,
    logoUrl: company.logoUrl ?? null,
    brandColor: company.brandColor,
    accentColor: company.accentColor,
    contactEmail: company.contactEmail,
    contactPhone: company.contactPhone,
    website: company.website,
    companyIntro: company.companyIntro,
    portfolioSummary: company.portfolioSummary,
    whyChooseUsText: company.whyChooseUsText ?? null,
    gstRegistered: company.gstRegistered,
    gstRate: company.gstRate,
    defaultPaymentTerms: company.defaultPaymentTerms ?? null,
    paymentInstructions: company.paymentInstructions ?? null,
    bankName: company.bankName ?? null,
    bankAccountName: company.bankAccountName ?? null,
    bankAccountNumber: company.bankAccountNumber ?? null,
    paynowUen: company.paynowUen ?? null,
    proposalTheme: {
      themeName: theme.themeName,
      coverStyle: theme.coverStyle,
      fontStyle: theme.fontStyle,
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      showCompanyIntro: theme.showCompanyIntro,
      showPortfolio: theme.showPortfolio,
      showWhyChooseUs: theme.showWhyChooseUs,
      showNextSteps: theme.showNextSteps,
    },
  };
});

