import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { normalizePhoneNumber } from "@/lib/validation/phone";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  mobileNumber: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  telegramChatId: z.string().optional().nullable(),
  canSubmitLeads: z.boolean().optional(),
});

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      mobileNumber: true,
      whatsappNumber: true,
      telegramChatId: true,
      canSubmitLeads: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, data: user });
}

export async function PATCH(req: NextRequest) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const mobileNumber =
    parsed.data.mobileNumber === undefined ? undefined : normalizePhoneNumber(parsed.data.mobileNumber) ?? null;
  const whatsappNumber =
    parsed.data.whatsappNumber === undefined ? undefined : normalizePhoneNumber(parsed.data.whatsappNumber) ?? null;
  const telegramChatId =
    parsed.data.telegramChatId === undefined ? undefined : (parsed.data.telegramChatId?.trim() || null);

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      mobileNumber,
      whatsappNumber,
      telegramChatId,
      canSubmitLeads: parsed.data.canSubmitLeads ?? undefined,
    },
    select: {
      id: true,
      mobileNumber: true,
      whatsappNumber: true,
      telegramChatId: true,
      canSubmitLeads: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, data: updated });
}

