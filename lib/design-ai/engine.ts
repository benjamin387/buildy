import "server-only";

type BriefAiSummary = {
  aiSummary: string;
  aiRecommendedStyle: string;
  aiBudgetRisk: string;
  aiNextAction: string;
};

type ConceptAiOutput = {
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

type BriefPayload = {
  clientName: string;
  propertyType: string;
  floorArea: string | null;
  rooms: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredStyle: string | null;
  timeline: string | null;
  requirements: string | null;
};

function hasOpenAiKey(): boolean {
  return Boolean((process.env.OPENAI_API_KEY ?? "").trim());
}

function clamp(value: string, max = 8000): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function budgetRiskLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return "Medium - Budget range not fully defined";
  if (max !== null && max < 30000) return "High - Tight budget for full-scope interior works";
  if (max !== null && max <= 80000) return "Medium - Feasible with strict scope prioritization";
  return "Low - Healthy range for premium execution";
}

function mockSummary(payload: BriefPayload): BriefAiSummary {
  const summary =
    `${payload.clientName} is planning a ${payload.propertyType.toLowerCase()} interior project` +
    `${payload.floorArea ? ` across approximately ${payload.floorArea}.` : "."} ` +
    `Priority should be set on functional zoning, storage optimization, and staged execution to match timeline expectations.`;

  return {
    aiSummary: summary,
    aiRecommendedStyle: payload.preferredStyle || "Contemporary Luxe",
    aiBudgetRisk: budgetRiskLabel(payload.budgetMin, payload.budgetMax),
    aiNextAction: "Validate room-by-room scope, lock material direction, and issue concept options for client sign-off.",
  };
}

function mockConcept(payload: BriefPayload, aiSummary: string | null): ConceptAiOutput {
  return {
    title: `${payload.clientName} - ${payload.propertyType} Concept`,
    theme: payload.preferredStyle || "Contemporary Luxe",
    conceptSummary:
      aiSummary ||
      "A refined, hospitality-inspired concept balancing visual warmth, practical storage, and premium material hierarchy.",
    livingRoomConcept:
      "Layered neutral palette with feature wall detailing, concealed media storage, and modular seating for hosting flexibility.",
    bedroomConcept:
      "Calm retreat language with upholstered headboard wall, soft indirect lighting, and full-height wardrobe integration.",
    kitchenConcept:
      "Efficient work triangle planning with durable premium finishes, integrated appliances, and task-focused under-cabinet lighting.",
    bathroomConcept:
      "Spa-leaning composition using textured stone-look surfaces, frameless shower zones, and warm ambient mirror lighting.",
    materialPalette:
      "Satin laminate, engineered stone, porcelain slabs, matte black accents, linen textures, and warm oak tones.",
    lightingPlan:
      "Three-layer strategy: cove ambient base, targeted task points, and dimmable accents for evening mood transitions.",
    furnitureDirection:
      "Slim-profile furniture with hidden storage, rounded corners, and restrained decorative pieces to preserve openness.",
    renovationScope:
      "Selective demolition, custom carpentry, electrical rewiring for layered lighting, plumbing touchpoints, and final styling setup.",
  };
}

async function requestOpenAi(prompt: string): Promise<string> {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  const model = (process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini").trim();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
  });

  const body = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const message = body?.error?.message || `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  const content =
    body?.output_text ??
    body?.output?.[0]?.content?.find?.((item: any) => item?.type === "output_text")?.text ??
    "";

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned empty content");
  }

  return content;
}

export async function generateBriefSummaryAi(payload: BriefPayload): Promise<BriefAiSummary> {
  if (!hasOpenAiKey()) return mockSummary(payload);

  try {
    const prompt = [
      "You are Buildy AI Design Brief Strategist for luxury interior projects.",
      "Return JSON only with keys: aiSummary, aiRecommendedStyle, aiBudgetRisk, aiNextAction.",
      "Keep output concise, actionable, and executive-friendly.",
      `Client: ${payload.clientName}`,
      `PropertyType: ${payload.propertyType}`,
      `FloorArea: ${payload.floorArea ?? "N/A"}`,
      `Rooms: ${payload.rooms ?? "N/A"}`,
      `BudgetMin: ${payload.budgetMin ?? "N/A"}`,
      `BudgetMax: ${payload.budgetMax ?? "N/A"}`,
      `PreferredStyle: ${payload.preferredStyle ?? "N/A"}`,
      `Timeline: ${payload.timeline ?? "N/A"}`,
      `Requirements: ${clamp(payload.requirements ?? "N/A", 2000)}`,
    ].join("\n");

    const raw = await requestOpenAi(prompt);
    const parsed = JSON.parse(raw) as Partial<BriefAiSummary>;

    if (!parsed.aiSummary || !parsed.aiRecommendedStyle || !parsed.aiBudgetRisk || !parsed.aiNextAction) {
      throw new Error("Incomplete AI summary payload");
    }

    return {
      aiSummary: parsed.aiSummary.trim(),
      aiRecommendedStyle: parsed.aiRecommendedStyle.trim(),
      aiBudgetRisk: parsed.aiBudgetRisk.trim(),
      aiNextAction: parsed.aiNextAction.trim(),
    };
  } catch {
    return mockSummary(payload);
  }
}

export async function generateDesignConceptAi(payload: BriefPayload & { aiSummary: string | null }): Promise<ConceptAiOutput> {
  if (!hasOpenAiKey()) return mockConcept(payload, payload.aiSummary);

  try {
    const prompt = [
      "You are a luxury interior design director.",
      "Return JSON only with keys: title, theme, conceptSummary, livingRoomConcept, bedroomConcept, kitchenConcept, bathroomConcept, materialPalette, lightingPlan, furnitureDirection, renovationScope.",
      "Ensure each section is practical for implementation and client presentation.",
      `Client: ${payload.clientName}`,
      `PropertyType: ${payload.propertyType}`,
      `FloorArea: ${payload.floorArea ?? "N/A"}`,
      `Rooms: ${payload.rooms ?? "N/A"}`,
      `BudgetMin: ${payload.budgetMin ?? "N/A"}`,
      `BudgetMax: ${payload.budgetMax ?? "N/A"}`,
      `PreferredStyle: ${payload.preferredStyle ?? "N/A"}`,
      `Timeline: ${payload.timeline ?? "N/A"}`,
      `Requirements: ${clamp(payload.requirements ?? "N/A", 2500)}`,
      `AI Summary: ${clamp(payload.aiSummary ?? "N/A", 1800)}`,
    ].join("\n");

    const raw = await requestOpenAi(prompt);
    const parsed = JSON.parse(raw) as Partial<ConceptAiOutput>;

    if (!parsed.title || !parsed.conceptSummary) {
      throw new Error("Incomplete concept payload");
    }

    const fallback = mockConcept(payload, payload.aiSummary);
    return {
      title: parsed.title?.trim() || fallback.title,
      theme: parsed.theme?.trim() || fallback.theme,
      conceptSummary: parsed.conceptSummary?.trim() || fallback.conceptSummary,
      livingRoomConcept: parsed.livingRoomConcept?.trim() || fallback.livingRoomConcept,
      bedroomConcept: parsed.bedroomConcept?.trim() || fallback.bedroomConcept,
      kitchenConcept: parsed.kitchenConcept?.trim() || fallback.kitchenConcept,
      bathroomConcept: parsed.bathroomConcept?.trim() || fallback.bathroomConcept,
      materialPalette: parsed.materialPalette?.trim() || fallback.materialPalette,
      lightingPlan: parsed.lightingPlan?.trim() || fallback.lightingPlan,
      furnitureDirection: parsed.furnitureDirection?.trim() || fallback.furnitureDirection,
      renovationScope: parsed.renovationScope?.trim() || fallback.renovationScope,
    };
  } catch {
    return mockConcept(payload, payload.aiSummary);
  }
}
