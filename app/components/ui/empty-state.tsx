import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { ActionButton } from "@/app/components/ui/action-button";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function EmptyState(props: {
  title: string;
  description: string;
  icon?: ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-slate-200/80 bg-white px-6 py-10 text-center shadow-sm",
        "shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]",
        props.className,
      )}
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-stone-50 text-neutral-700">
        {props.icon ?? <Sparkles className="h-5 w-5" />}
      </div>
      <div className="max-w-lg">
        <p className="text-base font-semibold text-neutral-950">{props.title}</p>
        <p className="mt-1 text-sm leading-6 text-neutral-600">{props.description}</p>
      </div>
      {(props.ctaLabel && props.ctaHref) || (props.secondaryLabel && props.secondaryHref) ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {props.ctaLabel && props.ctaHref ? (
            <Link href={props.ctaHref}>
              <ActionButton>{props.ctaLabel}</ActionButton>
            </Link>
          ) : null}
          {props.secondaryLabel && props.secondaryHref ? (
            <Link href={props.secondaryHref}>
              <ActionButton variant="secondary">{props.secondaryLabel}</ActionButton>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
