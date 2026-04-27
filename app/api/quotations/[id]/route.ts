import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        client: true,
        project: true,
        sections: {
          include: {
            lineItems: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
        acceptance: true,
      },
    });

    if (!quotation) {
      return NextResponse.json(
        { success: false, error: "Quotation not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch quotation",
      },
      { status: 500 },
    );
  }
}