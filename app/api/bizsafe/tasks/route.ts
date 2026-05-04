import { NextRequest, NextResponse } from "next/server";
import { TaskPriority } from "@prisma/client";
import { z } from "zod";
import { createBizsafeTask, listBizsafeTasks } from "@/lib/bizsafe/service";
import { requireBizsafeEditAccess, requireBizsafeViewAccess } from "@/lib/bizsafe/access";

export const dynamic = "force-dynamic";

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignedTo: z.string().trim().max(160).optional().nullable(),
});

export async function GET() {
  await requireBizsafeViewAccess();
  const tasks = await listBizsafeTasks();
  return NextResponse.json({ ok: true, data: tasks });
}

export async function POST(req: NextRequest) {
  const user = await requireBizsafeEditAccess();
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = taskSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const row = await createBizsafeTask({
    title: parsed.data.title,
    description: parsed.data.description,
    dueDate: toDateOrNull(parsed.data.dueDate),
    priority: parsed.data.priority,
    assignedTo: parsed.data.assignedTo,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.json({ ok: true, data: row }, { status: 201 });
}

