"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { findActivePortalAccountByEmail, createPortalToken, sendPortalMagicLinkEmail } from "@/lib/client-portal/service";

const requestSchema = z.object({
  email: z.string().email(),
});

function debugShowLink(): boolean {
  return process.env.CLIENT_PORTAL_DEBUG_SHOW_LINK === "true" || process.env.NODE_ENV !== "production";
}

export async function requestClientPortalMagicLinkAction(formData: FormData) {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
  });

  // Always respond generically to avoid account enumeration.
  if (!parsed.success) {
    redirect("/client/login?sent=1");
  }

  const account = await findActivePortalAccountByEmail(parsed.data.email);
  if (!account || !account.isActive) {
    redirect("/client/login?sent=1");
  }

  const link = await createPortalToken({ accountId: account.id, expiresInMinutes: 15 });

  await sendPortalMagicLinkEmail({
    to: account.email,
    toName: account.name,
    url: link.url,
    expiresAt: link.expiresAt,
  });

  if (debugShowLink()) {
    redirect(`/client/login?sent=1&debugLink=${encodeURIComponent(link.url)}`);
  }

  redirect("/client/login?sent=1");
}

