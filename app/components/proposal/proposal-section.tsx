import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ProposalSection(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  avoidBreakInside?: boolean;
}) {
  return (
    <section
      className={cx(
        "rounded-[26px] border border-slate-200/80 bg-white",
        "shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]",
        props.avoidBreakInside ? "[break-inside:avoid]" : null,
        props.className,
      )}
    >
      <div className="px-7 py-7 sm:px-10">
        <div className="max-w-3xl">
          {props.eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-neutral-500">{props.eyebrow}</p>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>
            {props.title}
          </h2>
          {props.subtitle ? <p className="mt-3 text-sm leading-7 text-neutral-700">{props.subtitle}</p> : null}
        </div>

        <div className="mt-6 border-t border-slate-200/70 pt-6">{props.children}</div>
      </div>
    </section>
  );
}

