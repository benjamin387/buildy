"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { markAllNotificationsAsRead, markNotificationAsRead } from "@/lib/notifications/service";

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await markAllNotificationsAsRead({ user });
  revalidatePath("/notifications");
}

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await markNotificationAsRead({ user, id });
  revalidatePath("/notifications");
}

