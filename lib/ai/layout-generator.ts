import "server-only";

import type { DesignStyle, PropertyType, RoomType } from "@prisma/client";

export type GenerateFurnitureLayoutInput = {
  propertyType: PropertyType;
  roomType: RoomType;
  roomWidth: number;
  roomLength: number;
  doorPosition: string;
  windowPosition: string;
  clientNeeds: string;
  designStyle: DesignStyle | null;
};

export type GenerateFurnitureLayoutOutput = {
  layoutSummary: string;
  furniturePlacementPlan: string;
  circulationNotes: string;
  recommendedFurnitureList: string;
  constraints: string;
  promptFor3DVisual: string;
};

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

function styleLabel(style: DesignStyle | null): string {
  if (!style) return "Contemporary";
  return style.replaceAll("_", " ").toLowerCase().replaceAll(/\b\w/g, (m) => m.toUpperCase());
}

function roomLabel(roomType: RoomType): string {
  return roomType.replaceAll("_", " ").toLowerCase().replaceAll(/\b\w/g, (m) => m.toUpperCase());
}

function propertyLabel(propertyType: PropertyType): string {
  return propertyType === "HDB"
    ? "Singapore HDB"
    : propertyType === "CONDO"
      ? "Singapore condo"
      : propertyType === "LANDED"
        ? "Singapore landed"
        : propertyType === "COMMERCIAL"
          ? "Singapore commercial"
          : "Singapore home";
}

function mm(valueMeters: number): number {
  return Math.round(valueMeters * 1000);
}

function pickSofaLength(widthM: number): number {
  if (widthM >= 4.2) return 2600;
  if (widthM >= 3.6) return 2400;
  if (widthM >= 3.0) return 2200;
  return 2000;
}

function pickDiningTableLength(lengthM: number): number {
  if (lengthM >= 4.0) return 1800;
  if (lengthM >= 3.4) return 1600;
  if (lengthM >= 3.0) return 1400;
  return 1200;
}

function pickBedSize(widthM: number): { label: string; mm: string } {
  if (widthM >= 3.2) return { label: "King", mm: "1830x1910" };
  if (widthM >= 2.8) return { label: "Queen", mm: "1520x1910" };
  return { label: "Super Single", mm: "1070x1910" };
}

function normalizeText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

export async function generateFurnitureLayout(input: GenerateFurnitureLayoutInput): Promise<GenerateFurnitureLayoutOutput> {
  const width = clampNonNegative(input.roomWidth);
  const length = clampNonNegative(input.roomLength);
  if (width < 1.5 || length < 1.5) {
    throw new Error("Room dimensions are too small. Provide width/length in meters (e.g. 3.2 and 4.1).");
  }

  const walkwayMm = 900;
  const doorClearMm = 800;
  const windowClearMm = 300;

  const room = roomLabel(input.roomType);
  const style = styleLabel(input.designStyle);
  const prop = propertyLabel(input.propertyType);

  const constraintsLines: string[] = [];
  constraintsLines.push(`Maintain minimum ${walkwayMm}mm circulation where possible.`);
  constraintsLines.push(`Keep door swing/entry clearance of at least ${doorClearMm}mm.`);
  constraintsLines.push(`Avoid blocking windows; keep at least ${windowClearMm}mm setback from window wall for tall furniture.`);
  constraintsLines.push(`Door position: ${input.doorPosition}. Window position: ${input.windowPosition}.`);

  const summaryLines: string[] = [];
  summaryLines.push(`${style} ${room} layout (${prop}).`);
  summaryLines.push(`Room size: ${width.toFixed(2)}m (W) x ${length.toFixed(2)}m (L).`);
  summaryLines.push(`Primary focal wall chosen opposite entry where feasible; storage zones planned away from window wall.`);

  const planLines: string[] = [];
  const furnitureLines: string[] = [];
  const circulationLines: string[] = [];

  circulationLines.push(`Entry-to-seating path: keep clear ${walkwayMm}mm minimum, avoid sharp pinch points.`);
  circulationLines.push(`Do not place tall cabinets within ${windowClearMm}mm of window wall.`);
  circulationLines.push(`Keep door approach zone clear (${doorClearMm}mm) and avoid furniture corners at entry.`);

  const needs = normalizeText(input.clientNeeds);

  switch (input.roomType) {
    case "LIVING_ROOM": {
      const sofaLen = pickSofaLength(width);
      furnitureLines.push(`L-shaped sofa (approx. ${sofaLen}mm long side) or 3-seater + 1 armchair depending on needs.`);
      furnitureLines.push("TV console 1800–2400mm (low profile).");
      furnitureLines.push("Coffee table 800–1200mm, keep 350–450mm between sofa and table.");
      furnitureLines.push("Rug sizing: front legs of sofa and chairs on rug for cohesion.");

      planLines.push("1. Place TV wall on the wall with least openings (avoid windows), centered to main seating.");
      planLines.push(`2. Place sofa facing TV wall, keep at least ${walkwayMm}mm behind/side circulation where possible.`);
      planLines.push("3. Keep a clear corridor from entry to any adjoining spaces; do not block door swing.");
      planLines.push("4. If space allows, add a slim console / display shelf on the secondary wall.");
      break;
    }
    case "DINING_ROOM": {
      const tableLen = pickDiningTableLength(length);
      furnitureLines.push(`Dining table ${tableLen}mm x 800–900mm (6p if space allows).`);
      furnitureLines.push("Dining chairs: allow ~600mm per person on long side.");
      furnitureLines.push("Sideboard 1200–1800mm (optional) away from window wall.");

      planLines.push("1. Center dining table along the longer axis for better circulation.");
      planLines.push(`2. Keep at least ${walkwayMm}mm clear around chair pull-out zones where possible.`);
      planLines.push("3. Place sideboard on solid wall; avoid window wall for tall storage.");
      break;
    }
    case "KITCHEN": {
      furnitureLines.push("Base + wall cabinets (standard depth), sink + hob work triangle.");
      furnitureLines.push("Fridge location near entry but not blocking circulation.");
      furnitureLines.push("If width allows, consider peninsula/island with 2 stools (value depends on workflow).");

      planLines.push("1. Allocate sink/hob/fridge in a practical triangle (minimize cross-traffic).");
      planLines.push(`2. Maintain ${walkwayMm}mm between opposing counters / island clearance.`);
      planLines.push("3. Keep tall units grouped (fridge + pantry) on a solid wall; avoid window conflicts.");
      break;
    }
    case "MASTER_BEDROOM":
    case "BEDROOM": {
      const bed = pickBedSize(width);
      furnitureLines.push(`Bed: ${bed.label} (${bed.mm}mm) subject to clearances.`);
      furnitureLines.push("Side tables 400–500mm (or one side only if tight).");
      furnitureLines.push("Wardrobe: 1800–3600mm run, sliding doors if space is tight.");
      furnitureLines.push("Optional: study desk 1000–1400mm, place near window for daylight.");

      planLines.push("1. Place bed headboard on the wall away from door swing and not directly under window (where feasible).");
      planLines.push(`2. Keep ${walkwayMm}mm clearance at bed-side circulation (reduce to ~700mm only if necessary).`);
      planLines.push("3. Place wardrobe along the wall with least openings; avoid blocking windows.");
      planLines.push("4. Place study/vanity near window; keep tall wardrobe off the window wall.");
      break;
    }
    case "BATHROOM":
    case "COMMON_TOILET": {
      furnitureLines.push("Vanity cabinet 600–900mm, mirror cabinet (optional).");
      furnitureLines.push("Shower screen / wet-dry separation where possible.");
      furnitureLines.push("Toilet bowl with access clearance; niches for storage.");

      planLines.push("1. Keep wet zone at the far end from door; maintain safe entry threshold.");
      planLines.push("2. Place vanity close to entry for practical daily use.");
      planLines.push("3. Maintain clear door swing and do not obstruct ventilation/window.");
      break;
    }
    default: {
      furnitureLines.push("Core furniture to match room function; prioritize circulation and storage planning.");
      planLines.push("1. Identify focal wall and main usage zone.");
      planLines.push(`2. Maintain ${walkwayMm}mm circulation paths.`);
      planLines.push("3. Keep tall storage away from windows/doors.");
      break;
    }
  }

  if (needs) {
    summaryLines.push(`Client needs considered: ${needs}`);
  }

  const promptFor3DVisual =
    `${style} ${room} interior, ${prop}, ` +
    `room size ${mm(width)}mm x ${mm(length)}mm, ` +
    `furniture plan: ${planLines.slice(0, 3).join(" ")}, ` +
    `materials: ${input.designStyle === "INDUSTRIAL" ? "concrete/stone textures, black metal details, warm wood" : input.designStyle === "SCANDINAVIAN" ? "light oak, soft fabrics, clean white walls" : input.designStyle === "MINIMALIST" ? "clean lines, concealed storage, neutral palette" : "neutral palette, warm lighting, clean modern finishes"}, ` +
    `photorealistic, realistic lighting, wide angle, high detail, 4K render`;

  return {
    layoutSummary: summaryLines.join("\n"),
    furniturePlacementPlan: planLines.join("\n"),
    circulationNotes: circulationLines.join("\n"),
    recommendedFurnitureList: furnitureLines.join("\n"),
    constraints: constraintsLines.join("\n"),
    promptFor3DVisual,
  };
}

