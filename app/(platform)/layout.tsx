import { requireUser } from "@/lib/auth/session";
import { PlatformShell } from "@/app/(platform)/components/platform-shell";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return <PlatformShell user={user}>{children}</PlatformShell>;
}
