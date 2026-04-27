import { NextRequest, NextResponse } from "next/server";
import { runCollectionsAutomation } from "@/lib/collections/automation";
import { validateCronSecret } from "@/lib/cron/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = validateCronSecret(req);
  if (unauthorized) return unauthorized;

  const projectId = req.nextUrl.searchParams.get("projectId")?.trim() || undefined;
  const result = await runCollectionsAutomation({ projectId });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
