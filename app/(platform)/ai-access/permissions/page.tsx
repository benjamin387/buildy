import { AiTool } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { saveAiPermissionsAction } from "@/app/(platform)/ai-access/actions";
import { safeQuery } from "@/lib/server/safe-query";

type PermissionRow = {
  id: string;
  tool: AiTool;
  isEnabled: boolean;
  requiresApproval: boolean;
};

function toolLabel(tool: string): string {
  return tool
    .toLowerCase()
    .split("_")
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

function toBooleanLabel(v: boolean): string {
  return v ? "Enabled" : "Disabled";
}

export default async function AIAccessPermissionsPage() {
  const user = await requireExecutive();
  const permissions = await safeQuery(
    () => prisma.aiToolPermission.findMany({ where: { userId: user.id }, orderBy: { tool: "asc" } }),
    [] as PermissionRow[],
  );

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="AI Access"
        title="Permission Matrix"
        subtitle="Control which AI tools are enabled and whether they require explicit approval."
        actions={
          <a href="/ai-access">
            <ActionButton variant="secondary" size="sm">
              Back to Overview
            </ActionButton>
          </a>
        }
      />

      <SectionCard title="Tool permissions" description="Save to take effect immediately for this user profile.">
        <form action={saveAiPermissionsAction} className="space-y-4">
          {permissions.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-neutral-600">
              No permissions available yet. Save will initialize defaults.
            </p>
          ) : null}

          <div className="grid gap-3">
            {permissions.map((permission) => (
              <div
                key={permission.id}
                className="rounded-xl border border-slate-200 bg-neutral-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">{toolLabel(permission.tool)}</p>
                    <p className="text-xs text-neutral-600">
                      Enabled: {toBooleanLabel(permission.isEnabled)} · Approval required: {toBooleanLabel(permission.requiresApproval)}
                    </p>
                  </div>
                  <div className="grid min-w-fit gap-4 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        name={`tool_${permission.tool}_isEnabled`}
                        defaultChecked={permission.isEnabled}
                        className="h-4 w-4 border-slate-300"
                      />
                      Enable
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        name={`tool_${permission.tool}_requiresApproval`}
                        defaultChecked={permission.requiresApproval}
                        className="h-4 w-4 border-slate-300"
                      />
                      Require approval
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <ActionButton type="submit">Save Permissions</ActionButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}
