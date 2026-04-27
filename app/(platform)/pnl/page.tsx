import { ProjectModuleLanding } from "@/app/(platform)/components/project-module-landing";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

export default async function PnlIndexPage() {
  await requirePermission({ moduleKey: "PNL" satisfies PermissionModuleKey, action: "view" });
  return (
    <ProjectModuleLanding
      title="P&L"
      description="P&L is project-linked. Open a project to view profitability, alerts, and margin leakage detection."
    />
  );
}
