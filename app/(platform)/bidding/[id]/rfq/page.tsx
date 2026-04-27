import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { safeQuery } from "@/lib/server/safe-query";
import { listBidRfqsForOpportunity, defaultTradePackages } from "@/lib/bidding/rfq-service";
import { deleteBidSupplierQuoteAction, upsertBidSupplierQuoteAction } from "@/app/(platform)/bidding/actions";
import { BidTradePackageKey } from "@prisma/client";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function tradeLabel(key: BidTradePackageKey) {
  return defaultTradePackages().find((t) => t.tradeKey === key)?.title ?? String(key).replaceAll("_", " ");
}

export default async function BidRfqCenterPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id } = await props.params;

  const opp = await safeQuery(
    () =>
      prisma.bidOpportunity.findUnique({
        where: { id },
        include: {
          supplierQuotes: { orderBy: [{ scopeLabel: "asc" }, { quoteAmount: "asc" }, { createdAt: "desc" }] },
        },
      }),
    null as any,
  );
  if (!opp) notFound();

  const rfqs = await safeQuery(() => listBidRfqsForOpportunity(opp.id), []);

  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard
            title="Supplier RFQ Center"
            description="Create RFQ packages, issue secure supplier quote links, compare returns by trade, and auto-build costing."
          >
            {rfqs.length === 0 ? (
              <EmptyState title="No RFQs created yet" description="Create an RFQ for this opportunity to start gathering supplier pricing." />
            ) : (
              <div className="space-y-3">
                {rfqs.map((r: any) => (
                  <Link
                    key={r.id}
                    href={`/bidding/${opp.id}/rfq/${r.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-stone-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-950">{r.title}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Reply deadline: {formatDate(r.replyDeadline)} · Created: {formatDate(r.createdAt)}
                        </p>
                        <p className="mt-2 text-xs text-neutral-600">
                          Trade packages: <span className="font-semibold text-neutral-900 tabular-nums">{r._count?.tradePackages ?? 0}</span>
                          <span className="text-neutral-300"> · </span>
                          Invites: <span className="font-semibold text-neutral-900 tabular-nums">{r._count?.supplierInvites ?? 0}</span>
                          <span className="text-neutral-300"> · </span>
                          Quotes: <span className="font-semibold text-neutral-900 tabular-nums">{r._count?.quotes ?? 0}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill tone={r.status === "CLOSED" ? "success" : r.status === "CANCELLED" ? "danger" : r.status === "IN_PROGRESS" ? "info" : "neutral"}>
                          {String(r.status).replaceAll("_", " ")}
                        </StatusPill>
                        <span className="text-sm font-semibold text-neutral-900">Open</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard title="Create RFQ" description="Start an RFQ and select trade packages. Supplier invites are sent as secure links (no login).">
            <form action={`/api/bidding/${opp.id}/rfq`} method="post" className="grid gap-3">
              <Field label="RFQ Title" name="title" required placeholder="e.g. Tender RFQ Pack v1" />
              <Field label="Reply Deadline" name="replyDeadline" placeholder="YYYY-MM-DD" />
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Briefing Notes</label>
                <textarea
                  name="briefingNotes"
                  className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  placeholder="Site constraints, access timing, briefing takeaways..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Scope Summary</label>
                <textarea
                  name="scopeSummary"
                  className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  placeholder="High-level scope for suppliers..."
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-neutral-900">Trade Packages</p>
                <p className="mt-1 text-xs text-neutral-500">Select packages to create as RFQ sections.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {defaultTradePackages().map((t) => (
                    <label key={t.tradeKey} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm">
                      <input type="checkbox" name="tradeKeys" value={t.tradeKey} defaultChecked={t.tradeKey !== "OTHER"} />
                      <span className="font-semibold">{tradeLabel(t.tradeKey)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <ActionButton type="submit">Create RFQ</ActionButton>
              </div>
            </form>
          </SectionCard>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Quick Manual Quotes (Legacy)"
          description="Optional: capture supplier quotes without using RFQ links. This remains available for fast comparisons."
        >
          <ManualQuoteList opportunityId={opp.id} quotes={opp.supplierQuotes ?? []} />
        </SectionCard>

        <SectionCard title="Add Manual Quote" description="Add a quick quote entry (does not notify supplier).">
          <form action={upsertBidSupplierQuoteAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="opportunityId" value={opp.id} />
            <input type="hidden" name="id" value="" />
            <Field label="Supplier Name" name="supplierName" placeholder="e.g. ABC Carpentry Pte Ltd" required />
            <Field label="Scope / Package" name="scopeLabel" placeholder="e.g. Carpentry" />
            <Field label="Quote Amount (SGD)" name="quoteAmount" inputMode="decimal" placeholder="e.g. 25000" required />
            <Field label="Lead Time (days)" name="leadTimeDays" inputMode="numeric" placeholder="e.g. 21" />
            <Field label="Validity Date" name="validityDate" placeholder="YYYY-MM-DD" />
            <Field label="File URL" name="fileUrl" placeholder="https://..." />
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-neutral-900">Notes</label>
              <textarea
                name="notes"
                className="mt-1 h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                placeholder="Scope assumptions, exclusions, warranty, payment terms, etc."
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <ActionButton type="submit">Add Quote</ActionButton>
            </div>
          </form>
        </SectionCard>
      </section>
    </main>
  );
}

function ManualQuoteList(props: { opportunityId: string; quotes: any[] }) {
  if (!props.quotes.length) {
    return <EmptyState title="No manual quotes" description="Use RFQ Center above to issue secure supplier quote links." />;
  }

  const amounts = props.quotes.map((q) => Number(q.quoteAmount ?? 0)).filter((n) => Number.isFinite(n) && n > 0);
  const lowest = amounts.length ? Math.min(...amounts) : null;

  return (
    <div className="space-y-2">
      {props.quotes.map((q) => {
        const amount = Number(q.quoteAmount ?? 0);
        const isBest = lowest != null && amount === lowest;
        return (
          <details key={q.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-950">
                  {q.supplierName}
                  {q.scopeLabel ? <span className="ml-2 text-xs font-semibold text-neutral-500">· {q.scopeLabel}</span> : null}
                </p>
                <p className="mt-1 text-xs text-neutral-500">Validity: {formatDate(q.validityDate)} · Lead time: {q.leadTimeDays != null ? `${q.leadTimeDays} day(s)` : "-"}</p>
                {q.fileUrl ? (
                  <a href={q.fileUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-neutral-900 underline">
                    Open quotation file
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isBest ? <StatusPill tone="success">Best</StatusPill> : <StatusPill tone="neutral">Quote</StatusPill>}
                <span className="text-sm font-semibold text-neutral-950 tabular-nums">{formatCurrency(amount)}</span>
              </div>
            </summary>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <form action={upsertBidSupplierQuoteAction} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                <input type="hidden" name="opportunityId" value={props.opportunityId} />
                <input type="hidden" name="id" value={q.id} />
                <Field label="Supplier Name" name="supplierName" defaultValue={q.supplierName} required />
                <Field label="Scope / Package" name="scopeLabel" defaultValue={q.scopeLabel ?? ""} placeholder="e.g. Carpentry, M&E, Painting" />
                <Field label="Quote Amount (SGD)" name="quoteAmount" defaultValue={String(q.quoteAmount ?? 0)} inputMode="decimal" required />
                <Field label="Lead Time (days)" name="leadTimeDays" defaultValue={q.leadTimeDays != null ? String(q.leadTimeDays) : ""} inputMode="numeric" />
                <Field label="Validity Date" name="validityDate" defaultValue={q.validityDate ? String(q.validityDate).slice(0, 10) : ""} placeholder="YYYY-MM-DD" />
                <Field label="File URL" name="fileUrl" defaultValue={q.fileUrl ?? ""} placeholder="https://..." />
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-neutral-900">Notes</label>
                  <textarea
                    name="notes"
                    defaultValue={q.notes ?? ""}
                    className="mt-1 h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2">
                  <ActionButton type="submit" size="sm">
                    Save
                  </ActionButton>
                </div>
              </form>

              <form action={deleteBidSupplierQuoteAction} className="sm:col-span-2 flex justify-start">
                <input type="hidden" name="opportunityId" value={props.opportunityId} />
                <input type="hidden" name="id" value={q.id} />
                <ActionButton type="submit" variant="danger" size="sm">
                  Delete Quote
                </ActionButton>
              </form>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function Field(props: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
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
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}

