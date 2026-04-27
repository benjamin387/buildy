import "server-only";

import type { DesignStyle, PropertyType, RoomType } from "@prisma/client";

export type BudgetRangeInput = {
  min: number | null;
  max: number | null;
  currency?: string | null;
};

export type DesignConceptInput = {
  propertyType: PropertyType;
  roomType: RoomType;
  designStyle: DesignStyle | null;
  budgetRange: BudgetRangeInput | null;
  clientNeeds: string;
};

export type DesignConceptOutput = {
  layoutSuggestionText: string;
  materialSuggestion: string;
  furnitureSuggestion: string;
  lightingSuggestion: string;
};

export type BoqDraftItem = {
  description: string;
  unit: string;
  quantity: number;
  recommendedSellingUnitPrice: number;
  estimatedCostUnitPrice: number;
};

function clampText(value: string, max = 8000): string {
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function roomLabel(roomType: RoomType): string {
  return roomType.replaceAll("_", " ").toLowerCase();
}

function styleLabel(style: DesignStyle | null): string {
  if (!style) return "contemporary";
  return style.replaceAll("_", " ").toLowerCase();
}

function propertyLabel(propertyType: PropertyType): string {
  return propertyType.toLowerCase();
}

function budgetTier(b: BudgetRangeInput | null): "VALUE" | "MID" | "PREMIUM" {
  const max = b?.max ?? null;
  if (max === null) return "MID";
  if (max <= 30000) return "VALUE";
  if (max <= 80000) return "MID";
  return "PREMIUM";
}

type OpenAiTextConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
};

function getOpenAiTextConfig(): OpenAiTextConfig | null {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const endpoint = (process.env.OPENAI_TEXT_ENDPOINT ?? "https://api.openai.com/v1/responses").trim();
  const model = (process.env.OPENAI_TEXT_MODEL ?? "").trim();
  if (!apiKey || !endpoint || !model) return null;
  return { apiKey, endpoint, model };
}

async function generateConceptViaOpenAi(input: DesignConceptInput): Promise<DesignConceptOutput> {
  const cfg = getOpenAiTextConfig();
  if (!cfg) throw new Error("Missing OpenAI text config. Set OPENAI_API_KEY + OPENAI_TEXT_MODEL.");

  const tier = budgetTier(input.budgetRange);
  const prompt =
    "You are an interior design lead. Generate concise, actionable design suggestions.\n" +
    "Return JSON ONLY with keys: layoutSuggestionText, materialSuggestion, furnitureSuggestion, lightingSuggestion.\n" +
    `Context: Singapore ${propertyLabel(input.propertyType)}, room=${roomLabel(input.roomType)}, style=${styleLabel(input.designStyle)}, budgetTier=${tier}.\n` +
    `Client needs:\n${clampText(input.clientNeeds, 2000)}\n`;

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      input: prompt,
      // Provider-specific: do not depend on tool calling; keep plain JSON.
      text: { format: { type: "json_object" } },
    }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Text generation failed (${res.status})`;
    throw new Error(msg);
  }

  const content =
    json?.output_text ??
    json?.output?.[0]?.content?.find?.((c: any) => c?.type === "output_text")?.text ??
    null;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Provider did not return output text.");
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Provider returned non-JSON content.");
  }

  const layoutSuggestionText = typeof parsed.layoutSuggestionText === "string" ? parsed.layoutSuggestionText.trim() : "";
  const materialSuggestion = typeof parsed.materialSuggestion === "string" ? parsed.materialSuggestion.trim() : "";
  const furnitureSuggestion = typeof parsed.furnitureSuggestion === "string" ? parsed.furnitureSuggestion.trim() : "";
  const lightingSuggestion = typeof parsed.lightingSuggestion === "string" ? parsed.lightingSuggestion.trim() : "";

  if (!layoutSuggestionText || !materialSuggestion || !furnitureSuggestion || !lightingSuggestion) {
    throw new Error("Provider returned incomplete JSON fields.");
  }

  return { layoutSuggestionText, materialSuggestion, furnitureSuggestion, lightingSuggestion };
}

function generateConceptHeuristic(input: DesignConceptInput): DesignConceptOutput {
  const tier = budgetTier(input.budgetRange);
  const room = roomLabel(input.roomType);
  const style = styleLabel(input.designStyle);

  const layoutSuggestionText =
    `Layout (${style}, ${room}): ` +
    "prioritize clear circulation, define a primary focal wall, and reserve full-height storage zones early. " +
    (tier === "VALUE"
      ? "Use modular systems to control cost and reduce custom carpentry."
      : tier === "PREMIUM"
        ? "Integrate concealed storage and feature lighting with layered scenes."
        : "Balance custom carpentry with standard modules for efficiency.");

  const materialSuggestion =
    tier === "VALUE"
      ? "Materials: durable laminate carpentry, homogeneous tiles / SPC vinyl, matte paint, quartz-look compact laminate for counters."
      : tier === "PREMIUM"
        ? "Materials: veneer + lacquer accents, large-format porcelain, engineered timber / premium SPC, stone-look wall cladding, satin paint system."
        : "Materials: laminate carpentry with veneer highlight panels, porcelain tiles/SPC, feature paint, quartz countertop where applicable.";

  const furnitureSuggestion =
    "Furniture: keep proportions comfortable for Singapore homes, specify hidden storage where possible, and maintain consistent tone across soft furnishings. " +
    (input.designStyle === "SCANDINAVIAN"
      ? "Use light wood, textured fabrics, and minimal decor."
      : input.designStyle === "INDUSTRIAL"
        ? "Use black metal details, warm wood, and concrete/stone textures."
        : input.designStyle === "MINIMALIST"
          ? "Use fewer pieces, clean lines, and concealed handles."
          : "Use clean-lined pieces, neutral palette, and a single accent element per area.");

  const lightingSuggestion =
    "Lighting: layer ambient + task + accent lighting, use warm white (around 3000K) for residential comfort, and add dimming scenes. " +
    (room.includes("kitchen") ? "Ensure strong task lighting at hob and sink." : "Use wall-wash or cove lighting for depth.");

  return { layoutSuggestionText, materialSuggestion, furnitureSuggestion, lightingSuggestion };
}

export async function generateDesignConcept(input: DesignConceptInput): Promise<DesignConceptOutput> {
  try {
    if (getOpenAiTextConfig()) {
      return await generateConceptViaOpenAi(input);
    }
  } catch {
    // Fall through to heuristic output.
  }
  return generateConceptHeuristic(input);
}

export async function generateBOQFromDesign(input: {
  roomType: RoomType;
  designStyle: DesignStyle | null;
  layoutSuggestionText: string;
  materialSuggestion: string;
  clientNeeds: string;
}): Promise<{ items: BoqDraftItem[] }> {
  // Deterministic + editable QS draft. (Optional AI enhancement can be added later.)
  const room = roomLabel(input.roomType);
  const base: BoqDraftItem[] = [
    {
      description: `[AI] ${room}: preliminaries, protection, site set-up`,
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    },
    {
      description: `[AI] ${room}: hacking / dismantling (if applicable)`,
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    },
    {
      description: `[AI] ${room}: carpentry works (supply & install)`,
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    },
    {
      description: `[AI] ${room}: electrical works (lighting points & power points)`,
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    },
    {
      description: `[AI] ${room}: painting / touch-up`,
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    },
    {
      description: `[AI] ${room}: final cleaning and handover`,
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    },
  ];

  // Room-specific additions.
  if (room.includes("kitchen")) {
    base.splice(3, 0, {
      description: "[AI] Kitchen: plumbing works (sink, tap, connections)",
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    });
  }
  if (room.includes("bathroom") || room.includes("toilet")) {
    base.splice(3, 0, {
      description: "[AI] Bathroom: waterproofing and tiling works",
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    });
    base.splice(4, 0, {
      description: "[AI] Bathroom: plumbing fixtures installation",
      unit: "lot",
      quantity: 1,
      recommendedSellingUnitPrice: 0,
      estimatedCostUnitPrice: 0,
    });
  }

  return { items: base };
}

