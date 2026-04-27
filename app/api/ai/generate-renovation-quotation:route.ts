import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateAiRenovationQuotation } from "@/lib/quotation-engine/ai-renovation-generator";

const requestSchema = z.object({
  prompt: z.string().min(10),
  propertyType: z.enum(["HDB", "CONDO", "LANDED", "COMMERCIAL", "OTHER"]),
  unitSizeSqft: z.coerce.number().min(300).max(20000),
  projectName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = requestSchema.parse(body);

    const generated = generateAiRenovationQuotation(input);

    return NextResponse.json({
      success: true,
      data: generated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate AI quotation draft",
      },
      { status: 400 },
    );
  }
}