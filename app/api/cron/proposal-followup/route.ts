import { NextRequest, NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron/cron-auth";
import { runProposalFollowupCron } from "@/lib/proposals/follow-up";

export const dynamic = "force-dynamic";

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
    const result = await runProposalFollowupCron();
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected proposal follow-up failure.";
    console.error("[api/cron/proposal-followup] Failed:", error);
    return NextResponse.json({ ok: false, error: message.slice(0, 500) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
