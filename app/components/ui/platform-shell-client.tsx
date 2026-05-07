"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { PlatformTopbar } from "@/app/components/ui/platform-topbar";
import { PlatformSidebar } from "@/app/components/ui/platform-sidebar";
import { MobileNav } from "@/app/components/ui/mobile-nav";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import type { CurrentUserAccess } from "@/lib/auth/module-access-shared";

const STORAGE_KEY = "buildy.ui.sidebarCollapsed.v2";

function readCollapsedFromStorage(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

function writeCollapsedToStorage(value: boolean) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export function PlatformShellClient(props: {
  user: SessionUser;
  permissions?: PermissionMatrix | null;
  moduleAccess?: CurrentUserAccess | null;
  companyBranding: {
    companyName: string;
    logoUrl: string | null;
  };
  children: ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Hydration-safe: localStorage is only available on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarCollapsed(readCollapsedFromStorage());
  }, []);

  const shell = useMemo(() => {
    return {
      sidebarCollapsed,
      setSidebarCollapsed(next: boolean) {
        setSidebarCollapsed(next);
        writeCollapsedToStorage(next);
      },
      mobileOpen,
      setMobileOpen,
    };
  }, [sidebarCollapsed, mobileOpen]);

  return (
    <div
      className={[
        "min-h-screen text-neutral-900",
        "bg-stone-50",
        // Subtle luxury backdrop without introducing dark mode bias.
        "bg-[radial-gradient(900px_circle_at_20%_0%,rgba(120,113,108,0.18),transparent_55%),radial-gradient(900px_circle_at_90%_0%,rgba(15,23,42,0.08),transparent_60%)]",
      ].join(" ")}
    >
      <div className="print:hidden">
        <PlatformTopbar
          user={props.user}
          companyBranding={props.companyBranding}
          permissions={props.permissions ?? null}
          sidebarCollapsed={shell.sidebarCollapsed}
          onToggleSidebarCollapsed={() => shell.setSidebarCollapsed(!shell.sidebarCollapsed)}
          onOpenMobileSidebar={() => shell.setMobileOpen(true)}
        />
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
        <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="print:hidden">
            <PlatformSidebar
              user={props.user}
              companyBranding={props.companyBranding}
              permissions={props.permissions ?? null}
              moduleAccess={props.moduleAccess ?? null}
              collapsed={shell.sidebarCollapsed}
              mobileOpen={shell.mobileOpen}
              onCloseMobile={() => shell.setMobileOpen(false)}
            />
          </div>
          <div className="min-w-0">{props.children}</div>
        </div>
      </div>

      <div className="print:hidden">
        <MobileNav user={props.user} permissions={props.permissions ?? null} onOpenMore={() => shell.setMobileOpen(true)} />
      </div>
    </div>
  );
}
