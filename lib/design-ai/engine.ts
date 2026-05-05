import "server-only";
import { buildMockDesignConcept, normalizeDesignConcept } from "@/lib/design-ai/concept";

type BriefAiSummary = {
  aiSummary: string;
  aiRecommendedStyle: string;
  aiBudgetRisk: string;
  aiNextAction: string;
};

type ConceptAiOutput = ReturnType<typeof buildMockDesignConcept>;

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
  const fallback = buildMockDesignConcept(payload);
  if (!hasOpenAiKey()) return fallback;

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

    return normalizeDesignConcept(payload, parsed);
  } catch {
    return fallback;
  }
}
