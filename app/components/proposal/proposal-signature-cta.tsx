import Link from "next/link";
import type { CompanyBranding } from "@/lib/branding";

export function ProposalSignatureCTA(props: {
  branding: CompanyBranding;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  note?: string;
}) {
  return (
    <section className="rounded-[26px] border border-slate-200/80 bg-white p-10 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] [break-inside:avoid]">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-neutral-500">Ready to proceed</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950" style={{ fontFamily: "var(--font-display)" }}>
            Let’s confirm the direction and move to quotation
          </h2>
          <p className="mt-3 text-sm leading-7 text-neutral-700">
            {props.note ??
              "If you would like changes, let us know the priority items and we will refine the proposal and align the quotation accordingly."}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2 no-print">
            {props.primaryCta ? (
              <Link
                href={props.primaryCta.href}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                {props.primaryCta.label}
              </Link>
            ) : null}
            {props.secondaryCta ? (
              <Link
                href={props.secondaryCta.href}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                {props.secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-stone-50 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Contact</p>
          <p className="mt-3 text-sm font-semibold text-neutral-950">{props.branding.companyName}</p>
          <p className="mt-2 text-sm text-neutral-700">{props.branding.contactEmail}</p>
          <p className="mt-1 text-sm text-neutral-700">{props.branding.contactPhone}</p>
          <p className="mt-4 text-xs leading-6 text-neutral-600">{props.branding.portfolioSummary}</p>
        </div>
      </div>
    </section>
  );
}

