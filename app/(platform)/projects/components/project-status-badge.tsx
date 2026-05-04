import { ProjectStatus } from "@prisma/client";
import { StatusPill } from "@/app/components/ui/status-pill";

function labelForStatus(status: ProjectStatus): string {
  return status
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function ProjectStatusBadge(props: { status: ProjectStatus }) {
  const tone =
    props.status === "COMPLETED"
      ? "success"
      : props.status === "IN_PROGRESS"
        ? "warning"
        : props.status === "ON_HOLD" || props.status === "CANCELLED"
          ? "danger"
          : props.status === "PLANNING"
            ? "info"
            : "neutral";

  return <StatusPill tone={tone}>{labelForStatus(props.status)}</StatusPill>;
}
