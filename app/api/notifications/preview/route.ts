import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { getUserNotificationPreview } from "@/lib/notifications/service";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preview = await getUserNotificationPreview({ user: session.user, take: 5 });
    return NextResponse.json({ ok: true, ...preview });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load notifications.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

