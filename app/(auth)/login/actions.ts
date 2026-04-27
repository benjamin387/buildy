"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath } from "@/lib/auth/redirect";
import {
  authenticateUser,
  createSession,
  recordLoginSuccess,
} from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

export async function loginWithPassword(
  _previousState: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl"),
  });

  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }

  const user = await authenticateUser({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (!user.ok) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.user.id);
  await recordLoginSuccess(user.user);
  redirect(
    getSafeRedirectPath(parsed.data.callbackUrl, {
      fallback: DEFAULT_AUTH_REDIRECT,
    }),
  );
}
