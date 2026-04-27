"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { SignOutButton } from "@/app/(platform)/sign-out-button";
import {
  Activity,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Command,
  FileText,
  Gauge,
  HandCoins,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  LineChart,
  ListChecks,
  Lock,
  NotebookText,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  X,
} from "lucide-react";

type IconType = ComponentType<{ className?: string }>;

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: IconType;
  description?: string;
  execOnly?: boolean;
  adminOnly?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const GROUP_STORAGE_KEY = "buildy.ui.sidebarGroups";

function readGroupState(): Record<string, boolean> {
  try {
    const raw = globalThis.localStorage?.getItem(GROUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeGroupState(value: Record<string, boolean>) {
  try {
    globalThis.localStorage?.setItem(GROUP_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PlatformSidebar(props: {
  user: SessionUser;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const isExec = props.user.isAdmin || props.user.roleKeys.includes("DIRECTOR");

  const groups: NavGroup[] = useMemo(() => {
    const projectContextHint = "Open a project";

    return [
      {
        key: "core",
        label: "Core",
        defaultOpen: true,
        items: [
          { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { key: "leads", label: "Leads", href: "/leads", icon: LifeBuoy },
          { key: "projects", label: "Projects", href: "/projects", icon: BriefcaseBusiness },
        ],
      },
      {
        key: "design",
        label: "Design",
        defaultOpen: true,
        items: [
          { key: "design-studio", label: "Design Studio", href: "/design-packages", icon: LayoutTemplate },
          { key: "quotations", label: "Quotations", href: "/projects", icon: NotebookText, description: projectContextHint },
          { key: "contracts", label: "Contracts", href: "/contracts", icon: ScrollText },
        ],
      },
      {
        key: "finance",
        label: "Finance",
        defaultOpen: true,
        items: [
          { key: "billing", label: "Billing", href: "/billing", icon: HandCoins },
          { key: "pnl", label: "P&L", href: "/pnl", icon: LineChart },
          { key: "cashflow", label: "Cashflow", href: "/cashflow", icon: Wallet },
          { key: "invoices", label: "Invoices", href: "/invoices", icon: Receipt },
          { key: "collections", label: "Collections", href: "/collections", icon: ListChecks },
        ],
      },
      {
        key: "operations",
        label: "Operations",
        defaultOpen: false,
        items: [
          { key: "suppliers", label: "Suppliers", href: "/suppliers", icon: Building2 },
          { key: "purchase-orders", label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
          { key: "subcontracts", label: "Subcontracts", href: "/subcontracts", icon: Workflow },
          { key: "supplier-bills", label: "Supplier Bills", href: "/supplier-bills", icon: Package },
          { key: "variation-orders", label: "Variation Orders", href: "/projects", icon: Activity, description: projectContextHint },
          { key: "documents", label: "Documents", href: "/documents", icon: FileText },
        ],
      },
      {
        key: "ai",
        label: "AI",
        defaultOpen: false,
        items: [
          { key: "command-center", label: "Command Center", href: "/command-center", icon: Gauge, execOnly: true },
          { key: "ai-actions", label: "AI Actions", href: "/ai-actions", icon: Bot, execOnly: true },
          { key: "ai-learning", label: "AI Learning", href: "/ai-learning", icon: Sparkles, execOnly: true },
          { key: "ai-control", label: "AI Control Center", href: "/ai-control-center", icon: Command, execOnly: true },
        ],
      },
      {
        key: "system",
        label: "System",
        defaultOpen: false,
        items: [
          { key: "clients", label: "Clients", href: "/clients", icon: Users },
          { key: "settings", label: "Settings", href: "/settings", icon: Settings },
          { key: "security", label: "Security", href: "/settings/security", icon: Shield },
          { key: "user-access", label: "User Access", href: "/settings/users", icon: Lock, adminOnly: true },
        ],
      },
    ];
  }, [props.user.isAdmin, props.user.roleKeys]);

  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = readGroupState();
    const initial: Record<string, boolean> = {};
    for (const g of groups) {
      initial[g.key] = typeof saved[g.key] === "boolean" ? saved[g.key] : Boolean(g.defaultOpen);
    }
    setGroupOpen(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleGroup(key: string) {
    setGroupOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeGroupState(next);
      return next;
    });
  }

  const visibleGroups = groups.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.adminOnly && !props.user.isAdmin) return false;
      if (i.execOnly && !isExec) return false;
      return true;
    }),
  }));

  return (
    <>
      {props.mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden" onClick={props.onCloseMobile} />
      ) : null}

      <aside
        className={cx(
          "no-print z-50 lg:z-auto",
          "fixed left-0 top-0 h-full lg:sticky lg:top-[60px]",
          "border-r border-neutral-200 bg-white",
          "shadow-lg shadow-black/5 lg:shadow-none",
          "transition-transform duration-200",
          props.mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          props.collapsed ? "w-[76px]" : "w-[280px]",
        )}
        aria-label="Sidebar navigation"
      >
        <div className={cx("flex h-full flex-col", props.collapsed ? "px-2" : "px-3")}>
          <div className={cx("flex items-center justify-between gap-2 py-3", props.collapsed ? "px-1" : "px-2")}>
            <div className={cx("flex items-center gap-2", props.collapsed && "justify-center")}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-xs font-bold text-white">
                B
              </span>
              {!props.collapsed ? (
                <div>
                  <p className="text-sm font-semibold text-neutral-950">Platform</p>
                  <p className="text-xs text-neutral-500">Enterprise workspace</p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={props.onCloseMobile}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-700 transition hover:bg-neutral-50 lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto pb-4">
            {visibleGroups.map((group) =>
              group.items.length === 0 ? null : (
                <div key={group.key} className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className={cx(
                      "flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-neutral-50",
                      props.collapsed && "justify-center",
                    )}
                  >
                    <span className={cx("flex items-center gap-2", props.collapsed && "justify-center")}>
                      <BookOpen className="h-4 w-4 text-neutral-400" />
                      {!props.collapsed ? (
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                          {group.label}
                        </span>
                      ) : null}
                    </span>
                    {!props.collapsed ? (
                      <span className="text-xs font-semibold text-neutral-400">
                        {groupOpen[group.key] ? "–" : "+"}
                      </span>
                    ) : null}
                  </button>

                  {groupOpen[group.key] ? (
                    <div className="mt-1 space-y-1">
                      {group.items.map((item) => {
                        const active = isActivePath(pathname, item.href);
                        return (
                          <SidebarItem
                            key={item.key}
                            item={item}
                            collapsed={props.collapsed}
                            active={active}
                            onNavigate={props.onCloseMobile}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </nav>

          <div className={cx("border-t border-neutral-200 py-3", props.collapsed ? "px-1" : "px-2")}>
            {!props.collapsed ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">{props.user.name ?? props.user.email}</p>
                  <p className="truncate text-xs text-neutral-500">{props.user.primaryRoleLabel}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-700">
                  {(props.user.name ?? props.user.email ?? "U").slice(0, 1).toUpperCase()}
                </span>
              </div>
            ) : null}

            <div className={cx("mt-3", props.collapsed ? "flex justify-center" : "")}>
              <SignOutButton
                className={cx(
                  "inline-flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50",
                  props.collapsed ? "w-10 px-0" : "w-full",
                )}
                variant={props.collapsed ? "icon" : "full"}
                label="Logout"
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarItem(props: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = props.item.icon;
  return (
    <Link
      href={props.item.href}
      title={props.collapsed ? props.item.label : undefined}
      onClick={props.onNavigate}
      className={cx(
        "group flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition",
        props.active
          ? "bg-neutral-900 text-white shadow-sm"
          : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900",
      )}
    >
      <span
        className={cx(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
          props.active
            ? "border-white/10 bg-white/10 text-white"
            : "border-neutral-200 bg-white text-neutral-600 group-hover:border-neutral-300",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      {!props.collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{props.item.label}</span>
          {props.item.description ? (
            <span className={cx("mt-0.5 block truncate text-xs", props.active ? "text-white/70" : "text-neutral-500")}>
              {props.item.description}
            </span>
          ) : null}
        </span>
      ) : null}
      {!props.collapsed ? (
        <span className={cx("text-xs font-semibold", props.active ? "text-white/60" : "text-neutral-300 group-hover:text-neutral-400")}>
          →
        </span>
      ) : null}
    </Link>
  );
}
