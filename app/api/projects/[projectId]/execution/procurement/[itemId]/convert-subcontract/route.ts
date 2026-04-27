import { NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { convertProcurementItemToSubcontract } from "@/lib/execution/procurement-service";
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

export async function POST(_: Request, ctx: { params: Promise<{ projectId: string; itemId: string }> }) {
  const { projectId, itemId } = await ctx.params;
  const user = await requireUser();
  await requirePermission({ permission: Permission.SUBCONTRACT_WRITE, projectId });

  const res = await convertProcurementItemToSubcontract({
    projectId,
    planItemId: itemId,
    actor: actorFromUser(user),
  });

  return NextResponse.json({ ok: true, ...res });
}

