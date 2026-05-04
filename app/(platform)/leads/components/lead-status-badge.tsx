import type { LeadStatus } from "@prisma/client";
import { StatusPill } from "@/app/components/ui/status-pill";

export function LeadStatusBadge(props: { status: LeadStatus }) {
  const tone =
    props.status === "CONVERTED"
      ? "success"
      : props.status === "LOST"
        ? "danger"
        : props.status === "SITE_VISIT_SCHEDULED" || props.status === "QUOTATION_PENDING"
          ? "warning"
          : props.status === "CONTACTED" || props.status === "QUALIFYING"
            ? "info"
            : "neutral";

  return <StatusPill tone={tone}>{props.status.replaceAll("_", " ")}</StatusPill>;
}
