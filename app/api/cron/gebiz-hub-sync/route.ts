import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron/cron-auth";
import { runGebizHubSync } from "@/lib/gebiz/hub-sync";

export const dynamic = "force-dynamic";

function parseLimit(raw: string | null): number | null {
  const value = Number(raw ?? "");
  return Number.isFinite(value) ? value : null;
}

async function handleRequest(request: NextRequest) {
  const unauthorized = validateCronSecret(request);
  if (unauthorized) {
    const status = unauthorized.status || 401;
    return NextResponse.json(
      { ok: false, error: status === 500 ? "Missing CRON_SECRET" : "Unauthorized" },
      { status },
    );
  }

  try {
    const result = await runGebizHubSync({
      importAll: request.nextUrl.searchParams.get("all")?.trim() === "1",
      since: request.nextUrl.searchParams.get("since")?.trim() || null,
      limit: parseLimit(request.nextUrl.searchParams.get("limit")),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected GeBIZ hub sync failure.";
    console.error("[api/cron/gebiz-hub-sync] Sync failed:", error);
    return NextResponse.json({ ok: false, error: message.slice(0, 500) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
