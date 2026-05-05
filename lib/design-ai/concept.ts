export type DesignConceptSeed = {
  clientName: string;
  propertyType: string;
  preferredStyle: string | null;
  aiSummary: string | null;
};

export type DesignConceptFields = {
  title: string;
  theme: string;
  conceptSummary: string;
  livingRoomConcept: string;
  bedroomConcept: string;
  kitchenConcept: string;
  bathroomConcept: string;
  materialPalette: string;
  lightingPlan: string;
  furnitureDirection: string;
  renovationScope: string;
};

type PartialDesignConceptInput = {
  [K in keyof DesignConceptFields]?: string | null;
};

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function formatPropertyType(propertyType: string): string {
  const normalized = readText(propertyType)?.replaceAll("_", " ") ?? "Residential Space";
  return normalized
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildMockDesignConcept(seed: DesignConceptSeed): DesignConceptFields {
  const clientName = readText(seed.clientName) ?? "Client";
  const propertyType = formatPropertyType(seed.propertyType);
  const theme = readText(seed.preferredStyle) ?? "Contemporary Luxe";
  const conceptSummary =
    readText(seed.aiSummary) ??
    `A ${theme.toLowerCase()} direction for the ${propertyType.toLowerCase()} focused on warm textures, clean joinery lines, and premium day-to-day usability.`;

  return {
    title: `${clientName} - ${propertyType} Concept`,
    theme,
    conceptSummary,
    livingRoomConcept:
      `Shape the living room around a ${theme.toLowerCase()} hospitality mood with a feature joinery wall, concealed storage, and flexible seating for entertaining.`,
    bedroomConcept:
      "Develop the bedroom as a calm retreat with upholstered wall detailing, full-height wardrobes, and soft indirect lighting to support a quieter evening atmosphere.",
    kitchenConcept:
      "Organize the kitchen with a disciplined work triangle, integrated appliances, durable countertops, and layered task lighting for efficient daily prep.",
    bathroomConcept:
      "Position the bathroom as a compact spa experience using stone-look finishes, frameless glass, warm mirror lighting, and easy-maintenance fittings.",
    materialPalette:
      "Combine warm oak woodgrain, satin champagne laminates, engineered stone counters, large-format porcelain, matte black hardware, and textured fabric accents.",
    lightingPlan:
      "Use a three-layer lighting plan with ambient cove light, focused task lighting at work zones, and dimmable accent scenes for evening mood control.",
    furnitureDirection:
      "Prioritize slim-profile furniture, built-in storage, rounded edge details, and a restrained styling package that keeps circulation open and polished.",
    renovationScope:
      "Cover selective demolition, bespoke carpentry, electrical and lighting rework, targeted plumbing adjustments, surface finishing upgrades, and final loose furnishing installation.",
  };
}

export function normalizeDesignConcept(
  seed: DesignConceptSeed,
  concept: PartialDesignConceptInput | null | undefined,
): DesignConceptFields {
  const fallback = buildMockDesignConcept(seed);

  return {
    title: readText(concept?.title) ?? fallback.title,
    theme: readText(concept?.theme) ?? fallback.theme,
    conceptSummary: readText(concept?.conceptSummary) ?? fallback.conceptSummary,
    livingRoomConcept: readText(concept?.livingRoomConcept) ?? fallback.livingRoomConcept,
    bedroomConcept: readText(concept?.bedroomConcept) ?? fallback.bedroomConcept,
    kitchenConcept: readText(concept?.kitchenConcept) ?? fallback.kitchenConcept,
    bathroomConcept: readText(concept?.bathroomConcept) ?? fallback.bathroomConcept,
    materialPalette: readText(concept?.materialPalette) ?? fallback.materialPalette,
    lightingPlan: readText(concept?.lightingPlan) ?? fallback.lightingPlan,
    furnitureDirection: readText(concept?.furnitureDirection) ?? fallback.furnitureDirection,
    renovationScope: readText(concept?.renovationScope) ?? fallback.renovationScope,
  };
}
