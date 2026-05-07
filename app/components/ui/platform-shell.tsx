import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { getUserPermissionsMatrix } from "@/lib/auth/permissions";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import { getCurrentUserAccess } from "@/lib/auth/module-access";
import type { CurrentUserAccess } from "@/lib/auth/module-access-shared";
import { getCompanyBranding } from "@/lib/branding";
import { PlatformShellClient } from "@/app/components/ui/platform-shell-client";

export async function PlatformShell(props: { user: SessionUser; children: ReactNode }) {
  const [permissions, moduleAccess, branding] = await Promise.all([
    getUserPermissionsMatrix(props.user).catch((): PermissionMatrix | null => null),
    getCurrentUserAccess().catch((): CurrentUserAccess | null => null),
    getCompanyBranding().catch(() => ({
      companyName: "Buildy",
      logoUrl: null,
    })),
  ]);

  return (
    <PlatformShellClient
      user={props.user}
      permissions={permissions}
      moduleAccess={moduleAccess}
      companyBranding={{ companyName: branding.companyName, logoUrl: branding.logoUrl }}
    >
      {props.children}
    </PlatformShellClient>
  );
}
