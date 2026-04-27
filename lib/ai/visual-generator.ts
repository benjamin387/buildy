import "server-only";

import type { DesignStyle, RoomType } from "@prisma/client";

export type GenerateInteriorVisualInput = {
  roomType: RoomType;
  layoutNotes: string | null;
  materials: string | null;
  designStyle: DesignStyle | null;
  promptOverride?: string | null;
};

export type GenerateInteriorVisualOutput = {
  promptText: string;
  generatedImageUrl: string;
};

function normalizeText(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

function roomTypeLabel(roomType: RoomType): string {
  return roomType
    .replaceAll("_", " ")
    .toLowerCase()
    .replaceAll(/\b\w/g, (m) => m.toUpperCase());
}

function styleLabel(style: DesignStyle | null): string {
  if (!style) return "Contemporary";
  switch (style) {
    case "MODERN":
      return "Modern";
    case "SCANDINAVIAN":
      return "Scandinavian";
    case "INDUSTRIAL":
      return "Industrial";
    case "MINIMALIST":
      return "Minimalist";
    case "CONTEMPORARY":
      return "Contemporary";
    case "OTHERS":
      return "Contemporary";
    default:
      return "Contemporary";
  }
}

export function buildInteriorVisualPrompt(input: GenerateInteriorVisualInput): string {
  const override = normalizeText(input.promptOverride);
  if (override) return override;

  const room = roomTypeLabel(input.roomType);
  const style = styleLabel(input.designStyle);
  const layout = normalizeText(input.layoutNotes);
  const materials = normalizeText(input.materials);

  const parts: string[] = [];
  parts.push(`${style} ${room} interior`);
  parts.push("Singapore home interior");
  if (materials) parts.push(`Materials: ${materials}`);
  if (layout) parts.push(`Layout: ${layout}`);
  parts.push("photorealistic, realistic lighting, high detail, 4K render, wide angle, clean composition");

  // Single-line prompt for provider compatibility.
  return parts.join(", ");
}

type OpenAiImagesConfig = {
  apiKey: string;
  model: string;
  endpoint: string;
  size: string;
  quality: "standard" | "hd";
};

function getOpenAiConfig(): OpenAiImagesConfig | null {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  // Keep this isolated so swapping providers later is low-risk.
  const endpoint = (process.env.OPENAI_IMAGE_ENDPOINT ?? "https://api.openai.com/v1/images/generations").trim();
  const model = (process.env.OPENAI_IMAGE_MODEL ?? "dall-e-3").trim();
  const size = (process.env.OPENAI_IMAGE_SIZE ?? "1024x1024").trim();
  const quality = ((process.env.OPENAI_IMAGE_QUALITY ?? "standard").trim().toLowerCase() === "hd" ? "hd" : "standard") as
    | "standard"
    | "hd";

  return { apiKey, model, endpoint, size, quality };
}

function getVisualProvider(): string {
  return (process.env.AI_VISUAL_PROVIDER ?? process.env.VISUAL_PROVIDER ?? "OPENAI").trim().toUpperCase();
}

async function generateViaOpenAi(promptText: string): Promise<string> {
  const cfg = getOpenAiConfig();
  if (!cfg) {
    throw new Error("OPENAI_API_KEY is missing. Configure AI_VISUAL_PROVIDER=OPENAI + OPENAI_API_KEY.");
  }

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt: promptText,
      n: 1,
      size: cfg.size,
      quality: cfg.quality,
    }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Image generation failed (${res.status})`;
    throw new Error(msg);
  }

  const url = json?.data?.[0]?.url;
  if (typeof url === "string" && url.trim()) return url.trim();

  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 === "string" && b64.trim()) {
    // Fallback: embed as data URL. This is not ideal for large renders, but avoids hard dependency on storage.
    return `data:image/png;base64,${b64.trim()}`;
  }

  throw new Error("Provider did not return an image URL.");
}

export async function generateInteriorVisual(input: GenerateInteriorVisualInput): Promise<GenerateInteriorVisualOutput> {
  const promptText = buildInteriorVisualPrompt(input);

  const provider = getVisualProvider();
  if (provider !== "OPENAI") {
    throw new Error(`Unsupported AI_VISUAL_PROVIDER=${provider}. Supported: OPENAI.`);
  }

  const generatedImageUrl = await generateViaOpenAi(promptText);
  return { promptText, generatedImageUrl };
}

export type VisualVariationKey = "A" | "B" | "C";

export function buildVariationPrompt(basePrompt: string, variation: VisualVariationKey): string {
  const v =
    variation === "A"
      ? "Option A: warm neutral palette, airy daylight, soft shadows"
      : variation === "B"
        ? "Option B: cool neutral palette, evening ambient lighting, cozy mood"
        : "Option C: bolder accent palette, dramatic contrast lighting, premium feel";
  return `${basePrompt}, ${v}`;
}

export async function generateInteriorVisualVariations(input: GenerateInteriorVisualInput): Promise<
  Array<{ option: VisualVariationKey; promptText: string; generatedImageUrl: string }>
> {
  const base = buildInteriorVisualPrompt(input);
  const options: VisualVariationKey[] = ["A", "B", "C"];
  const results: Array<{ option: VisualVariationKey; promptText: string; generatedImageUrl: string }> = [];

  // Keep this sequential to reduce rate-limit spikes; callers can parallelize if desired.
  for (const opt of options) {
    const promptText = buildVariationPrompt(base, opt);
    const generatedImageUrl = await generateViaOpenAi(promptText);
    results.push({ option: opt, promptText, generatedImageUrl });
  }

  return results;
}
