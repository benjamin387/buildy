"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { SessionUser } from "@/lib/auth/session";
import type { PermissionMatrix } from "@/lib/auth/permissions-shared";
import { can as canDo } from "@/lib/auth/permissions-shared";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import type { CurrentUserAccess } from "@/lib/auth/module-access-shared";
import type { ModuleAccessKey } from "@/lib/auth/module-access-keys";
import { SignOutButton } from "@/app/(platform)/sign-out-button";
import {
  Activity,
  Bot,
  BriefcaseBusiness,
  Building2,
  FileText,
  Gauge,
  HandCoins,
  LayoutDashboard,
  LayoutTemplate,
  LineChart,
  ListChecks,
  NotebookText,
  Palette,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  Users,
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

const GROUP_STORAGE_KEY = "buildy.ui.sidebarGroups.v4";
const GROUP_STORAGE_KEY_LEGACY = "buildy.ui.sidebarGroups.v2";

function readGroupState(): Record<string, boolean> {
  try {
    const raw =
      globalThis.localStorage?.getItem(GROUP_STORAGE_KEY) ??
      globalThis.localStorage?.getItem(GROUP_STORAGE_KEY_LEGACY);
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
  moduleAccess?: CurrentUserAccess | null;
}) {
  const pathname = usePathname();
  const groups: NavGroup[] = useMemo(() => {
    return [
      {
        key: "dashboard",
        label: "Dashboard",
        defaultOpen: true,
        items: [
          { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        ],
      },
      {
        key: "ai-design",
        label: "AI Design",
        defaultOpen: false,
        items: [
          { key: "design-briefs", label: "Design Briefs", href: "/design-ai/briefs", icon: LayoutTemplate },
          { key: "design-concepts", label: "Concepts", href: "/design-ai/concepts", icon: Palette },
          { key: "ai-boq", label: "AI BOQ", href: "/design-ai/boq", icon: ListChecks },
          { key: "design-proposals", label: "Proposals", href: "/design-ai/proposals", icon: FileText },
          { key: "sales-follow-up", label: "Sales Follow-Up", href: "/design-ai/sales", icon: Bot },
        ],
      },
      {
        key: "projects",
        label: "Projects",
        defaultOpen: false,
        items: [
          { key: "all-projects", label: "All Projects", href: "/projects", icon: BriefcaseBusiness },
          { key: "project-cost-control", label: "Project Cost Control", href: "/projects/cost-control", icon: Activity },
          { key: "project-variation-orders", label: "Variation Orders", href: "/projects/variation-orders", icon: Workflow },
          { key: "project-pnl", label: "Project P&L", href: "/projects/pnl", icon: LineChart },
        ],
      },
      {
        key: "commercial",
        label: "Commercial",
        defaultOpen: false,
        items: [
          { key: "commercial-quotations", label: "Quotations", href: "/quotation", icon: NotebookText },
          { key: "commercial-contracts", label: "Contracts", href: "/contracts", icon: ScrollText },
          { key: "commercial-invoices", label: "Invoices", href: "/invoices", icon: Receipt },
          { key: "commercial-receipts", label: "Receipts", href: "/receipts", icon: HandCoins },
        ],
      },
      {
        key: "procurement",
        label: "Procurement",
        defaultOpen: false,
        items: [
          { key: "procurement-suppliers", label: "Suppliers", href: "/suppliers", icon: Building2 },
          { key: "procurement-subcontractors", label: "Subcontractors", href: "/subcontracts", icon: Package },
          { key: "procurement-purchase-orders", label: "Purchase Orders", href: "/purchase-orders", icon: Workflow },
        ],
      },
      {
        key: "finance",
        label: "Finance",
        defaultOpen: false,
        items: [
          { key: "finance-revenue", label: "Revenue Analytics", href: "/analytics/revenue", icon: LineChart },
          { key: "finance-cost-ledger", label: "Cost Ledger", href: "/finance/cost-ledger", icon: ListChecks },
          { key: "finance-profitability", label: "Profitability", href: "/finance/profitability", icon: Gauge },
          { key: "finance-gst-xero", label: "GST / Xero", href: "/settings/accounting", icon: Settings },
        ],
      },
      {
        key: "settings",
        label: "Settings",
        defaultOpen: false,
        items: [
          { key: "settings-users", label: "Users", href: "/settings/users", icon: Users },
          { key: "settings-roles-access", label: "Roles & Access", href: "/settings/roles-access", icon: Shield },
          { key: "settings-company-profile", label: "Company Profile", href: "/settings/company", icon: Building2 },
          { key: "settings-ai", label: "AI Settings", href: "/ai-control-center", icon: Bot },
          { key: "settings-whatsapp", label: "WhatsApp Settings", href: "/settings/lead-channels", icon: Settings },
          { key: "settings-xero", label: "Xero Settings", href: "/settings/accounting", icon: Settings },
        ],
      },
    ];
  }, []);

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
      if (i.execOnly && !props.user.isAdmin && !props.user.roleKeys.includes("DIRECTOR")) return false;
      // PermissionRule-based view gating (best-effort). If permissions not provided, keep current behavior.
      if (props.moduleAccess?.matrix) {
        const accessKey = navKeyToAccessModule(i.key);
        if (accessKey && !props.moduleAccess.matrix[accessKey].canView) return false;
      } else if (props.permissions) {
        const moduleKey = navKeyToPermissionModule(i.key);
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
                  "inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
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

function navKeyToPermissionModule(navKey: string): PermissionModuleKey | null {
  switch (navKey) {
    case "dashboard":
      return "DASHBOARD";
    case "all-projects":
      return "PROJECTS";
    case "design-briefs":
    case "design-concepts":
    case "ai-boq":
    case "design-proposals":
      return "DESIGN";
    case "sales-follow-up":
      return "AI_ACTIONS";
    case "project-cost-control":
    case "project-pnl":
      return "PNL";
    case "project-variation-orders":
      return "VARIATIONS";
    case "commercial-quotations":
      return "QUOTATIONS";
    case "commercial-contracts":
      return "CONTRACTS";
    case "commercial-invoices":
      return "INVOICES";
    case "commercial-receipts":
      return "INVOICES";
    case "procurement-suppliers":
      return "SUPPLIERS";
    case "procurement-purchase-orders":
      return "PURCHASE_ORDERS";
    case "procurement-subcontractors":
      return "SUBCONTRACTS";
    case "finance-revenue":
    case "finance-profitability":
    case "finance-cost-ledger":
      return "PNL";
    case "finance-gst-xero":
      return "SETTINGS";
    case "settings-users":
    case "settings-roles-access":
    case "settings-company-profile":
    case "settings-ai":
    case "settings-whatsapp":
    case "settings-xero":
      return "SETTINGS";
    default:
      return null;
  }
}

function navKeyToAccessModule(navKey: string): ModuleAccessKey | null {
  switch (navKey) {
    case "dashboard":
      return "dashboard";
    case "design-briefs":
      return "design_briefs";
    case "design-concepts":
      return "design_concepts";
    case "ai-boq":
      return "design_boq";
    case "design-proposals":
      return "design_proposals";
    case "sales-follow-up":
      return "sales_followup";
    case "all-projects":
      return "projects";
    case "project-cost-control":
      return "project_cost_control";
    case "project-variation-orders":
      return "variation_orders";
    case "project-pnl":
      return "project_profitability";
    case "commercial-quotations":
      return "quotations";
    case "commercial-contracts":
      return "contracts";
    case "commercial-invoices":
      return "invoices";
    case "commercial-receipts":
      return "receipts";
    case "procurement-suppliers":
      return "suppliers";
    case "procurement-subcontractors":
      return "subcontractors";
    case "procurement-purchase-orders":
      return "purchase_orders";
    case "finance-revenue":
      return "finance";
    case "finance-cost-ledger":
      return "cost_ledger";
    case "finance-profitability":
      return "project_profitability";
    case "finance-gst-xero":
      return "xero";
    case "settings-users":
      return "users";
    case "settings-roles-access":
      return "roles_access";
    case "settings-company-profile":
    case "settings-ai":
    case "settings-whatsapp":
    case "settings-xero":
      return "settings";
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
      {/*
        Trailing → glyph removed. The active state already inverts colors and
        the icon on the left is signal enough that this is a nav row. Adding
        an arrow per item turned every line into visual repetition.
      */}
    </Link>
  );
}
