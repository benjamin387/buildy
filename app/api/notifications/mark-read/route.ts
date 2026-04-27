import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { markNotificationAsRead } from "@/lib/notifications/service";

const BodySchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  }

  try {
    const row = await markNotificationAsRead({ user: session.user, id: parsed.data.id });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark notification as read.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

