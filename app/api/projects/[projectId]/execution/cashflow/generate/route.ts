import { NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac";
import { requireExecutive } from "@/lib/rbac/executive";
import { generateExecutionCashflowSnapshot } from "@/lib/execution/cashflow-auto";
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

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  await requireExecutive();
  const user = await requireUser();
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  const body = (await req.json().catch(() => null)) as null | { openingBalance?: number; horizonDays?: number };
  const assumptions = {
    openingBalance: typeof body?.openingBalance === "number" ? body.openingBalance : undefined,
    horizonDays: typeof body?.horizonDays === "number" ? body.horizonDays : undefined,
  };

  const snapshot = await generateExecutionCashflowSnapshot({ projectId, actor: actorFromUser(user), assumptions });
  return NextResponse.json({ ok: true, snapshotId: snapshot.id, riskLevel: snapshot.riskLevel });
}

