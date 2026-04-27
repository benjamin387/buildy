import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function StatusPill(props: { tone?: Tone; children: ReactNode; className?: string }) {
  const tone = props.tone ?? "neutral";

  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800"
          : tone === "info"
            ? "border-sky-200 bg-sky-50 text-sky-900"
            : "border-slate-200 bg-slate-50 text-neutral-800";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
        toneClass,
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}

