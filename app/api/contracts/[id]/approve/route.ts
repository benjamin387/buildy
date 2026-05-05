import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { approveContract } from "@/lib/contracts/signature-engine";

const schema = z.object({
  comment: z.string().max(1000).optional().nullable(),
  clientPortalAccessId: z.string().optional().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const input = schema.parse(await req.json().catch(() => ({})));
    await approveContract({ contractId: id, comment: input.comment, clientPortalAccessId: input.clientPortalAccessId });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve contract.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
