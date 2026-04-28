import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron/cron-auth";
import { importGebizOpportunities } from "@/lib/gebiz/rss";

export const dynamic = "force-dynamic";

async function handleImport(request: NextRequest) {
  const unauthorized = validateCronSecret(request);
  if (unauthorized) {
    return NextResponse.json(
      { ok: false, error: unauthorized.status === 500 ? "Missing CRON_SECRET" : "Unauthorized" },
      { status: unauthorized.status || 401 },
    );
  }

  try {
    const result = await importGebizOpportunities();
    return NextResponse.json({
      ok: true,
      imported: result.importedCount,
      skipped: result.skippedCount,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[api/cron/gebiz] Import failed:", error);
    return NextResponse.json(
      {
        ok: false,
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Unexpected cron import failure."],
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleImport(request);
}

export async function POST(request: NextRequest) {
  return handleImport(request);
}
