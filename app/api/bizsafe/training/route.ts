import { NextRequest, NextResponse } from "next/server";
import { BizsafeLevel } from "@prisma/client";
import { z } from "zod";
import { createBizsafeTrainingRecord, listBizsafeTrainingRecords } from "@/lib/bizsafe/service";
import { requireBizsafeEditAccess, requireBizsafeViewAccess } from "@/lib/bizsafe/access";

export const dynamic = "force-dynamic";

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const trainingSchema = z.object({
  courseName: z.string().trim().min(1).max(200),
  courseLevel: z.nativeEnum(BizsafeLevel).optional().nullable(),
  attendeeName: z.string().trim().min(1).max(160),
  attendeeRole: z.string().trim().max(160).optional().nullable(),
  providerName: z.string().trim().max(160).optional().nullable(),
  courseDate: z.string().optional().nullable(),
  completionDate: z.string().optional().nullable(),
  certificateUrl: z.string().trim().url().optional().or(z.literal("")).nullable(),
  remarks: z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  await requireBizsafeViewAccess();
  const records = await listBizsafeTrainingRecords();
  return NextResponse.json({ ok: true, data: records });
}

export async function POST(req: NextRequest) {
  const user = await requireBizsafeEditAccess();
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = trainingSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const row = await createBizsafeTrainingRecord({
    courseName: parsed.data.courseName,
    courseLevel: parsed.data.courseLevel,
    attendeeName: parsed.data.attendeeName,
    attendeeRole: parsed.data.attendeeRole,
    providerName: parsed.data.providerName,
    courseDate: toDateOrNull(parsed.data.courseDate),
    completionDate: toDateOrNull(parsed.data.completionDate),
    certificateUrl: parsed.data.certificateUrl,
    remarks: parsed.data.remarks,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.json({ ok: true, data: row }, { status: 201 });
}

