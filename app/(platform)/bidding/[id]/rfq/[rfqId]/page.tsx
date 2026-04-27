import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { safeQuery } from "@/lib/server/safe-query";
import { getBidRfqDetail } from "@/lib/bidding/rfq-service";
import { buildSupplierQuotePortalUrl } from "@/lib/bidding/rfq-links";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { CopyLinkButton } from "@/app/components/ui/copy-link-button";
import { setBidRfqPreferredQuoteAction } from "@/app/(platform)/bidding/rfq-actions";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 2 }).format(value);
}

function quoteTotal(quote: any): number {
  const lines = quote?.lines ?? [];
  return lines.reduce((sum: number, l: any) => sum + Number(l.totalAmount ?? 0), 0);
}

type QuoteTotalRow = { id: string; total: number; supplier: string };

export default async function BidRfqDetailPage(props: { params: Promise<{ id: string; rfqId: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "view" });
  const { id: opportunityId, rfqId } = await props.params;

  const rfq = await safeQuery(() => getBidRfqDetail(rfqId), null as any);
  if (!rfq || rfq.opportunityId !== opportunityId) notFound();

  const vendors = await safeQuery(
    () =>
      prisma.vendor.findMany({
        where: { status: "APPROVED" },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, email: true, phone: true, type: true },
        take: 200,
      }),
    [],
  );

  const invites = rfq.supplierInvites ?? [];
  const submittedQuotes = rfq.quotes?.filter((q: any) => String(q.status) === "SUBMITTED") ?? [];
  const totalQuotes = submittedQuotes.length;

  return (
    <main className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="RFQ Overview" description="Issue secure supplier quote links. Compare returns by trade package and select preferred quotes.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Status" value={<StatusPill tone={rfq.status === "CLOSED" ? "success" : rfq.status === "CANCELLED" ? "danger" : rfq.status === "IN_PROGRESS" ? "info" : "neutral"}>{String(rfq.status).replaceAll("_", " ")}</StatusPill>} />
              <Metric label="Reply Deadline" value={<span className="font-semibold text-neutral-950">{formatDate(rfq.replyDeadline)}</span>} />
              <Metric label="Quotes Submitted" value={<span className="font-semibold text-neutral-950 tabular-nums">{totalQuotes}</span>} />
            </div>

            {(rfq.scopeSummary || rfq.briefingNotes) ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-stone-50 p-4">
                {rfq.scopeSummary ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Scope Summary</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{rfq.scopeSummary}</p>
                  </div>
                ) : null}
                {rfq.briefingNotes ? (
                  <div className={rfq.scopeSummary ? "mt-4" : ""}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Briefing Notes</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{rfq.briefingNotes}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/bidding/${opportunityId}/cost-builder`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                Open Auto Cost Builder
              </Link>
              <Link href={`/bidding/${opportunityId}/cost-versions`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                View Cost Versions
              </Link>
            </div>
          </SectionCard>
        </div>

        <div className="lg:col-span-1">
          <SectionCard title="Create Supplier Invite" description="Generate a secure supplier quote link (no login). You can send it manually via WhatsApp or email.">
            <form action={`/api/bidding/rfq/${rfq.id}/invite`} method="post" className="grid gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Trade Package</label>
                <select name="tradePackageId" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                  <option value="">(Whole RFQ / General)</option>
                  {rfq.tradePackages.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-900">Supplier</label>
                <select name="supplierId" className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200">
                  <option value="">(Manual entry)</option>
                  {vendors.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-neutral-500">If supplier is not in list, enter name below.</p>
                <input
                  name="supplierNameSnapshot"
                  placeholder="Supplier name (if manual)"
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Recipient Name" name="recipientName" placeholder="Optional" />
                <Field label="Recipient Email" name="recipientEmail" placeholder="Optional" />
              </div>
              <Field label="Recipient WhatsApp (optional)" name="recipientPhone" placeholder="+65..." />
              <Field label="Link Expiry (optional)" name="expiresAt" placeholder="YYYY-MM-DD" />
              <div className="flex justify-end pt-1">
                <ActionButton type="submit">Create Invite</ActionButton>
              </div>
            </form>
          </SectionCard>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Invites" description="Track link status (sent/opened/replied). Supplier does not see internal margin.">
          {invites.length === 0 ? (
            <EmptyState title="No invites yet" description="Create supplier invites to request pricing by trade package." />
          ) : (
            <div className="space-y-3">
              {invites.map((inv: any) => {
                const url = buildSupplierQuotePortalUrl(inv.token);
                const tone =
                  inv.status === "REPLIED"
                    ? "success"
                    : inv.status === "OPENED"
                      ? "info"
                      : inv.status === "OVERDUE"
                        ? "warning"
                        : inv.status === "CANCELLED"
                          ? "danger"
                          : "neutral";
                const q = inv.quote;
                const total = q && String(q.status) === "SUBMITTED" ? quoteTotal(q) : null;
                return (
                  <div key={inv.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-950">{inv.supplierNameSnapshot}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Trade: {inv.tradePackage?.title ?? "General"} · Expires: {formatDate(inv.expiresAt)}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Sent: {formatDate(inv.sentAt)} · Opened: {formatDate(inv.openedAt)} · Replied: {formatDate(inv.repliedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={tone}>{String(inv.status).replaceAll("_", " ")}</StatusPill>
                        {total != null ? (
                          <span className="text-sm font-semibold tabular-nums text-neutral-950">{formatCurrency(total)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <CopyLinkButton value={url} label="Copy supplier link" />
                      <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50">
                        Preview supplier portal
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Trade Packages & Comparison" description="Review quotes by trade. Mark a preferred supplier quote to drive Auto Cost Builder.">
          {rfq.tradePackages.length === 0 ? (
            <EmptyState title="No trade packages" description="Create trade packages to compare supplier scope and pricing." />
          ) : (
            <div className="space-y-3">
              {rfq.tradePackages.map((pkg: any) => {
                const quotes = submittedQuotes.filter((q: any) => q.tradePackageId === pkg.id);
                const totals: QuoteTotalRow[] = quotes.map((q: any) => ({
                  id: String(q.id),
                  total: quoteTotal(q),
                  supplier: String(q.supplierNameSnapshot ?? ""),
                }));
                const best = totals.length
                  ? totals.reduce((a: QuoteTotalRow, b: QuoteTotalRow) => (b.total > 0 && b.total < a.total ? b : a), totals[0])
                  : null;
                const preferredId = pkg.preferredQuoteId ?? null;
                return (
                  <details key={pkg.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-950">{pkg.title}</p>
                        <p className="mt-1 text-xs text-neutral-500">Quotes: {quotes.length}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {preferredId ? <StatusPill tone="success">Preferred</StatusPill> : best ? <StatusPill tone="info">Best price</StatusPill> : <StatusPill tone="neutral">Pending</StatusPill>}
                        <span className="text-sm font-semibold tabular-nums text-neutral-950">{best ? formatCurrency(best.total) : "-"}</span>
                      </div>
                    </summary>

                    {pkg.scopeSummary ? <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{pkg.scopeSummary}</p> : null}

                    {quotes.length === 0 ? (
                      <p className="mt-4 text-sm text-neutral-600">No submitted quotes for this trade package yet.</p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {quotes.map((q: any) => {
                          const total = quoteTotal(q);
                          const isPreferred = preferredId === q.id;
                          const isBest = best && best.id === q.id;
                          return (
                            <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-stone-50 px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-neutral-950">{q.supplierNameSnapshot}</p>
                                <p className="mt-1 text-xs text-neutral-500">Lead time: {q.leadTimeDays != null ? `${q.leadTimeDays}d` : "-"} · Submitted: {formatDate(q.submittedAt)}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {isPreferred ? <StatusPill tone="success">Preferred</StatusPill> : isBest ? <StatusPill tone="info">Cheapest</StatusPill> : <StatusPill tone="neutral">Quote</StatusPill>}
                                <span className="text-sm font-semibold tabular-nums text-neutral-950">{formatCurrency(total)}</span>
                                <form action={setBidRfqPreferredQuoteAction}>
                                  <input type="hidden" name="rfqId" value={rfq.id} />
                                  <input type="hidden" name="tradePackageId" value={pkg.id} />
                                  <input type="hidden" name="preferredQuoteId" value={q.id} />
                                  <ActionButton size="sm" type="submit" variant={isPreferred ? "secondary" : "primary"}>
                                    {isPreferred ? "Selected" : "Select"}
                                  </ActionButton>
                                </form>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-end">
                          <form action={setBidRfqPreferredQuoteAction}>
                            <input type="hidden" name="rfqId" value={rfq.id} />
                            <input type="hidden" name="tradePackageId" value={pkg.id} />
                            <input type="hidden" name="preferredQuoteId" value="" />
                            <ActionButton size="sm" type="submit" variant="ghost">
                              Clear Preferred
                            </ActionButton>
                          </form>
                        </div>
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </SectionCard>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <div className="mt-2">{props.value}</div>
    </div>
  );
}

function Field(props: { label: string; name: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-neutral-900">{props.label}</label>
      <input
        name={props.name}
        placeholder={props.placeholder}
        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
      />
    </div>
  );
}
