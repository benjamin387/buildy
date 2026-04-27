import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}

export async function getGlobalPermissions(userId: string): Promise<Set<Permission>> {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });

  const permissions = new Set<Permission>();
  for (const userRole of roles) {
    for (const permission of userRole.role.permissions) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export async function getProjectPermissions(params: {
  userId: string;
  projectId: string;
}): Promise<Set<Permission>> {
  const permissions = await getGlobalPermissions(params.userId);

  const membership = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: params.projectId,
        userId: params.userId,
      },
    },
    include: { role: true },
  });

  if (membership?.role?.permissions) {
    for (const permission of membership.role.permissions) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export async function requirePermission(params: {
  permission: Permission;
  projectId?: string;
}) {
  const userId = await requireUserId();

  const effective = params.projectId
    ? await getProjectPermissions({ userId, projectId: params.projectId })
    : await getGlobalPermissions(userId);

  if (!effective.has(params.permission)) {
    throw new ForbiddenError();
  }

  return { userId, permissions: effective };
}
