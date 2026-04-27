import "server-only";

import type { DesignStyle, PropertyType, RoomType } from "@prisma/client";

// Placeholder-only AI hooks.
// These functions are intentionally deterministic and do not call external providers.
// Later phases can swap implementations without changing call sites.

export async function generateLayoutSuggestions(input: {
  clientNeeds: string;
  designStyle: DesignStyle | null;
  propertyType: PropertyType;
  areas: Array<{ name: string; roomType: RoomType; clientRequirement: string | null }>;
}) {
  return {
    notes:
      "AI placeholder: layout suggestions will appear here. " +
      "Provide client needs + area requirements to generate zoning, circulation, and furniture plan ideas.",
    outline: input.areas.map((a) => ({
      area: a.name,
      suggestions: [
        "Define primary circulation path and keep clearances consistent.",
        "Prioritize storage planning early (carpentry zones).",
        "Confirm power points and lighting layering to match usage.",
      ],
    })),
  };
}

export async function generate3DVisualPrompt(input: {
  areaName: string;
  designStyle: DesignStyle | null;
  proposedTheme: string | null;
  proposedMaterials: string | null;
  layoutNotes: string | null;
}) {
  return {
    prompt:
      "AI placeholder prompt: " +
      `Render an interior for ${input.areaName} in ${input.designStyle ?? "a suitable"} style. ` +
      `Theme: ${input.proposedTheme ?? "TBD"}. Materials: ${input.proposedMaterials ?? "TBD"}. ` +
      `Layout notes: ${input.layoutNotes ?? "TBD"}.`,
  };
}

export async function generateFFERecommendations(input: {
  areaName: string;
  designStyle: DesignStyle | null;
  budgetHint: { min: number | null; max: number | null };
  requirements: string | null;
}) {
  return {
    notes:
      "AI placeholder: FFE recommendations will appear here (items, suppliers, lead times).",
    recommendations: [
      {
        title: "Sofa / Seating",
        supplierName: "TBD",
        purchaseUrl: null,
        leadTimeDays: 21,
        availabilityStatus: "CHECK",
      },
    ],
  };
}

export async function generateQSBoqDraft(input: {
  areaName: string;
  layoutNotes: string | null;
  materialNotes: string | null;
  requirements: string | null;
}) {
  return {
    notes: "AI placeholder: QS BOQ draft generation will appear here (scope + quantities + rates).",
    items: [
      {
        description: "Allow for supply and install works (placeholder)",
        unit: "lot",
        quantity: 1,
        recommendedSellingUnitPrice: 0,
        estimatedCostUnitPrice: 0,
      },
    ],
  };
}

export async function generatePresentationOutline(input: {
  projectName: string;
  addressedTo: string;
  designStyle: DesignStyle | null;
  areas: Array<{ name: string; roomType: RoomType }>;
}) {
  return {
    outline: [
      "Cover page",
      "Client / project details",
      "Team introduction",
      "Design concept and key inspirations",
      ...input.areas.map((a) => `Area proposal: ${a.name} (${a.roomType})`),
      "FF&E schedule",
      "Preliminary budget summary",
      "Why choose us",
      "Next steps",
    ],
  };
}

