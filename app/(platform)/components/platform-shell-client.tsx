import type { SessionUser } from "@/lib/auth/session";
import { PlatformShellClient as LuxuryPlatformShellClient } from "@/app/components/ui/platform-shell-client";

export function PlatformShellClient(props: { user: SessionUser; children: React.ReactNode }) {
  return <LuxuryPlatformShellClient user={props.user}>{props.children}</LuxuryPlatformShellClient>;
}
