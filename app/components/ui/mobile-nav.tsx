"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { Bot, BriefcaseBusiness, LayoutDashboard, Menu, LifeBuoy } from "lucide-react";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import { can as canDo } from "@/lib/auth/permissions-shared";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav(props: {
  user: SessionUser;
  permissions?: PermissionMatrix | null;
  onOpenMore: () => void;
}) {
  const pathname = usePathname();
  const isExec = props.user.isAdmin || props.user.roleKeys.includes("DIRECTOR");
  const aiHref = isExec ? "/ai-actions" : "/sales/assistant";

  const canViewDashboard = !props.permissions || canDo(props.permissions, "DASHBOARD" satisfies PermissionModuleKey, "view");
  const canViewLeads = !props.permissions || canDo(props.permissions, "LEADS" satisfies PermissionModuleKey, "view");
  const canViewProjects = !props.permissions || canDo(props.permissions, "PROJECTS" satisfies PermissionModuleKey, "view");
  const canViewAi = !props.permissions || canDo(props.permissions, "AI_ACTIONS" satisfies PermissionModuleKey, "view");

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 lg:hidden">
      <div className="mx-auto grid max-w-[720px] grid-cols-5 px-2 py-2">
        {canViewDashboard ? (
          <NavItem href="/dashboard" label="Home" icon={<LayoutDashboard className="h-5 w-5" />} active={isActive(pathname, "/dashboard")} />
        ) : (
          <span />
        )}
        {canViewLeads ? (
          <NavItem href="/leads" label="Leads" icon={<LifeBuoy className="h-5 w-5" />} active={isActive(pathname, "/leads")} />
        ) : (
          <span />
        )}
        {canViewProjects ? (
          <NavItem href="/projects" label="Projects" icon={<BriefcaseBusiness className="h-5 w-5" />} active={isActive(pathname, "/projects")} />
        ) : (
          <span />
        )}
        {canViewAi ? (
          <NavItem href={aiHref} label="AI" icon={<Bot className="h-5 w-5" />} active={isActive(pathname, aiHref)} />
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={props.onOpenMore}
          className={cx(
            "flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-xs font-semibold transition",
            "text-neutral-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
          )}
          aria-label="More"
        >
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}

function NavItem(props: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link
      href={props.href}
      className={cx(
        "flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-stone-50",
      )}
      aria-current={props.active ? "page" : undefined}
    >
      {props.icon}
      <span>{props.label}</span>
    </Link>
  );
}
