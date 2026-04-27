import "server-only";

import { requireUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/rbac";

export async function requireExecutive() {
  const user = await requireUser();
  const isDirector = user.roleKeys.includes("DIRECTOR");
  if (!user.isAdmin && !isDirector) {
    throw new ForbiddenError();
  }
  return user;
}

