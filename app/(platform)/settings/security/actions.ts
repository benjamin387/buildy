"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticatedSession,
  revokeOtherSessionsForUser,
  revokeSessionById,
  SessionAccessError,
} from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/security/password";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export async function revokeSession(sessionId: string) {
  try {
    await revokeSessionById(sessionId);
    revalidatePath("/settings/security");
  } catch (error) {
    if (error instanceof SessionAccessError) {
      throw error;
    }

    throw error;
  }
}

export async function changePassword(
  _previousState: { error: string; success: string },
  formData: FormData,
): Promise<{ error: string; success: string }> {
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: "Please provide a valid current password and a new password with at least 8 characters.",
      success: "",
    };
  }

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return {
      error: "New password and confirmation do not match.",
      success: "",
    };
  }

  const currentSession = await requireAuthenticatedSession();
  const currentUser = await prisma.user.findUnique({
    where: { id: currentSession.user.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      passwordSalt: true,
    },
  });

  if (!currentUser) {
    return {
      error: "Unable to load your account.",
      success: "",
    };
  }

  const passwordMatches = await verifyPassword({
    password: parsed.data.currentPassword,
    hashBase64: currentUser.passwordHash,
    saltBase64: currentUser.passwordSalt,
  });

  if (!passwordMatches) {
    return {
      error: "Current password is incorrect.",
      success: "",
    };
  }

  const digest = await hashPassword(parsed.data.newPassword);

  await prisma.user.update({
    where: { id: currentUser.id },
    data: {
      passwordHash: digest.hashBase64,
      passwordSalt: digest.saltBase64,
    },
  });

  const revokedCount = await revokeOtherSessionsForUser({
    userId: currentUser.id,
    currentSessionId: currentSession.session.id,
    emailAttempted: currentUser.email,
    reason: "PASSWORD_CHANGED",
  });

  revalidatePath("/settings/security");

  return {
    error: "",
    success:
      revokedCount > 0
        ? `Password updated. ${revokedCount} other session(s) were revoked.`
        : "Password updated.",
  };
}
