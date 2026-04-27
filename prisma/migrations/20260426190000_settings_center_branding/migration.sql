-- Settings Center: branding / proposal theme / notifications
-- Safe, incremental tables. Singleton pattern uses id='default'.

CREATE TABLE IF NOT EXISTS "CompanySetting" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "companyName" TEXT NOT NULL DEFAULT 'Buildy Pte Ltd',
  "legalName" TEXT,
  "uen" TEXT,
  "logoUrl" TEXT,
  "brandColor" TEXT NOT NULL DEFAULT '#111827',
  "accentColor" TEXT NOT NULL DEFAULT '#78716C',
  "contactEmail" TEXT NOT NULL DEFAULT 'hello@app.buildy.sg',
  "contactPhone" TEXT NOT NULL DEFAULT '+65 0000 0000',
  "website" TEXT NOT NULL DEFAULT 'https://app.buildy.sg',
  "registeredAddress" TEXT,
  "companyIntro" TEXT NOT NULL DEFAULT 'We design and build thoughtfully considered interior spaces, combining refined aesthetics with practical detailing and disciplined project controls.',
  "portfolioSummary" TEXT NOT NULL DEFAULT 'Residential renovation (HDB, condo, landed) and commercial fit-out delivered with structured scope control, transparent documentation, and long-term aftercare.',
  "whyChooseUsText" TEXT,
  "gstRegistered" BOOLEAN NOT NULL DEFAULT TRUE,
  "gstRate" NUMERIC(5,4) NOT NULL DEFAULT 0.09,
  "defaultPaymentTerms" TEXT,
  "paymentInstructions" TEXT,
  "bankName" TEXT,
  "bankAccountName" TEXT,
  "bankAccountNumber" TEXT,
  "paynowUen" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "NotificationSetting" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "emailFromName" TEXT DEFAULT 'Buildy',
  "emailFromAddress" TEXT,
  "whatsappSenderLabel" TEXT,
  "defaultReplyToEmail" TEXT,
  "defaultSalesPhone" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ProposalThemeSetting" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "themeName" TEXT NOT NULL DEFAULT 'Luxury Editorial',
  "coverStyle" TEXT NOT NULL DEFAULT 'EDITORIAL_HERO',
  "fontStyle" TEXT NOT NULL DEFAULT 'SERIF_HEADINGS',
  "primaryColor" TEXT NOT NULL DEFAULT '#111827',
  "secondaryColor" TEXT NOT NULL DEFAULT '#78716C',
  "showCompanyIntro" BOOLEAN NOT NULL DEFAULT TRUE,
  "showPortfolio" BOOLEAN NOT NULL DEFAULT TRUE,
  "showWhyChooseUs" BOOLEAN NOT NULL DEFAULT TRUE,
  "showNextSteps" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

