"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { clearClientPortalSession } from "@/lib/client-portal/session";
import { requireClientPortalAccount } from "@/lib/client-portal/auth";
import { createClientPortalMessage } from "@/lib/client-portal/service";

export async function clientPortalSignOutAction() {
  await clearClientPortalSession();
  redirect("/client/login");
}

const messageSchema = z.object({
  projectId: z.string().min(1),
  subject: z.string().min(1).max(120),
  message: z.string().min(1).max(5000),
});

export async function submitClientPortalMessageAction(formData: FormData) {
  const account = await requireClientPortalAccount();

  const parsed = messageSchema.safeParse({
    projectId: formData.get("projectId"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });
  if (!parsed.success) throw new Error("Invalid message.");

  // Access control is enforced in the project page; service also logs.
  await createClientPortalMessage({
    projectId: parsed.data.projectId,
    accountId: account.id,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  redirect(`/client/portal/projects/${parsed.data.projectId}`);
}

