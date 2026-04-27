import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { CompanySetting, NotificationSetting, ProposalThemeSetting } from "@prisma/client";

const COMPANY_DEFAULTS: Pick<
  CompanySetting,
  | "id"
  | "companyName"
  | "brandColor"
  | "accentColor"
  | "contactEmail"
  | "contactPhone"
  | "website"
  | "companyIntro"
  | "portfolioSummary"
  | "gstRegistered"
  | "gstRate"
> = {
  id: "default",
  companyName: "Buildy Pte Ltd",
  brandColor: "#111827",
  accentColor: "#78716C",
  contactEmail: "hello@app.buildy.sg",
  contactPhone: "+65 0000 0000",
  website: "https://app.buildy.sg",
  companyIntro:
    "We design and build thoughtfully considered interior spaces, combining refined aesthetics with practical detailing and disciplined project controls.",
  portfolioSummary:
    "Residential renovation (HDB, condo, landed) and commercial fit-out delivered with structured scope control, transparent documentation, and long-term aftercare.",
  gstRegistered: true,
  gstRate: new Prisma.Decimal("0.09"),
};

const NOTIFICATION_DEFAULTS: Pick<NotificationSetting, "id" | "emailFromName"> = {
  id: "default",
  emailFromName: "Buildy",
};

const PROPOSAL_THEME_DEFAULTS: Pick<
  ProposalThemeSetting,
  | "id"
  | "themeName"
  | "coverStyle"
  | "fontStyle"
  | "primaryColor"
  | "secondaryColor"
  | "showCompanyIntro"
  | "showPortfolio"
  | "showWhyChooseUs"
  | "showNextSteps"
> = {
  id: "default",
  themeName: "Luxury Editorial",
  coverStyle: "EDITORIAL_HERO",
  fontStyle: "SERIF_HEADINGS",
  primaryColor: "#111827",
  secondaryColor: "#78716C",
  showCompanyIntro: true,
  showPortfolio: true,
  showWhyChooseUs: true,
  showNextSteps: true,
};

async function safeFindOrCreateCompanySetting(): Promise<CompanySetting> {
  const existing = await prisma.companySetting.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.companySetting.create({ data: COMPANY_DEFAULTS as any });
}

async function safeFindOrCreateNotificationSetting(): Promise<NotificationSetting> {
  const existing = await prisma.notificationSetting.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.notificationSetting.create({ data: NOTIFICATION_DEFAULTS as any });
}

async function safeFindOrCreateProposalThemeSetting(): Promise<ProposalThemeSetting> {
  const existing = await prisma.proposalThemeSetting.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.proposalThemeSetting.create({ data: PROPOSAL_THEME_DEFAULTS });
}

export const getCompanySetting = cache(async (): Promise<CompanySetting> => {
  try {
    return await safeFindOrCreateCompanySetting();
  } catch {
    // Fail-soft for production readiness. Uses schema defaults.
    return COMPANY_DEFAULTS as unknown as CompanySetting;
  }
});

export const getNotificationSetting = cache(async (): Promise<NotificationSetting> => {
  try {
    return await safeFindOrCreateNotificationSetting();
  } catch {
    return NOTIFICATION_DEFAULTS as unknown as NotificationSetting;
  }
});

export const getProposalThemeSetting = cache(async (): Promise<ProposalThemeSetting> => {
  try {
    return await safeFindOrCreateProposalThemeSetting();
  } catch {
    return PROPOSAL_THEME_DEFAULTS as unknown as ProposalThemeSetting;
  }
});
