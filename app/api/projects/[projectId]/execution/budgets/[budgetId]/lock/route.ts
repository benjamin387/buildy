import { NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { requireExecutive } from "@/lib/rbac/executive";
import { lockBudget, type ExecutionActor } from "@/lib/execution/budget-service";

function actorFromUser(user: Awaited<ReturnType<typeof requireUser>>): ExecutionActor {
  return {
    userId: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    roleKeys: user.roleKeys,
    isAdmin: user.isAdmin,
  };
}

export async function POST(_: Request, ctx: { params: Promise<{ projectId: string; budgetId: string }> }) {
  const { projectId, budgetId } = await ctx.params;
  await requireExecutive();
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const updated = await lockBudget({ projectId, budgetId, actor: actorFromUser(user) });
  return NextResponse.json({ ok: true, budgetId: updated.id, status: updated.status, isActive: updated.isActive });
}

