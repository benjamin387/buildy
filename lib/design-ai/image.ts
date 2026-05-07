import "server-only";

import {
  generateMockPerspectiveRenderImages,
  type FloorPlanPerspectiveConcept,
  type FloorPlanPerspectiveConceptPackage,
  type FloorPlanPerspectiveRenderImage,
} from "@/lib/design-ai/floor-plan-engine";

const OPENAI_IMAGE_GENERATION_ENDPOINT =
  "https://api.openai.com/v1/images/generations";
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_OPENAI_IMAGE_SIZE = "1536x1024";
const DEFAULT_OPENAI_IMAGE_QUALITY = "medium";
const MIN_PROJECT_PERSPECTIVE_IMAGES = 3;
const MAX_PROJECT_PERSPECTIVE_IMAGES = 5;

type OpenAiImageQuality = "auto" | "low" | "medium" | "high";

type OpenAiImageConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  size: string;
  quality: OpenAiImageQuality;
};

type OpenAiImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

function getOpenAiImageConfig(): OpenAiImageConfig | null {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint: (
      process.env.OPENAI_IMAGE_ENDPOINT ?? OPENAI_IMAGE_GENERATION_ENDPOINT
    ).trim(),
    model: (process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL).trim(),
    size: (process.env.OPENAI_IMAGE_SIZE ?? DEFAULT_OPENAI_IMAGE_SIZE).trim(),
    quality: normalizeImageQuality(process.env.OPENAI_IMAGE_QUALITY),
  };
}

function normalizeImageQuality(value: string | undefined): OpenAiImageQuality {
  const normalized = (value ?? DEFAULT_OPENAI_IMAGE_QUALITY).trim().toLowerCase();

  if (normalized === "standard") {
    return "medium";
  }

  if (normalized === "hd") {
    return "high";
  }

  if (
    normalized === "auto" ||
    normalized === "low" ||
    normalized === "medium" ||
    normalized === "high"
  ) {
    return normalized;
  }

  return "medium";
}

function selectProjectPerspectiveImages(
  perspectivePackage: FloorPlanPerspectiveConceptPackage,
) {
  const placeholders = generateMockPerspectiveRenderImages(perspectivePackage);
  const targetCount = Math.min(
    MAX_PROJECT_PERSPECTIVE_IMAGES,
    Math.max(MIN_PROJECT_PERSPECTIVE_IMAGES, placeholders.length),
  );

  return placeholders.slice(0, targetCount);
}

function buildPerspectiveRenderPrompt(
  perspectivePackage: FloorPlanPerspectiveConceptPackage,
  perspective: FloorPlanPerspectiveConcept,
) {
  return [
    perspectivePackage.artistIllustrationPrompt,
    `Generate one premium interior perspective render for ${perspective.viewTitle}.`,
    `Design style: ${perspectivePackage.style}.`,
    `Camera angle: ${perspective.cameraAngleDescription}`,
    `Lighting direction: ${perspective.lightingDirection}`,
    `Color palette: ${perspective.colorPalette.join(", ")}.`,
    `Material palette: ${perspective.materialPalette.join(", ")}.`,
    `Furniture and carpentry focus: ${perspective.furnitureCarpentryDetails.join("; ")}.`,
    perspective.imageGenerationPrompt,
    "Photorealistic residential interior visualization, polished and client-facing, realistic materials, balanced composition, no people, no text overlays, no watermark, no construction clutter.",
  ].join(" ");
}

async function generatePerspectiveImageUrl(
  prompt: string,
  config: OpenAiImageConfig,
) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      n: 1,
      size: config.size,
      quality: config.quality,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as OpenAiImageResponse | null;

  if (!response.ok) {
    throw new Error(
      body?.error?.message || `OpenAI image generation failed (${response.status})`,
    );
  }

  const image = Array.isArray(body?.data) ? body.data[0] : null;

  if (image?.b64_json?.trim()) {
    return `data:image/png;base64,${image.b64_json.trim()}`;
  }

  if (image?.url?.trim()) {
    return await persistRemoteImageUrl(image.url.trim());
  }

  throw new Error("OpenAI image generation returned no image data.");
}

async function persistRemoteImageUrl(imageUrl: string) {
  try {
    const response = await fetch(imageUrl, { cache: "no-store" });

    if (!response.ok) {
      return imageUrl;
    }

    const contentType = normalizeImageContentType(
      response.headers.get("content-type"),
    );
    const buffer = Buffer.from(await response.arrayBuffer());

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return imageUrl;
  }
}

function normalizeImageContentType(value: string | null) {
  const contentType = (value ?? "").trim().toLowerCase();

  if (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/webp"
  ) {
    return contentType;
  }

  return "image/png";
}

export async function generateFloorPlanPerspectiveRenderImages(
  perspectivePackage: FloorPlanPerspectiveConceptPackage,
): Promise<FloorPlanPerspectiveRenderImage[]> {
  const placeholderImages = selectProjectPerspectiveImages(perspectivePackage);
  const config = getOpenAiImageConfig();

  if (!config) {
    return placeholderImages;
  }

  const perspectiveMap = new Map(
    perspectivePackage.perspectives.map((perspective) => [
      perspective.viewKey,
      perspective,
    ]),
  );

  const results = await Promise.allSettled(
    placeholderImages.map(async (image) => {
      const perspective = perspectiveMap.get(image.viewKey);

      if (!perspective) {
        return image;
      }

      const imageUrl = await generatePerspectiveImageUrl(
        buildPerspectiveRenderPrompt(perspectivePackage, perspective),
        config,
      );

      return {
        ...image,
        imageUrl,
      };
    }),
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    console.warn(
      "[design-ai] Falling back to placeholder perspective image",
      result.reason,
    );

    return placeholderImages[index];
  });
}
