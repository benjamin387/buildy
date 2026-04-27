import "server-only";

import { requireUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new ForbiddenError();
  }
  return user;
}

