import {
  defaultRenovationSections,
  type BuilderSectionInput,
} from "@/lib/quotation-engine/renovation-default-sections";

export type AiQuotationGenerationInput = {
  prompt: string;
  propertyType: "HDB" | "CONDO" | "LANDED" | "COMMERCIAL" | "OTHER";
  unitSizeSqft: number;
  projectName?: string;
};

export type AiQuotationGenerationResult = {
  projectName: string;
  assumptions: string[];
  sections: BuilderSectionInput[];
};

function cloneDefaultSections(): BuilderSectionInput[] {
  return structuredClone(defaultRenovationSections);
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function estimateFlooringArea(unitSizeSqft: number, factor: number): number {
  return round(unitSizeSqft * factor);
}

function estimateWallPaintingArea(unitSizeSqft: number, factor: number): number {
  return round(unitSizeSqft * factor);
}

function estimateCeilingArea(unitSizeSqft: number, factor: number): number {
  return round(unitSizeSqft * factor);
}

function estimateLightPoints(unitSizeSqft: number, propertyType: AiQuotationGenerationInput["propertyType"]): number {
  const base =
    propertyType === "LANDED" ? 20 : propertyType === "COMMERCIAL" ? 18 : propertyType === "CONDO" ? 12 : 10;

  return Math.max(base, Math.round(unitSizeSqft / 85));
}

function estimatePlumbingPoints(prompt: string): number {
  let points = 2;

  if (includesAny(prompt, ["kitchen"])) {
    points += 2;
  }

  if (includesAny(prompt, ["bathroom", "toilet", "washroom"])) {
    points += 2;
  }

  if (includesAny(prompt, ["two bathroom", "2 bathroom", "dual bath"])) {
    points += 2;
  }

  return points;
}

function estimateCarpentryRun(prompt: string, unitSizeSqft: number): number {
  let ftRun = 8;

  if (includesAny(prompt, ["wardrobe"])) {
    ftRun += 10;
  }

  if (includesAny(prompt, ["kitchen"])) {
    ftRun += 16;
  }

  if (includesAny(prompt, ["tv console", "feature wall"])) {
    ftRun += 8;
  }

  if (unitSizeSqft > 1200) {
    ftRun += 10;
  }

  return ftRun;
}

function updateSection(
  sections: BuilderSectionInput[],
  category: BuilderSectionInput["category"],
  updater: (section: BuilderSectionInput) => BuilderSectionInput,
) {
  const index = sections.findIndex((section) => section.category === category);

  if (index === -1) {
    return;
  }

  sections[index] = updater(sections[index]);
}

function setSingleLineItem(
  section: BuilderSectionInput,
  values: Partial<BuilderSectionInput["lineItems"][number]>,
): BuilderSectionInput {
  const existing = section.lineItems[0];

  return {
    ...section,
    lineItems: [
      {
        ...existing,
        ...values,
      },
    ],
  };
}

export function generateAiRenovationQuotation(
  input: AiQuotationGenerationInput,
): AiQuotationGenerationResult {
  const prompt = input.prompt.trim().toLowerCase();
  const unitSizeSqft = Math.max(input.unitSizeSqft || 0, 300);
  const sections = cloneDefaultSections();

  const isPremium = includesAny(prompt, [
    "luxury",
    "premium",
    "high end",
    "high-end",
    "designer",
    "marble",
    "veneer",
    "quartz",
    "hotel style",
  ]);

  const isBasic = includesAny(prompt, [
    "basic",
    "budget",
    "simple",
    "rental",
    "minimal works",
  ]);

  const isFullRenovation = includesAny(prompt, [
    "full renovation",
    "full reno",
    "complete renovation",
    "whole house",
    "entire unit",
  ]);

  const hasVinyl = includesAny(prompt, ["vinyl"]);
  const hasTile = includesAny(prompt, ["tile", "tiles", "tiled"]);
  const hasFalseCeiling = includesAny(prompt, ["false ceiling", "ceiling cove", "cove light", "bulkhead"]);
  const hasGlass = includesAny(prompt, ["glass", "mirror", "shower screen", "aluminium"]);
  const hasPainting = !includesAny(prompt, ["no painting"]);
  const hasElectrical = !includesAny(prompt, ["no electrical"]);
  const hasPlumbing = includesAny(prompt, ["kitchen", "bathroom", "toilet", "plumbing"]);
  const hasHacking = isFullRenovation || includesAny(prompt, ["hack", "demolish", "demolition", "remove existing"]);
  const hasMasonry = hasTile || includesAny(prompt, ["screed", "masonry", "brick", "wet works"]);
  const hasCarpentry = includesAny(prompt, ["carpentry", "wardrobe", "cabinet", "kitchen", "storage", "tv console"]);
  const hasCleaning = true;

  const flooringRate = hasTile ? (isPremium ? 16.5 : 13.5) : hasVinyl ? (isPremium ? 8.8 : isBasic ? 6.5 : 7.5) : 0;
  const paintingRate = isPremium ? 3.4 : isBasic ? 2.2 : 2.8;
  const ceilingRate = isPremium ? 11.5 : 8.5;
  const lightPointRate = isPremium ? 110 : isBasic ? 70 : 85;
  const plumbingPointRate = isPremium ? 155 : isBasic ? 95 : 120;
  const carpentryRate = isPremium ? 260 : isBasic ? 145 : 180;
  const hackingRate = isPremium ? 8.5 : 6;
  const masonryRate = isPremium ? 5.5 : 4.5;
  const glassRate = isPremium ? 38 : 28;
  const cleaningRate = unitSizeSqft > 1200 ? 780 : unitSizeSqft > 800 ? 580 : 450;

  const flooringQty = hasTile || hasVinyl || isFullRenovation ? estimateFlooringArea(unitSizeSqft, 0.92) : 0;
  const paintingQty = hasPainting ? estimateWallPaintingArea(unitSizeSqft, 2.6) : 0;
  const ceilingQty = hasFalseCeiling ? estimateCeilingArea(unitSizeSqft, 0.68) : 0;
  const electricalQty = hasElectrical ? estimateLightPoints(unitSizeSqft, input.propertyType) : 0;
  const plumbingQty = hasPlumbing ? estimatePlumbingPoints(prompt) : 0;
  const carpentryQty = hasCarpentry ? estimateCarpentryRun(prompt, unitSizeSqft) : 0;
  const hackingQty = hasHacking ? estimateFlooringArea(unitSizeSqft, 0.88) : 0;
  const masonryQty = hasMasonry ? estimateFlooringArea(unitSizeSqft, 0.75) : 0;
  const glassQty = hasGlass ? round(Math.max(unitSizeSqft * 0.06, 18)) : 0;

  updateSection(sections, "HACKING_DEMOLITION", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasHacking,
      },
      {
        description: "Hack and dispose existing finishes and built-ins",
        unit: "sqft",
        quantity: hackingQty,
        unitPrice: hackingRate,
      },
    ),
  );

  updateSection(sections, "MASONRY_WORKS", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasMasonry,
      },
      {
        description: hasTile
          ? "Supply and lay floor/wall tiles with base preparation"
          : "Floor screeding and leveling works",
        unit: "sqft",
        quantity: masonryQty,
        unitPrice: masonryRate,
      },
    ),
  );

  updateSection(sections, "CARPENTRY", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasCarpentry,
      },
      {
        description: isPremium
          ? "Supply and install premium custom carpentry"
          : "Supply and install custom carpentry",
        unit: "ft run",
        quantity: carpentryQty,
        unitPrice: carpentryRate,
      },
    ),
  );

  updateSection(sections, "ELECTRICAL_WORKS", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasElectrical,
      },
      {
        description: "Supply and install lighting / power point",
        unit: "point",
        quantity: electricalQty,
        unitPrice: lightPointRate,
      },
    ),
  );

  updateSection(sections, "PLUMBING_WORKS", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasPlumbing,
      },
      {
        description: "Supply and install plumbing point",
        unit: "point",
        quantity: plumbingQty,
        unitPrice: plumbingPointRate,
      },
    ),
  );

  updateSection(sections, "CEILING_PARTITION", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasFalseCeiling,
      },
      {
        description: "Supply and install gypsum board false ceiling",
        unit: "sqft",
        quantity: ceilingQty,
        unitPrice: ceilingRate,
      },
    ),
  );

  updateSection(sections, "FLOORING", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: flooringQty > 0,
      },
      {
        description: hasTile
          ? "Supply and install floor tiling"
          : "Supply and install vinyl flooring",
        unit: "sqft",
        quantity: flooringQty,
        unitPrice: flooringRate || 7.5,
      },
    ),
  );

  updateSection(sections, "PAINTING_WORKS", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasPainting,
      },
      {
        description: "Paint wall and ceiling surfaces",
        unit: "sqft",
        quantity: paintingQty,
        unitPrice: paintingRate,
      },
    ),
  );

  updateSection(sections, "GLASS_ALUMINIUM", (section) =>
    setSingleLineItem(
      {
        ...section,
        isIncluded: hasGlass,
      },
      {
        description: "Supply and install glass / aluminium works",
        unit: "sqft",
        quantity: glassQty,
        unitPrice: glassRate,
      },
    ),
  );

  updateSection(sections, "CLEANING_DISPOSAL", (section) =>
    setSingleLineItem(section, {
      description: "Final cleaning, debris disposal, and handover preparation",
      unit: "lot",
      quantity: 1,
      unitPrice: cleaningRate,
    }),
  );

  const assumptions: string[] = [
    `Estimated using ${unitSizeSqft} sqft ${input.propertyType.toLowerCase()} project profile.`,
    isPremium
      ? "Premium finish and workmanship allowances were applied."
      : isBasic
        ? "Budget-conscious baseline rates were applied."
        : "Standard mid-market renovation rates were applied.",
    hasCarpentry
      ? "Carpentry quantities were inferred from keywords such as kitchen, wardrobe, or storage."
      : "No major carpentry scope was inferred from the brief.",
    hasFalseCeiling
      ? "False ceiling scope was included based on ceiling / cove-lighting keywords."
      : "Ceiling works were excluded unless specifically requested.",
    "Generated quantities are draft estimates and should be reviewed against site measurements.",
  ];

  return {
    projectName: input.projectName?.trim() || "AI Generated Renovation Quotation",
    assumptions,
    sections,
  };
}
