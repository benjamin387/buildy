import "server-only";

export const DESIGN_BOQ_CATEGORIES = [
  "Hacking",
  "Masonry",
  "Ceiling",
  "Flooring",
  "Carpentry",
  "Electrical",
  "Plumbing",
  "Painting",
  "Glass & Aluminium",
  "Doors",
  "Fixtures",
  "Cleaning",
  "Project Management",
] as const;

type DesignBOQGenerationInput = {
  clientName: string;
  propertyType: string;
  preferredStyle: string | null;
  timeline: string | null;
  requirements: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  conceptTitle: string;
  conceptSummary: string;
  livingRoomConcept: string | null;
  bedroomConcept: string | null;
  kitchenConcept: string | null;
  bathroomConcept: string | null;
  materialPalette: string | null;
  renovationScope: string | null;
};

export type GeneratedBOQItem = {
  room: string;
  category: (typeof DESIGN_BOQ_CATEGORIES)[number] | string;
  description: string;
  quantity: number;
  unit: string;
  costRate: number;
  sellingRate: number;
  supplierType: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  aiNotes: string;
};

export type GeneratedBOQPayload = {
  title: string;
  aiRiskNotes: string;
  items: GeneratedBOQItem[];
};

function hasOpenAiKey(): boolean {
  return Boolean((process.env.OPENAI_API_KEY ?? "").trim());
}

function clamp(value: string, max = 7000): string {
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
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
    throw new Error(body?.error?.message || `OpenAI request failed (${response.status})`);
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

function mockBudgetBand(input: DesignBOQGenerationInput): string {
  const min = input.budgetMin ?? 60000;
  const max = input.budgetMax ?? 90000;
  return `$${min.toLocaleString()}-$${max.toLocaleString()}`;
}

function mockItems(): GeneratedBOQItem[] {
  return [
    { room: "Whole Unit", category: "Hacking", description: "Demolition and disposal for flooring, carpentry, and fixtures", quantity: 1, unit: "lot", costRate: 3200, sellingRate: 4800, supplierType: "Subcontractor", riskLevel: "MEDIUM", aiNotes: "Check structural and concealed services before hacking." },
    { room: "Living Room", category: "Masonry", description: "Feature wall base, patching, and localized screeding", quantity: 1, unit: "lot", costRate: 1800, sellingRate: 2900, supplierType: "Subcontractor", riskLevel: "MEDIUM", aiNotes: "Align feature wall dimensions with TV and wiring plan." },
    { room: "Bedrooms", category: "Ceiling", description: "Gypsum false ceiling and cove light prep", quantity: 3, unit: "room", costRate: 900, sellingRate: 1450, supplierType: "Subcontractor", riskLevel: "LOW", aiNotes: "Confirm ceiling drop heights against wardrobe clearances." },
    { room: "Whole Unit", category: "Flooring", description: "SPC/porcelain flooring supply and install", quantity: 1, unit: "lot", costRate: 6900, sellingRate: 10800, supplierType: "Supplier + Installer", riskLevel: "MEDIUM", aiNotes: "Include skirting transitions and levelling contingencies." },
    { room: "Kitchen", category: "Carpentry", description: "Custom base and wall cabinets with quartz countertop", quantity: 1, unit: "set", costRate: 8200, sellingRate: 12800, supplierType: "Carpentry Workshop", riskLevel: "HIGH", aiNotes: "Final rate depends on internal fittings and finish grade." },
    { room: "Bedrooms", category: "Carpentry", description: "Built-in wardrobes and study carpentry", quantity: 3, unit: "room", costRate: 2500, sellingRate: 3900, supplierType: "Carpentry Workshop", riskLevel: "MEDIUM", aiNotes: "Coordinate wardrobe internals with client storage priorities." },
    { room: "Whole Unit", category: "Electrical", description: "Rewiring, new lighting points, and smart switch prep", quantity: 1, unit: "lot", costRate: 4300, sellingRate: 6900, supplierType: "Licensed Electrician", riskLevel: "HIGH", aiNotes: "Older HDB units may need additional circuit upgrades." },
    { room: "Kitchen + Bathrooms", category: "Plumbing", description: "Water point rerouting and sanitary fittings install", quantity: 3, unit: "area", costRate: 1300, sellingRate: 2100, supplierType: "Licensed Plumber", riskLevel: "MEDIUM", aiNotes: "Site verification required for concealed pipe alignment." },
    { room: "Whole Unit", category: "Painting", description: "Surface prep and premium paint system", quantity: 1, unit: "lot", costRate: 2600, sellingRate: 4200, supplierType: "Painting Subcontractor", riskLevel: "LOW", aiNotes: "Darker palettes may require additional coats." },
    { room: "Kitchen", category: "Glass & Aluminium", description: "Kitchen glass backsplash and framing works", quantity: 1, unit: "lot", costRate: 900, sellingRate: 1600, supplierType: "Specialist Installer", riskLevel: "LOW", aiNotes: "Tempered glass lead time and final color lock needed." },
    { room: "Main Entrance + Bedrooms", category: "Doors", description: "Door replacement, locksets, and hardware", quantity: 4, unit: "door", costRate: 380, sellingRate: 650, supplierType: "Door Supplier", riskLevel: "LOW", aiNotes: "Verify fire-rated requirements where applicable." },
    { room: "Bathrooms", category: "Fixtures", description: "Vanity accessories, mirror cabinets, and sanitary fixtures", quantity: 2, unit: "bathroom", costRate: 1700, sellingRate: 2800, supplierType: "Fixture Supplier", riskLevel: "MEDIUM", aiNotes: "Final selection affects both cost and lead time." },
    { room: "Whole Unit", category: "Cleaning", description: "Post-renovation cleaning and polish", quantity: 1, unit: "lot", costRate: 500, sellingRate: 900, supplierType: "Cleaning Vendor", riskLevel: "LOW", aiNotes: "Book after all defect touch-ups are done." },
    { room: "Whole Unit", category: "Project Management", description: "Site supervision, scheduling, QA/QC, and handover coordination", quantity: 1, unit: "lot", costRate: 2800, sellingRate: 5200, supplierType: "Internal PM", riskLevel: "LOW", aiNotes: "Include contingency for authority approvals and rework cycles." },
  ];
}

function mockPayload(input: DesignBOQGenerationInput): GeneratedBOQPayload {
  return {
    title: `${input.clientName} - AI BOQ (${mockBudgetBand(input)})`,
    aiRiskNotes:
      "Key risks: concealed M&E conditions, carpentry finish upgrades, and timeline compression. Hold 8-12% contingency for change orders.",
    items: mockItems(),
  };
}

export async function generateDesignBoqAi(input: DesignBOQGenerationInput): Promise<GeneratedBOQPayload> {
  if (!hasOpenAiKey()) return mockPayload(input);

  try {
    const prompt = [
      "You are a senior renovation QS and interior project estimator.",
      "Generate practical BOQ for Singapore 4-room HDB modern luxury renovation context when details are missing.",
      "Return JSON only with keys: title, aiRiskNotes, items.",
      "items[] keys: room, category, description, quantity, unit, costRate, sellingRate, supplierType, riskLevel, aiNotes.",
      `Allowed categories: ${DESIGN_BOQ_CATEGORIES.join(", ")}`,
      "Use realistic values within approximately 60k-90k total selling price unless user budget says otherwise.",
      `Client: ${input.clientName}`,
      `PropertyType: ${input.propertyType}`,
      `PreferredStyle: ${input.preferredStyle ?? "N/A"}`,
      `Timeline: ${input.timeline ?? "N/A"}`,
      `BudgetMin: ${input.budgetMin ?? "N/A"}`,
      `BudgetMax: ${input.budgetMax ?? "N/A"}`,
      `ConceptTitle: ${input.conceptTitle}`,
      `ConceptSummary: ${clamp(input.conceptSummary, 1800)}`,
      `Living: ${clamp(input.livingRoomConcept ?? "N/A", 800)}`,
      `Bedroom: ${clamp(input.bedroomConcept ?? "N/A", 800)}`,
      `Kitchen: ${clamp(input.kitchenConcept ?? "N/A", 800)}`,
      `Bathroom: ${clamp(input.bathroomConcept ?? "N/A", 800)}`,
      `Materials: ${clamp(input.materialPalette ?? "N/A", 800)}`,
      `RenovationScope: ${clamp(input.renovationScope ?? "N/A", 1200)}`,
      `Requirements: ${clamp(input.requirements ?? "N/A", 1800)}`,
    ].join("\n");

    const raw = await requestOpenAi(prompt);
    const parsed = JSON.parse(raw) as Partial<GeneratedBOQPayload>;

    if (!parsed.title || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new Error("Incomplete AI BOQ payload");
    }

    const normalized = parsed.items
      .map((item: any): GeneratedBOQItem | null => {
        if (!item || typeof item !== "object") return null;
        const quantity = Number(item.quantity);
        const costRate = Number(item.costRate);
        const sellingRate = Number(item.sellingRate);
        if (!Number.isFinite(quantity) || !Number.isFinite(costRate) || !Number.isFinite(sellingRate)) return null;

        const riskRaw = String(item.riskLevel ?? "MEDIUM").toUpperCase();
        const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
          riskRaw === "LOW" || riskRaw === "HIGH" ? (riskRaw as "LOW" | "HIGH") : "MEDIUM";

        return {
          room: String(item.room ?? "Whole Unit").trim() || "Whole Unit",
          category: String(item.category ?? "Project Management").trim() || "Project Management",
          description: String(item.description ?? "Renovation work item").trim() || "Renovation work item",
          quantity: Math.max(0, quantity),
          unit: String(item.unit ?? "lot").trim() || "lot",
          costRate: Math.max(0, costRate),
          sellingRate: Math.max(0, sellingRate),
          supplierType: String(item.supplierType ?? "Subcontractor").trim() || "Subcontractor",
          riskLevel,
          aiNotes: String(item.aiNotes ?? "").trim(),
        };
      })
      .filter((item): item is GeneratedBOQItem => item !== null);

    if (normalized.length === 0) throw new Error("No valid AI BOQ items");

    return {
      title: String(parsed.title).trim(),
      aiRiskNotes: String(parsed.aiRiskNotes ?? "").trim(),
      items: normalized,
    };
  } catch {
    return mockPayload(input);
  }
}
