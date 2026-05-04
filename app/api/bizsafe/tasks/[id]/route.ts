import { NextRequest, NextResponse } from "next/server";
import { TaskPriority } from "@prisma/client";
import { z } from "zod";
import { deleteBizsafeTask, updateBizsafeTask } from "@/lib/bizsafe/service";
import { requireBizsafeEditAccess } from "@/lib/bizsafe/access";

export const dynamic = "force-dynamic";

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  isCompleted: z.boolean().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignedTo: z.string().trim().max(160).optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireBizsafeEditAccess();
  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = taskPatchSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const row = await updateBizsafeTask({
    id,
    title: parsed.data.title,
    description: parsed.data.description,
    dueDate: parsed.data.dueDate === undefined ? undefined : toDateOrNull(parsed.data.dueDate),
    isCompleted: parsed.data.isCompleted,
    priority: parsed.data.priority,
    assignedTo: parsed.data.assignedTo,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.json({ ok: true, data: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireBizsafeEditAccess();
  const { id } = await ctx.params;

  await deleteBizsafeTask({
    id,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.json({ ok: true });
}

