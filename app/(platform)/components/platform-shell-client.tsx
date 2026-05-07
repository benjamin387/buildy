import type { SessionUser } from "@/lib/auth/session";
import { PlatformShellClient as LuxuryPlatformShellClient } from "@/app/components/ui/platform-shell-client";

export function PlatformShellClient(props: {
  user: SessionUser;
  companyBranding: {
    companyName: string;
    logoUrl: string | null;
  };
  children: React.ReactNode;
}) {
  return (
    <LuxuryPlatformShellClient user={props.user} companyBranding={props.companyBranding}>
      {props.children}
    </LuxuryPlatformShellClient>
  );
}
