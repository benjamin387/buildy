import { NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { convertProcurementItemToPurchaseOrder } from "@/lib/execution/procurement-service";
import type { ExecutionActor } from "@/lib/execution/budget-service";

function actorFromUser(user: Awaited<ReturnType<typeof requireUser>>): ExecutionActor {
  return {
    userId: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    roleKeys: user.roleKeys,
    isAdmin: user.isAdmin,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string; itemId: string }> }) {
  const { projectId, itemId } = await ctx.params;
  const user = await requireUser();
  await requirePermission({ permission: Permission.SUPPLIER_WRITE, projectId });

  const body = (await req.json().catch(() => null)) as null | { issueDate?: string; expectedDeliveryDate?: string | null };
  const issueDate = body?.issueDate ? new Date(body.issueDate) : new Date();
  if (Number.isNaN(issueDate.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid issueDate." }, { status: 400 });
  }
  const expected = body?.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null;
  if (expected && Number.isNaN(expected.getTime())) {
    return NextResponse.json({ ok: false, error: "Invalid expectedDeliveryDate." }, { status: 400 });
  }

  const res = await convertProcurementItemToPurchaseOrder({
    projectId,
    planItemId: itemId,
    issueDate,
    expectedDeliveryDate: expected,
    actor: actorFromUser(user),
  });

  return NextResponse.json({ ok: true, ...res });
}

