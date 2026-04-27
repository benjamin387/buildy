import type { LeadStatus } from "@prisma/client";

export function LeadStatusBadge(props: { status: LeadStatus }) {
  const tone =
    props.status === "CONVERTED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : props.status === "LOST"
        ? "bg-red-50 text-red-700 border-red-200"
        : props.status === "SITE_VISIT_SCHEDULED"
          ? "bg-amber-50 text-amber-800 border-amber-200"
          : props.status === "QUOTATION_PENDING"
            ? "bg-yellow-50 text-yellow-800 border-yellow-200"
            : props.status === "CONTACTED" || props.status === "QUALIFYING"
              ? "bg-neutral-100 text-neutral-800 border-neutral-200"
              : "bg-neutral-100 text-neutral-800 border-neutral-200";

  return (
    <span
      className={`inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${tone}`}
    >
      {props.status.replaceAll("_", " ")}
    </span>
  );
}

