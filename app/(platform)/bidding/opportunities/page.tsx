import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { createBidOpportunityAction } from "@/app/(platform)/bidding/actions";
import { safeQuery } from "@/lib/server/safe-query";
import { computeClosingRisk } from "@/lib/bidding/intelligence";

const STATUSES = ["ALL", "WATCHING", "BID_NO_BID", "PREPARING", "PENDING_APPROVAL", "SUBMITTED", "AWARDED", "LOST", "CANCELLED"] as const;
type StatusFilter = (typeof STATUSES)[number];

const SOURCES = ["ALL", "GEBIZ", "MANUAL"] as const;
type SourceFilter = (typeof SOURCES)[number];

function toSingle(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

export const dynamic = "force-dynamic";

export default async function BidOpportunitiesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const sp = await props.searchParams;
  const q = (toSingle(sp.q) ?? "").trim();
  const status = ((toSingle(sp.status) ?? "ALL") as StatusFilter) || "ALL";
  const source = ((toSingle(sp.source) ?? "ALL") as SourceFilter) || "ALL";

  const rows = await safeQuery(
    () =>
      prisma.bidOpportunity.findMany({
        where: {
          ...(status !== "ALL" ? { status } : {}),
          ...(source !== "ALL"
            ? source === "GEBIZ"
              ? { gebizImportedItems: { some: {} } }
              : { gebizImportedItems: { none: {} } }
            : {}),
          ...(q
            ? {
                OR: [
                  { opportunityNo: { contains: q, mode: "insensitive" } },
                  { title: { contains: q, mode: "insensitive" } },
                  { agency: { contains: q, mode: "insensitive" } },
                  { category: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ closingDate: "asc" }, { updatedAt: "desc" }],
        take: 500,
        include: {
          gebizImportedItems: {
            orderBy: [{ createdAt: "desc" }],
            take: 1,
            select: {
              createdAt: true,
              detailUrl: true,
              sourceGuid: true,
              category: true,
              closingDate: true,
              publishedAt: true,
              feedSource: { select: { name: true } },
            },
          },
        },
      }),
    [] as any[],
  );

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Bidding / GeBIZ"
        title="GeBIZ Opportunities"
        subtitle="Manual entry or paste-import GeBIZ text into a structured bid opportunity."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bidding/pipeline">
              <ActionButton variant="secondary">Pipeline</ActionButton>
            </Link>
            <Link href="/bidding">
              <ActionButton variant="secondary">Bidding Home</ActionButton>
            </Link>
          </div>
        }
      />

      <SectionCard title="Add Opportunity" description="Paste copied GeBIZ details or fill fields manually. The system will parse and prefill where possible.">
        <form action={createBidOpportunityAction} className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-neutral-900">Paste GeBIZ Text (optional)</label>
            <textarea
              name="importText"
              className="h-44 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
              placeholder="Paste GeBIZ opportunity details here (copied text)..."
            />
            <p className="text-xs text-neutral-600">
              Tip: Paste first, then fill missing fields below if needed.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opportunity No" name="opportunityNo" placeholder="e.g. GEBIZ2026-XXXX" required />
            <Field label="Agency" name="agency" placeholder="e.g. Ministry / Stat Board" required />
            <div className="sm:col-span-2">
              <Field label="Title" name="title" placeholder="Procurement title" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-900">Procurement Type</label>
              <select
                name="procurementType"
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                defaultValue="QUOTATION"
              >
                <option value="QUOTATION">Quotation</option>
                <option value="TENDER">Tender</option>
                <option value="RFI">RFI</option>
                <option value="FRAMEWORK">Framework</option>
              </select>
            </div>
            <Field label="Category" name="category" placeholder="e.g. Renovation / M&E / Carpentry" />
            <Field label="Closing Date" name="closingDate" placeholder="YYYY-MM-DD or GeBIZ text" />
            <Field label="Briefing Date" name="briefingDate" placeholder="YYYY-MM-DD or GeBIZ text" />
            <Field label="Estimated Value (SGD)" name="estimatedValue" placeholder="e.g. 80000" inputMode="decimal" />
            <Field label="Target Margin (%)" name="targetMargin" placeholder="e.g. 18" inputMode="decimal" />
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Remarks</label>
              <textarea
                name="remarks"
                className="mt-1 h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Notes for bid/no-bid decision, constraints, etc."
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <ActionButton type="submit">Create Opportunity</ActionButton>
            </div>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Register"
        description="Search and filter opportunities. Open a bid to enter costing, upload documents, and run approvals."
        actions={
          <form className="flex flex-wrap items-center gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search opportunity no, title, agency…"
              className="h-11 w-64 rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />
            <select
              name="source"
              defaultValue={source}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All sources" : s === "MANUAL" ? "Manual" : "GeBIZ"}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <ActionButton type="submit" variant="secondary">
              Apply
            </ActionButton>
          </form>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No opportunities found" description="Try adjusting filters, or create a new GeBIZ opportunity above." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 lg:hidden">
              {rows.slice(0, 60).map((o: any) => {
                const imported = o.gebizImportedItems?.[0] ?? null;
                const detailUrl = imported?.detailUrl ?? null;
                const importedAt = imported?.createdAt ?? null;
                const sourceLabel = imported ? "GeBIZ" : "Manual";
                const categoryLabel = o.category ?? imported?.category ?? "-";
                const risk = computeClosingRisk(o.closingDate ?? null, new Date());
                const riskTone =
                  risk.severity === "CRITICAL" || risk.severity === "HIGH"
                    ? "danger"
                    : risk.severity === "MEDIUM"
                      ? "warning"
                      : risk.severity === "LOW"
                        ? "info"
                        : "neutral";

                const riskLabel =
                  risk.severity === "CRITICAL"
                    ? "URGENT"
                    : risk.severity === "HIGH"
                      ? "HIGH"
                      : risk.severity === "MEDIUM"
                        ? "MEDIUM"
                        : risk.severity === "LOW"
                          ? "LOW"
                          : "OK";

                return (
                  <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/bidding/${o.id}`} className="text-sm font-semibold text-neutral-950 hover:underline">
                          {o.opportunityNo}
                        </Link>
                        <p className="mt-1 line-clamp-2 text-xs text-neutral-600">{o.title}</p>
                        <p className="mt-2 text-xs text-neutral-500">{o.agency}</p>
                        <p className="mt-1 text-xs text-neutral-500">{categoryLabel}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusPill tone={riskTone}>{riskLabel}</StatusPill>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusPill tone={imported ? "info" : "neutral"}>{sourceLabel}</StatusPill>
                        <StatusPill tone={o.status === "AWARDED" ? "success" : o.status === "LOST" ? "danger" : o.status === "SUBMITTED" ? "info" : o.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>
                          {String(o.status).replaceAll("_", " ")}
                        </StatusPill>
                        <span className="text-xs text-neutral-500">{formatDate(o.closingDate)}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-neutral-900">{formatCurrency(Number(o.bidPrice ?? 0))}</div>
                        <div className="text-[11px] text-neutral-500">{o.finalMargin != null ? `${(Number(o.finalMargin) * 100).toFixed(1)}%` : "-"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                      <div>{importedAt ? `Imported ${formatDate(importedAt)}` : "—"}</div>
                      <div className="flex items-center gap-2">
                        {detailUrl ? (
                          <a
                            href={detailUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-neutral-900 underline decoration-slate-300 underline-offset-2 hover:decoration-neutral-900"
                          >
                            Open GeBIZ
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {rows.length > 60 ? <p className="text-xs text-neutral-500">Showing first 60 results on mobile.</p> : null}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1460px] w-full text-sm">
              <thead className="bg-stone-50 text-neutral-800">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Opportunity</th>
                  <th className="px-4 py-3 text-left font-semibold">Source</th>
                  <th className="px-4 py-3 text-left font-semibold">Agency</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Category</th>
                  <th className="px-4 py-3 text-left font-semibold">Imported</th>
                  <th className="px-4 py-3 text-left font-semibold">Closing</th>
                  <th className="px-4 py-3 text-left font-semibold">Risk</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Est. Value</th>
                  <th className="px-4 py-3 text-right font-semibold">Bid Price</th>
                  <th className="px-4 py-3 text-right font-semibold">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((o: any) => (
                  (() => {
                    const imported = o.gebizImportedItems?.[0] ?? null;
                    const detailUrl = imported?.detailUrl ?? null;
                    const importedAt = imported?.createdAt ?? null;
                    const categoryLabel = o.category ?? imported?.category ?? "-";
                    const risk = computeClosingRisk(o.closingDate ?? null, new Date());

                    const riskTone =
                      risk.severity === "CRITICAL" || risk.severity === "HIGH"
                        ? "danger"
                        : risk.severity === "MEDIUM"
                          ? "warning"
                          : risk.severity === "LOW"
                            ? "info"
                            : "neutral";

                    const riskLabel =
                      risk.severity === "CRITICAL"
                        ? "URGENT"
                        : risk.severity === "HIGH"
                          ? "HIGH"
                          : risk.severity === "MEDIUM"
                            ? "MEDIUM"
                            : risk.severity === "LOW"
                              ? "LOW"
                              : "OK";

                    return (
                  <tr key={o.id} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/bidding/${o.id}`} className="font-semibold text-neutral-950 hover:underline">
                        {o.opportunityNo}
                      </Link>
                      <div className="mt-0.5 line-clamp-1 text-xs text-neutral-600">{o.title}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={imported ? "info" : "neutral"}>{imported ? "GeBIZ" : "Manual"}</StatusPill>
                      {detailUrl ? (
                        <div className="mt-1">
                          <a
                            href={detailUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-neutral-900 underline decoration-slate-300 underline-offset-2 hover:decoration-neutral-900"
                          >
                            GeBIZ link
                          </a>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{o.agency}</td>
                    <td className="px-4 py-3 text-neutral-700">{String(o.procurementType).replaceAll("_", " ")}</td>
                    <td className="px-4 py-3 text-neutral-700">{categoryLabel}</td>
                    <td className="px-4 py-3 text-neutral-700">{importedAt ? formatDate(importedAt) : "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(o.closingDate)}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={riskTone}>{riskLabel}</StatusPill>
                      {risk.daysLeft != null ? (
                        <div className="mt-1 text-xs text-neutral-500">{risk.daysLeft} day(s)</div>
                      ) : (
                        <div className="mt-1 text-xs text-neutral-500">TBC</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={o.status === "AWARDED" ? "success" : o.status === "LOST" ? "danger" : o.status === "SUBMITTED" ? "info" : o.status === "PENDING_APPROVAL" ? "warning" : "neutral"}>
                        {String(o.status).replaceAll("_", " ")}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-700">{o.estimatedValue ? formatCurrency(Number(o.estimatedValue)) : "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(Number(o.bidPrice ?? 0))}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">
                      {o.finalMargin != null ? `${(Number(o.finalMargin) * 100).toFixed(1)}%` : "-"}
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </SectionCard>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">
        {props.label}
        {props.required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <input
        name={props.name}
        required={props.required}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}
