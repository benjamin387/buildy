"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Tab = { key: string; label: string; href: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProjectTabs(props: { projectId: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const tabs: Tab[] = useMemo(() => {
    const id = props.projectId;
    return [
      { key: "overview", label: "Overview", href: `/projects/${id}` },
      { key: "timeline", label: "Timeline", href: `/projects/${id}/timeline` },
      { key: "site-visits", label: "Site Visits", href: `/projects/${id}/site-visits` },
      { key: "design-brief", label: "Design Brief", href: `/projects/${id}/design-brief` },
      { key: "quotations", label: "Quotations", href: `/projects/${id}/quotations` },
      { key: "contract", label: "Contract", href: `/projects/${id}/contract` },
      { key: "kickoff", label: "Kickoff", href: `/projects/${id}/kickoff` },
      { key: "execution", label: "Execution", href: `/projects/${id}/execution` },
      { key: "billing", label: "Billing", href: `/projects/${id}/billing` },
      { key: "invoices", label: "Invoices", href: `/projects/${id}/invoices` },
      { key: "receipts", label: "Receipts", href: `/projects/${id}/receipts` },
      { key: "claims", label: "Claims", href: `/projects/${id}/claims` },
      { key: "retention", label: "Retention", href: `/projects/${id}/retention` },
      { key: "dlp", label: "DLP", href: `/projects/${id}/dlp` },
      { key: "final-account", label: "Final Account", href: `/projects/${id}/final-account` },
      { key: "collections", label: "Collections", href: `/projects/${id}/collections` },
      { key: "suppliers", label: "Suppliers", href: `/projects/${id}/suppliers` },
      { key: "purchase-orders", label: "Purchase Orders", href: `/projects/${id}/purchase-orders` },
      { key: "subcontracts", label: "Subcontracts", href: `/projects/${id}/subcontracts` },
      { key: "supplier-bills", label: "Supplier Bills", href: `/projects/${id}/supplier-bills` },
      { key: "variations", label: "Variations", href: `/projects/${id}/variations` },
      { key: "documents", label: "Documents", href: `/projects/${id}/documents` },
      { key: "pnl", label: "P&L", href: `/projects/${id}/pnl` },
      { key: "profitability", label: "Profitability", href: `/projects/${id}/profitability` },
      { key: "cost-ledger", label: "Cost Ledger", href: `/projects/${id}/cost-ledger` },
      { key: "variation-orders", label: "Variation Orders", href: `/projects/${id}/variation-orders` },
      { key: "cashflow", label: "Cashflow", href: `/projects/${id}/cashflow` },
      { key: "comms", label: "Comms", href: `/projects/${id}/comms` },
    ];
  }, [props.projectId]);

  const active = tabs.find((t) => isActive(pathname, t.href)) ?? tabs[0]!;

  return (
    <div className="no-print">
      <label className="block md:hidden">
        <span className="sr-only">Project navigation</span>
        <select
          value={active.href}
          onChange={(e) => router.push(e.target.value)}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm outline-none ring-neutral-400 transition focus:ring-2"
        >
          {tabs.map((t) => (
            <option key={t.key} value={t.href}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="hidden md:block">
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cx(
                  "shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
                  active
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-slate-200 bg-white text-neutral-900 hover:bg-stone-50",
                )}
                aria-current={active ? "page" : undefined}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
