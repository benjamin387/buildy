import type { SiteVisitStatus } from "@prisma/client";

const styles: Record<SiteVisitStatus, string> = {
  SCHEDULED: "border-neutral-200 bg-white text-neutral-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CANCELLED: "border-red-200 bg-red-50 text-red-800",
};

export function SiteVisitStatusBadge(props: { status: SiteVisitStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]",
        styles[props.status],
      ].join(" ")}
    >
      {props.status}
    </span>
  );
}

