import type { CompanyBranding } from "@/lib/branding";
import type { ProposalContent } from "@/lib/proposals/content";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function ClientProposalDocument(props: {
  title: string;
  clientName: string;
  projectName: string;
  projectAddress?: string | null;
  quotationNumber: string;
  dateLabel: string;
  branding: CompanyBranding;
  content: ProposalContent;
}) {
  const gradient = `linear-gradient(135deg, ${props.branding.brandColor} 0%, ${props.branding.accentColor} 100%)`;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_18px_40px_rgba(16,24,40,0.08)]">
        <div className="px-6 py-8 text-white sm:px-8 sm:py-10" style={{ backgroundImage: gradient }}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Client Proposal</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{props.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/85">
            Prepared for {props.clientName} as a client-facing summary of design direction, quoted scope, pricing, and commercial terms.
          </p>
        </div>

        <div className="grid gap-4 border-t border-slate-200/80 bg-white px-6 py-5 sm:grid-cols-2 lg:grid-cols-4 sm:px-8">
          <MetaCard label="Client" value={props.clientName} />
          <MetaCard label="Project" value={props.projectName} />
          <MetaCard label="Quotation" value={props.quotationNumber} />
          <MetaCard label="Prepared" value={props.dateLabel} />
        </div>

        {props.projectAddress ? (
          <div className="border-t border-slate-200/80 px-6 py-4 text-sm text-neutral-600 sm:px-8">
            <span className="font-semibold text-neutral-900">Site address:</span> {props.projectAddress}
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Design Summary</p>
          <p className="mt-4 text-base leading-8 text-neutral-700">{props.content.designSummary.overview}</p>
          {props.content.designSummary.highlights.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {props.content.designSummary.highlights.map((item) => (
                <span
                  key={item}
                  className="inline-flex rounded-full border border-slate-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-neutral-700"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </article>

        <article className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Pricing Summary</p>
          <div className="mt-5 space-y-3">
            <PriceRow label="Subtotal" value={props.content.pricingSummary.subtotal} />
            {props.content.pricingSummary.discountAmount > 0 ? (
              <PriceRow label="Discount" value={props.content.pricingSummary.discountAmount} />
            ) : null}
            <PriceRow label="GST" value={props.content.pricingSummary.gstAmount} />
            <PriceRow label="Total" value={props.content.pricingSummary.totalAmount} strong />
          </div>
          {props.content.pricingSummary.validityDays !== null ? (
            <p className="mt-5 text-sm text-neutral-600">
              Commercial validity: {props.content.pricingSummary.validityDays} day
              {props.content.pricingSummary.validityDays === 1 ? "" : "s"}.
            </p>
          ) : null}
        </article>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Scope of Work</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Quoted work sections</h2>
          </div>
          <p className="text-sm text-neutral-600">{props.content.scopeOfWork.summary}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.content.scopeOfWork.sections.map((section) => (
            <article key={section.title} className="rounded-2xl border border-slate-200 bg-stone-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-neutral-950">{section.title}</h3>
                <span className="text-sm font-semibold text-neutral-950">{formatCurrency(section.subtotal)}</span>
              </div>
              {section.description ? (
                <p className="mt-2 text-sm leading-6 text-neutral-600">{section.description}</p>
              ) : null}
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                {section.lineItemCount} line item{section.lineItemCount === 1 ? "" : "s"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <article className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">BOQ Summary</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{props.content.boqSummary.sourceLabel}</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-600">{props.content.boqSummary.summary}</p>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-50 text-neutral-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Area</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Detail</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {props.content.boqSummary.rows.map((row) => (
                  <tr key={`${row.label}-${row.detail ?? ""}`} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-semibold text-neutral-950">{row.label}</td>
                    <td className="px-4 py-3 text-neutral-600">{row.detail ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-950">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Terms</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">Commercial notes</h2>
          <ol className="mt-5 space-y-3 text-sm leading-7 text-neutral-700">
            {props.content.terms.map((term, index) => (
              <li key={`${index}-${term}`} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-stone-50 text-xs font-semibold text-neutral-700">
                  {index + 1}
                </span>
                <span>{term}</span>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <footer className="rounded-[24px] border border-slate-200/80 bg-white p-6 text-sm leading-7 text-neutral-600 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:px-7">
        <p className="font-semibold text-neutral-950">{props.branding.companyName}</p>
        <p className="mt-2">
          For clarifications or revisions, contact {props.branding.contactEmail} or {props.branding.contactPhone}.
        </p>
      </footer>
    </div>
  );
}

function MetaCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-stone-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">{props.label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

function PriceRow(props: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-neutral-600">{props.label}</span>
      <span className={props.strong ? "text-lg font-semibold text-neutral-950" : "font-semibold text-neutral-950"}>
        {formatCurrency(props.value)}
      </span>
    </div>
  );
}
