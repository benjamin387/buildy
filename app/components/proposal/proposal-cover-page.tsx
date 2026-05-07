import type { ReactNode } from "react";
import type { CompanyBranding } from "@/lib/branding";
import { CompanyLogo } from "@/app/components/ui/company-logo";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ProposalCoverPage(props: {
  branding: CompanyBranding;
  title: string;
  subtitle?: string;
  addressedTo: string;
  projectName: string;
  projectAddress: string;
  dateLabel: string;
  heroImageUrl?: string | null;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
}) {
  const primary = props.branding.proposalTheme.primaryColor || props.branding.brandColor;
  const secondary = props.branding.proposalTheme.secondaryColor || props.branding.accentColor;

  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white",
        "shadow-[0_1px_0_rgba(16,24,40,0.04),0_18px_46px_rgba(16,24,40,0.10)]",
        props.className,
      )}
      style={{ breakAfter: "page" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(900px circle at 20% 0%, ${hexToRgba(secondary, 0.24)}, transparent 55%), radial-gradient(900px circle at 90% 0%, ${hexToRgba(primary, 0.10)}, transparent 60%)`,
        }}
      />

      <div className="relative grid gap-8 p-10 sm:p-12 lg:grid-cols-2">
        <div className="flex flex-col justify-between gap-10">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <CompanyLogo
                src={props.branding.logoUrl}
                companyName={props.branding.companyName}
                className="h-12 w-12 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
                fallbackClassName="rounded-2xl"
                fallbackMode="initial"
                fallbackTextClassName="text-xs font-bold"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-neutral-950">{props.branding.companyName}</p>
                <p className="text-xs text-neutral-600">{props.branding.website}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-neutral-600">Client Proposal</p>
              <h1
                className="mt-4 text-4xl font-semibold leading-[1.06] tracking-tight text-neutral-950 sm:text-5xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {props.title}
              </h1>
              {props.subtitle ? (
                <p className="mt-4 max-w-xl text-sm leading-7 text-neutral-700">{props.subtitle}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Meta label="Prepared for" value={props.addressedTo} />
              <Meta label="Date" value={props.dateLabel} />
              <Meta label="Project" value={props.projectName} />
              <Meta label="Site" value={props.projectAddress} />
            </div>
          </div>

          <div className="flex items-end justify-between gap-4 text-xs text-neutral-600">
            <div>{props.footerLeft ?? <span>Prepared by the Design Team</span>}</div>
            <div className="font-semibold uppercase tracking-[0.18em]">{props.footerRight ?? props.branding.website}</div>
          </div>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-stone-50">
            {props.heroImageUrl ? (
              <img
                src={props.heroImageUrl}
                alt="Proposal hero visual"
                className="h-[420px] w-full object-cover sm:h-[520px]"
              />
            ) : (
              <div className="flex h-[420px] w-full items-end justify-start bg-[radial-gradient(700px_circle_at_20%_0%,rgba(120,113,108,0.28),transparent_52%),linear-gradient(to_bottom,rgba(15,23,42,0.06),transparent_46%)] p-8 sm:h-[520px]">
                <div className="max-w-md">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-600">Design direction</p>
                  <p className="mt-3 text-xl font-semibold leading-7 tracking-tight text-neutral-950" style={{ fontFamily: "var(--font-display)" }}>
                    A refined concept that feels calm, warm, and distinctly yours.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">Contact</p>
            <p className="mt-2 text-sm font-semibold text-neutral-950">{props.branding.contactEmail}</p>
            <p className="mt-1 text-sm text-neutral-700">{props.branding.contactPhone}</p>
            {props.branding.proposalTheme.showCompanyIntro ? (
              <p className="mt-3 text-xs leading-6 text-neutral-600">{props.branding.companyIntro}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{props.label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-950">{props.value}</p>
    </div>
  );
}

function hexToRgba(input: string, alpha: number): string {
  const hex = input.trim().replace("#", "");
  if (hex.length !== 6) return `rgba(15, 23, 42, ${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(15, 23, 42, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
