import { NextRequest, NextResponse } from "next/server";

import { executeApprovedActionRequest } from "@/lib/ai/action-approval";
import { requireUser } from "@/lib/auth/session";

type PathParams = {
  params: Promise<{ id: string }>;
};

function getRequestContext(req: NextRequest) {
  return {
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null,
    userAgent: req.headers.get("user-agent") || null,
  };
}

export async function POST(_req: NextRequest, context: PathParams) {
  const user = await requireUser();
  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "Action request id is required." }, { status: 400 });
  }

  const requestContext = getRequestContext(_req);

  const result = await executeApprovedActionRequest({
    actionRequestId: id,
    userId: user.id,
    ipAddress: requestContext.ipAddress,
    userAgent: requestContext.userAgent,
  });

  if (result.status === "REJECTED") {
    return NextResponse.json(
      { ok: false, status: result.status, message: result.message ?? "Action request not found or already processed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, status: result.status, message: result.message, result: result.result });
}
