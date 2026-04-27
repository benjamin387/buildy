import { ProjectStatus } from "@prisma/client";

function labelForStatus(status: ProjectStatus): string {
  return status
    .split("_")
    .map((part) => `${part[0]}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

export function ProjectStatusBadge(props: { status: ProjectStatus }) {
  return (
    <span className="inline-flex rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-800">
      {labelForStatus(props.status)}
    </span>
  );
}

