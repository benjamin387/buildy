import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { markAllNotificationsAsRead } from "@/lib/notifications/service";

export async function POST() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await markAllNotificationsAsRead({ user: session.user });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark notifications as read.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

