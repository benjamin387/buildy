import { NextRequest, NextResponse } from "next/server";

import { setActionRequestApprovalState } from "@/lib/ai/action-approval";
import { requireUser } from "@/lib/auth/session";
import { AiActionRequestStatus } from "@prisma/client";

type PathParams = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: NextRequest, context: PathParams) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "Action request id is required." }, { status: 400 });
  }

  const updated = await setActionRequestApprovalState({
    actionRequestId: id,
    userId: user.id,
    nextStatus: AiActionRequestStatus.REJECTED,
  });

  if (!updated) {
    return NextResponse.json(
      { ok: false, status: AiActionRequestStatus.REJECTED, error: "Action request not found or already processed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
