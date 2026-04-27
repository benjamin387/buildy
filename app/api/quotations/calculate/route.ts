import { NextRequest, NextResponse } from "next/server";
import { computeQuotation, validateQuotationInput } from "@/lib/quotation-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateQuotationInput(body);
    const quotation = computeQuotation(input);

    return NextResponse.json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: 400 },
    );
  }
}