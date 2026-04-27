import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { generateBidCostVersionFromRfq } from "@/lib/bidding/cost-builder";

export const dynamic = "force-dynamic";

const schema = z.object({
  rfqId: z.string().min(1),
  strategyMode: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).default("BALANCED"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const { id: opportunityId } = await ctx.params;

  const form = await req.formData();
  const res = schema.safeParse({
    rfqId: form.get("rfqId"),
    strategyMode: form.get("strategyMode"),
  });
  if (!res.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  await generateBidCostVersionFromRfq({
    opportunityId,
    rfqId: res.data.rfqId,
    strategyMode: res.data.strategyMode,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.redirect(new URL(`/bidding/${opportunityId}/cost-versions`, req.url));
}

