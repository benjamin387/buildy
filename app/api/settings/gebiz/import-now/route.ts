import { NextResponse } from "next/server";
import { requireExecutive } from "@/lib/rbac/executive";
import { runGebizRssImport } from "@/lib/gebiz/importer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireExecutive();

  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun")?.trim() === "true";
    const limit = Number(url.searchParams.get("limit") ?? "");
    const limitPerSource = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;
    const sourceId = url.searchParams.get("sourceId")?.trim() || undefined;

    // Settings endpoint can test a specific feed even if it is disabled.
    const result = await runGebizRssImport({ dryRun, limitPerSource, sourceId, includeDisabled: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json(
      { ok: false, error: "GeBIZ import failed.", message: message.slice(0, 400) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  // Convenience for manual testing.
  return POST(req);
}
