import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { getUserPermissionsMatrix } from "@/lib/auth/permissions";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import { getCurrentUserAccess } from "@/lib/auth/module-access";
import type { CurrentUserAccess } from "@/lib/auth/module-access-shared";
import { PlatformShellClient } from "@/app/components/ui/platform-shell-client";

export async function PlatformShell(props: { user: SessionUser; children: ReactNode }) {
  const permissions: PermissionMatrix | null = await getUserPermissionsMatrix(props.user).catch(() => null);
  const moduleAccess: CurrentUserAccess | null = await getCurrentUserAccess().catch(() => null);

  return (
    <PlatformShellClient user={props.user} permissions={permissions} moduleAccess={moduleAccess}>
      {props.children}
    </PlatformShellClient>
  );
}
