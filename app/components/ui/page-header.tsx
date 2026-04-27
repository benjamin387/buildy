import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader(props: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header className={cx("space-y-3", props.className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {props.backHref ? (
            <Link
              href={props.backHref}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{props.backLabel ?? "Back"}</span>
            </Link>
          ) : null}
          {props.kicker ? (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              {props.kicker}
            </p>
          ) : null}
          <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
            {props.title}
          </h1>
          {props.subtitle ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
              {props.subtitle}
            </p>
          ) : null}
        </div>
        {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
      </div>
    </header>
  );
}

