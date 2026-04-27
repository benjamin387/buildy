import { NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { requireExecutive } from "@/lib/rbac/executive";
import { unlockBudget, type ExecutionActor } from "@/lib/execution/budget-service";

function actorFromUser(user: Awaited<ReturnType<typeof requireUser>>): ExecutionActor {
  return {
    userId: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    roleKeys: user.roleKeys,
    isAdmin: user.isAdmin,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string; budgetId: string }> }) {
  const { projectId, budgetId } = await ctx.params;
  const user = await requireExecutive();
  const isDirector = user.roleKeys.includes("DIRECTOR");
  if (!user.isAdmin && !isDirector) {
    return NextResponse.json({ ok: false, error: "Director approval required to unlock budgets." }, { status: 403 });
  }

  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const body = (await req.json().catch(() => null)) as null | { reason?: string };
  const reason = body?.reason?.trim() ?? "";
  if (reason.length < 5) {
    return NextResponse.json({ ok: false, error: "Unlock reason is required (min 5 chars)." }, { status: 400 });
  }

  const updated = await unlockBudget({ projectId, budgetId, actor: actorFromUser(user), reason });
  return NextResponse.json({ ok: true, budgetId: updated.id, status: updated.status, isActive: updated.isActive });
}

