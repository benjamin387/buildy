import { NextRequest, NextResponse } from "next/server";
import { importGebizOpportunities } from "@/lib/gebiz/rss";

export const dynamic = "force-dynamic";

function validateBearerToken(request: Request): NextResponse | null {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const authHeader = (request.headers.get("authorization") ?? "").trim();
  const provided =
    authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice("bearer ".length).trim() : "";

  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = validateBearerToken(request);
  if (unauthorized) return unauthorized;

  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "");
    const result = await importGebizOpportunities({
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined,
    });

    return NextResponse.json({
      ok: true,
      imported: result.importedCount,
      skipped: result.skippedCount,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[api/gebiz/import] Import failed:", error);
    return NextResponse.json(
      {
        ok: false,
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Unexpected import failure."],
      },
      { status: 500 },
    );
  }
}
