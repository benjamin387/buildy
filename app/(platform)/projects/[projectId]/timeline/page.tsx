import "server-only";

import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { ActivityTimeline } from "@/app/components/timeline/activity-timeline";

export const dynamic = "force-dynamic";

export default async function ProjectTimelinePage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await props.params;
  await requirePermission({ permission: Permission.PROJECT_READ, projectId });

  return (
    <main className="space-y-6">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
        Project Timeline
      </p>
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">Timeline</h2>
      <p className="text-sm leading-6 text-neutral-700">
        Consolidated activity and audit markers for this project.
      </p>

      <ActivityTimeline
        entityType="Project"
        entityId={projectId}
        includeProjectTimelineFallback
        take={40}
      />
    </main>
  );
}

