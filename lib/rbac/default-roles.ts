import { Permission } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ROLE_DEFINITIONS } from "@/lib/rbac/permissions";

type SeedRole = {
  key: string;
  name: string;
  description?: string;
  permissions: Permission[];
};

const DEFAULT_ROLES: SeedRole[] = ROLE_DEFINITIONS;

export async function ensureDefaultRoles(): Promise<void> {
  await Promise.all(
    DEFAULT_ROLES.map((role) =>
      prisma.role.upsert({
        where: { key: role.key },
        create: {
          key: role.key,
          name: role.name,
          description: role.description ?? null,
          permissions: role.permissions,
        },
        update: {
          name: role.name,
          description: role.description ?? null,
          permissions: role.permissions,
        },
      }),
    ),
  );
}
