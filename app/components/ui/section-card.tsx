import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function SectionCard(props: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
        "shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]",
        props.className,
      )}
    >
      {props.title ? (
        <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {/*
                Heading scale: H1 (page) is text-3xl/4xl, body is text-sm/text-base.
                Section H2 was previously text-base (16px) which is identical in size
                to body copy and only distinguishable by weight — that's why
                section breaks felt weak. Bumping to text-lg (18px) gives a real
                mid-tier without being shouty.
              */}
              <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
                {props.title}
              </h2>
              {props.description ? (
                <p className="mt-1 text-sm leading-6 text-neutral-600">
                  {props.description}
                </p>
              ) : null}
            </div>
            {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
          </div>
        </div>
      ) : null}
      <div className="px-5 py-5 sm:px-6">{props.children}</div>
    </section>
  );
}
