import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron/cron-auth";
import { runGebizRssImport } from "@/lib/gebiz/importer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = validateCronSecret(req);
  if (unauthorized) {
    const status = unauthorized.status || 401;
    if (status === 500) {
      return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: "Unauthorized", expectedEnv: "CRON_SECRET" }, { status: 401 });
  }

  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun")?.trim() === "true";
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "");
    const limitPerSource = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
    const sourceId = req.nextUrl.searchParams.get("sourceId")?.trim() || undefined;

    const result = await runGebizRssImport({ dryRun, limitPerSource, sourceId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json(
      { ok: false, error: "GeBIZ import failed.", message: message.slice(0, 400) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
