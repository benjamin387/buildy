import { NextResponse } from "next/server";
import { z } from "zod";
import { requireExecutive } from "@/lib/rbac/executive";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { approveBidCostVersion } from "@/lib/bidding/cost-builder";

export const dynamic = "force-dynamic";

const schema = z.object({
  costVersionId: z.string().min(1),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "approve" });
  const executive = await requireExecutive();
  const { id: opportunityId } = await ctx.params;

  const form = await req.formData();
  const res = schema.safeParse({ costVersionId: form.get("costVersionId"), remarks: form.get("remarks") });
  if (!res.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });

  await approveBidCostVersion({
    opportunityId,
    costVersionId: res.data.costVersionId,
    approver: { name: executive.name, email: executive.email, role: executive.primaryRoleLabel },
    remarks: res.data.remarks || null,
  });

  return NextResponse.redirect(new URL(`/bidding/${opportunityId}/cost-versions`, req.url));
}
