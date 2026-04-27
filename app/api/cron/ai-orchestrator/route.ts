import { NextRequest, NextResponse } from "next/server";
import { runAIOrchestration } from "@/lib/ai/orchestrator";
import { validateCronSecret } from "@/lib/cron/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = validateCronSecret(req);
  if (unauthorized) return unauthorized;

  const dryRun = req.nextUrl.searchParams.get("dryRun")?.trim() === "true";
  const result = await runAIOrchestration({ dryRun, actorUserId: null });
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
