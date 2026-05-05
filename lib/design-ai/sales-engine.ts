import "server-only";

type SalesAdviceInput = {
  clientName: string;
  stage: string;
  priority: string;
  concern: string | null;
  projectContext: string;
};

export type SalesAdviceOutput = {
  bestNextAction: string;
  whatsappFollowUpMessage: string;
  objectionHandling: string;
  upsellSuggestion: string;
  discountRecommendation: string;
  closingStrategy: string;
};

function hasOpenAiKey(): boolean {
  return Boolean((process.env.OPENAI_API_KEY ?? "").trim());
}

function clamp(text: string, max = 1800): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function fallback(input: SalesAdviceInput): SalesAdviceOutput {
  const concern = input.concern?.trim() || "budget clarity and decision timing";
  return {
    bestNextAction: `Send a concise value recap, address ${concern}, and secure a specific decision call within 48 hours.`,
    whatsappFollowUpMessage:
      `Hi ${input.clientName}, just checking in on your ${input.stage} stage. ` +
      `I’ve prepared a refined option to address ${concern} while keeping quality and timeline controlled. ` +
      "Would you be available for a 15-minute call today or tomorrow to finalize next steps?",
    objectionHandling:
      "Acknowledge concern first, compare lifecycle value not only upfront price, and offer one scoped alternative instead of broad discounting.",
    upsellSuggestion:
      "Position upgraded lighting scenes and premium storage hardware as high-ROI enhancements with better daily usability.",
    discountRecommendation:
      "Keep discount within 3-5% and tie it to fast confirmation, reduced scope risk, or milestone payment commitment.",
    closingStrategy:
      "Use an either-or close: confirm preferred option and lock timeline with a clear contract signing date.",
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
    body: JSON.stringify({ model, input: prompt, text: { format: { type: "json_object" } } }),
  });

  const body = (await response.json().catch(() => null)) as any;
  if (!response.ok) throw new Error(body?.error?.message || `OpenAI request failed (${response.status})`);

  const content =
    body?.output_text ??
    body?.output?.[0]?.content?.find?.((item: any) => item?.type === "output_text")?.text ??
    "";

  if (typeof content !== "string" || !content.trim()) throw new Error("OpenAI returned empty content");
  return content;
}

export async function generateSalesAdviceAi(input: SalesAdviceInput): Promise<SalesAdviceOutput> {
  if (!hasOpenAiKey()) return fallback(input);

  try {
    const prompt = [
      "You are Buildy AI Sales Assistant for interior renovation deals.",
      "Return JSON only with keys: bestNextAction, whatsappFollowUpMessage, objectionHandling, upsellSuggestion, discountRecommendation, closingStrategy.",
      "Tone: premium, clear, persuasive, non-pushy.",
      `ClientName: ${input.clientName}`,
      `Stage: ${input.stage}`,
      `Priority: ${input.priority}`,
      `ClientConcern: ${input.concern ?? "N/A"}`,
      `ProjectContext: ${clamp(input.projectContext)}`,
    ].join("\n");

    const raw = await requestOpenAi(prompt);
    const parsed = JSON.parse(raw) as Partial<SalesAdviceOutput>;

    if (!parsed.bestNextAction || !parsed.whatsappFollowUpMessage) {
      throw new Error("Incomplete sales advice output");
    }

    const base = fallback(input);
    return {
      bestNextAction: parsed.bestNextAction?.trim() || base.bestNextAction,
      whatsappFollowUpMessage: parsed.whatsappFollowUpMessage?.trim() || base.whatsappFollowUpMessage,
      objectionHandling: parsed.objectionHandling?.trim() || base.objectionHandling,
      upsellSuggestion: parsed.upsellSuggestion?.trim() || base.upsellSuggestion,
      discountRecommendation: parsed.discountRecommendation?.trim() || base.discountRecommendation,
      closingStrategy: parsed.closingStrategy?.trim() || base.closingStrategy,
    };
  } catch {
    return fallback(input);
  }
}

export function whatsappCredentialsConfigured(): boolean {
  const direct = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim() && (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const twilio = (process.env.TWILIO_ACCOUNT_SID ?? "").trim() && (process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  return Boolean(direct || twilio);
}
