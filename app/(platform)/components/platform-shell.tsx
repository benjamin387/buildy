import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { PlatformShell as LuxuryPlatformShell } from "@/app/components/ui/platform-shell";

export function PlatformShell(props: { user: SessionUser; children: ReactNode }) {
  return <LuxuryPlatformShell user={props.user}>{props.children}</LuxuryPlatformShell>;
}
