import { NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createBudgetRevisionFromActiveLocked, type ExecutionActor } from "@/lib/execution/budget-service";

function actorFromUser(user: Awaited<ReturnType<typeof requireUser>>): ExecutionActor {
  return {
    userId: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    roleKeys: user.roleKeys,
    isAdmin: user.isAdmin,
  };
}

export async function GET(_: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  await requireUser();
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const budgets = await prisma.projectBudget.findMany({
    where: { projectId },
    orderBy: [{ versionNo: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return NextResponse.json({ ok: true, budgets });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_WRITE, projectId });

  const body = (await req.json().catch(() => null)) as null | { note?: string };
  const note = body?.note?.trim() ? body.note.trim() : null;

  const created = await createBudgetRevisionFromActiveLocked({ projectId, actor: actorFromUser(user), note });
  return NextResponse.json({ ok: true, budgetId: created.id, versionNo: created.versionNo });
}

