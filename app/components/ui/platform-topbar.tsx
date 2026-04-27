"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { SignOutButton } from "@/app/(platform)/sign-out-button";
import { NotificationBell } from "@/app/components/ui/notification-bell";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import { can as canDo } from "@/lib/auth/permissions-shared";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import {
  ChevronDown,
  Command,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  SidebarClose,
  SidebarOpen,
} from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function initials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/g).filter(Boolean);
  const first = parts[0]?.[0] ?? trimmed[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + last).toUpperCase();
}

export function PlatformTopbar(props: {
  user: SessionUser;
  permissions?: PermissionMatrix | null;
  sidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
  onOpenMobileSidebar: () => void;
}) {
  const displayName = props.user.name ?? props.user.email;
  const avatar = useMemo(() => initials(displayName), [displayName]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const perms = props.permissions ?? null;
  const canCreateProject = !perms || canDo(perms, "PROJECTS" satisfies PermissionModuleKey, "create");
  const canCreateLead = !perms || canDo(perms, "LEADS" satisfies PermissionModuleKey, "create");
  const canViewQuotations = !perms || canDo(perms, "QUOTATIONS" satisfies PermissionModuleKey, "view");

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={props.onOpenMobileSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-neutral-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={props.onToggleSidebarCollapsed}
          className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-neutral-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:inline-flex"
          aria-label={props.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {props.sidebarCollapsed ? <SidebarOpen className="h-4 w-4" /> : <SidebarClose className="h-4 w-4" />}
        </button>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-2xl px-2 py-1 text-sm font-semibold tracking-tight text-neutral-950 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          <LayoutGrid className="h-4 w-4 text-neutral-700" />
          <span>Buildy</span>
        </Link>

        <div className="mx-2 hidden h-6 w-px bg-slate-200 lg:block" />

        <form action="/projects" method="get" className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            name="q"
            placeholder="Search projects (code, client, address)…"
            className={cx(
              "h-10 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none ring-neutral-400 transition",
              "focus:ring-2",
            )}
            aria-label="Global search"
          />
          <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-neutral-500 lg:flex">
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        </form>

        <div className="flex items-center gap-2">
          <NotificationBell />

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setQuickOpen((v) => !v);
                setProfileOpen(false);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              aria-expanded={quickOpen}
              aria-label="Quick create"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            </button>

            {quickOpen ? (
              <div
                className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                role="menu"
              >
                {canCreateProject ? (
                  <MenuLink href="/projects/new" title="New project" description="Create a new project record." />
                ) : null}
                {canCreateLead ? (
                  <MenuLink href="/leads/new" title="New lead" description="Capture a new customer lead." />
                ) : null}
                {canViewQuotations ? (
                  <MenuLink href="/projects" title="New quotation" description="Open a project to create a quotation." />
                ) : null}
                {!canCreateProject && !canCreateLead && !canViewQuotations ? (
                  <div className="px-4 py-3 text-xs text-neutral-600">No quick actions available for your role.</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => !v);
                setQuickOpen(false);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 pr-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              aria-expanded={profileOpen}
              aria-label="User menu"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-xs font-bold text-white">
                {avatar}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-4 text-neutral-950">{displayName}</span>
                <span className="block text-xs font-medium text-neutral-500">{props.user.primaryRoleLabel}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            </button>

            {profileOpen ? (
              <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-200 px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{displayName}</p>
                  <p className="mt-0.5 text-xs text-neutral-600">{props.user.email}</p>
                </div>
                <div className="p-2">
                  <Link
                    href="/settings"
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    Settings
                    <span className="text-xs text-neutral-400">→</span>
                  </Link>
                  <div className="mt-1 px-3 py-2">
                    <SignOutButton label="Logout" />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function MenuLink(props: { href: string; title: string; description: string }) {
  return (
    <Link
      href={props.href}
      className="block px-4 py-3 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      role="menuitem"
    >
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <p className="mt-0.5 text-xs leading-5 text-neutral-600">{props.description}</p>
    </Link>
  );
}
