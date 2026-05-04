"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { SessionUser } from "@/lib/auth/session";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import { can as canDo } from "@/lib/auth/permissions-shared";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SignOutButton } from "@/app/(platform)/sign-out-button";
import {
  Activity,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  Command,
  FileText,
  Gauge,
  HandCoins,
  Gavel,
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
  ShieldCheck,
  Users,
  Library,
  History,
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

const GROUP_STORAGE_KEY = "buildy.ui.sidebarGroups.v2";

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
  permissions?: PermissionMatrix | null;
}) {
  const pathname = usePathname();
  const isExec = props.user.isAdmin || props.user.roleKeys.includes("DIRECTOR");
  const canViewBizsafe = props.user.roleKeys.some((roleKey) =>
    ["ADMIN", "DIRECTOR", "PROJECT_MANAGER", "QS", "FINANCE"].includes(roleKey),
  );

  const groups: NavGroup[] = useMemo(() => {
    const projectContextHint = "Open a project";

    return [
      {
        key: "core",
        label: "Core",
        defaultOpen: true,
        items: [
          { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
          { key: "notifications", label: "Notifications", href: "/notifications", icon: Bell },
          { key: "leads", label: "Leads", href: "/leads", icon: LifeBuoy },
          { key: "projects", label: "Projects", href: "/projects", icon: BriefcaseBusiness },
        ],
      },
      {
        key: "bidding",
        label: "Bidding",
        defaultOpen: false,
        items: [
          { key: "bidding-home", label: "Bidding Home", href: "/bidding", icon: Gavel },
          { key: "bidding-opportunities", label: "GeBIZ Opportunities", href: "/bidding/opportunities", icon: Gavel },
          { key: "bidding-pipeline", label: "Bid Pipeline", href: "/bidding/pipeline", icon: Workflow },
          { key: "bidding-analytics", label: "Director Analytics", href: "/bidding/analytics", icon: LineChart, execOnly: true },
          { key: "bidding-awarded", label: "Awarded Contracts", href: "/bidding/awarded", icon: ScrollText },
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
          { key: "finance", label: "Finance", href: "/pnl", icon: LineChart, description: "P&L, cashflow, margin control" },
          { key: "invoices", label: "Invoices", href: "/invoices", icon: Receipt },
          { key: "collections", label: "Collections", href: "/collections", icon: ListChecks },
          { key: "cashflow", label: "Cashflow", href: "/cashflow", icon: Wallet },
        ],
      },
      {
        key: "operations",
        label: "Operations",
        defaultOpen: false,
        items: [
          { key: "suppliers", label: "Suppliers", href: "/suppliers", icon: Building2 },
          { key: "purchase-orders", label: "Purchase Orders", href: "/purchase-orders", icon: Workflow },
          { key: "subcontracts", label: "Subcontracts", href: "/subcontracts", icon: Package },
          { key: "supplier-bills", label: "Supplier Bills", href: "/supplier-bills", icon: Receipt },
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
          { key: "ai-learning", label: "AI Learning", href: "/ai-learning", icon: Command, execOnly: true },
          { key: "ai-control", label: "AI Control Center", href: "/ai-control-center", icon: Shield, execOnly: true },
        ],
      },
      {
        key: "compliance",
        label: "Compliance",
        defaultOpen: false,
        items: canViewBizsafe
          ? [{ key: "bizsafe", label: "BizSAFE", href: "/compliance/bizsafe", icon: ShieldCheck }]
          : [],
      },
      {
        key: "system",
        label: "System",
        defaultOpen: false,
        items: [
          { key: "clients", label: "Clients", href: "/clients", icon: Users },
          { key: "templates", label: "Template Library", href: "/templates", icon: Library, execOnly: true },
          { key: "audit", label: "Audit Logs", href: "/audit", icon: History, execOnly: true },
          { key: "settings", label: "Settings", href: "/settings", icon: Settings },
          { key: "gebiz-settings", label: "GeBIZ Auto-Feed", href: "/settings/gebiz", icon: Gavel, execOnly: true },
          { key: "role-permissions", label: "Role Permissions", href: "/settings/permissions", icon: Shield, execOnly: true },
          { key: "security", label: "Security", href: "/settings/security", icon: Lock },
          { key: "user-access", label: "User Access", href: "/settings/users", icon: Shield, adminOnly: true },
        ],
      },
    ];
  }, [canViewBizsafe]);

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
      // PermissionRule-based view gating (best-effort). If permissions not provided, keep current behavior.
      if (props.permissions) {
        const moduleKey = navKeyToModule(i.key);
        if (moduleKey && !canDo(props.permissions, moduleKey, "view")) return false;
      }
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
          "border-r border-slate-200 bg-white",
          "shadow-2xl shadow-black/10 lg:shadow-none",
          "transition-transform duration-200",
          props.mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          props.collapsed ? "w-[78px]" : "w-[288px]",
        )}
        aria-label="Sidebar navigation"
      >
        <div className={cx("flex h-full flex-col", props.collapsed ? "px-2" : "px-3")}>
          <div className={cx("flex items-center justify-between gap-2 py-3", props.collapsed ? "px-1" : "px-2")}>
            <div className={cx("flex items-center gap-2", props.collapsed && "justify-center")}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950 text-xs font-bold text-white">
                B
              </span>
              {!props.collapsed ? (
                <div>
                  <p className="text-sm font-semibold text-neutral-950">Buildy</p>
                  <p className="text-xs text-neutral-500">Studio OS</p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={props.onCloseMobile}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-neutral-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:hidden"
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
                      "flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
                      props.collapsed && "justify-center",
                    )}
                    aria-label={props.collapsed ? group.label : undefined}
                  >
                    {!props.collapsed ? (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                        {group.label}
                      </span>
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
                    )}
                    {!props.collapsed ? (
                      <span className="text-xs font-semibold text-neutral-300">
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

          <div className={cx("border-t border-slate-200 py-3", props.collapsed ? "px-1" : "px-2")}>
            {!props.collapsed ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">{props.user.name ?? props.user.email}</p>
                  <p className="truncate text-xs text-neutral-500">{props.user.primaryRoleLabel}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-stone-50 text-xs font-bold text-neutral-800">
                  {(props.user.name ?? props.user.email ?? "U").slice(0, 1).toUpperCase()}
                </span>
              </div>
            ) : null}

            <div className={cx("mt-3", props.collapsed ? "flex justify-center" : "")}>
              <SignOutButton
                className={cx(
                  "inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
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

function navKeyToModule(navKey: string): PermissionModuleKey | null {
  switch (navKey) {
    case "dashboard":
      return "DASHBOARD";
    case "notifications":
      return "NOTIFICATIONS";
    case "leads":
      return "LEADS";
    case "projects":
      return "PROJECTS";
    case "bidding-home":
    case "bidding-opportunities":
    case "bidding-pipeline":
    case "bidding-awarded":
      return "BIDDING";
    case "design-studio":
      return "DESIGN";
    case "quotations":
      return "QUOTATIONS";
    case "contracts":
      return "CONTRACTS";
    case "billing":
      return "INVOICES";
    case "finance":
      return "PNL";
    case "invoices":
      return "INVOICES";
    case "collections":
      return "COLLECTIONS";
    case "cashflow":
      return "CASHFLOW";
    case "suppliers":
      return "SUPPLIERS";
    case "purchase-orders":
      return "PURCHASE_ORDERS";
    case "subcontracts":
      return "SUBCONTRACTS";
    case "supplier-bills":
      return "SUPPLIER_BILLS";
    case "variation-orders":
      return "VARIATIONS";
    case "documents":
      return "DOCUMENTS";
    case "bizsafe":
      return null;
    case "command-center":
      return "AI_ACTIONS";
    case "ai-actions":
      return "AI_ACTIONS";
    case "ai-learning":
      return "AI_LEARNING";
    case "ai-control":
      return "AI_CONTROL";
    case "clients":
      return "CLIENT_PORTAL";
    case "templates":
      return "SETTINGS";
    case "audit":
      return "AUDIT";
    case "settings":
      return "SETTINGS";
    case "gebiz-settings":
      return "SETTINGS";
    case "security":
      return "SETTINGS";
    case "user-access":
      return "SETTINGS";
    case "role-permissions":
      return "SETTINGS";
    default:
      return null;
  }
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
        "group flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.active
          ? "bg-neutral-950 text-white shadow-sm"
          : "text-neutral-700 hover:bg-stone-50 hover:text-neutral-900",
      )}
      aria-current={props.active ? "page" : undefined}
    >
      <span
        className={cx(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
          props.active
            ? "border-white/10 bg-white/10 text-white"
            : "border-slate-200 bg-white text-neutral-600 group-hover:border-slate-300",
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
