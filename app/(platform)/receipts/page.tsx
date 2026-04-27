import { ProjectModuleLanding } from "@/app/(platform)/components/project-module-landing";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

export default async function ReceiptsIndexPage() {
  await requirePermission({ moduleKey: "RECEIPTS" satisfies PermissionModuleKey, action: "view" });
  return (
    <ProjectModuleLanding
      title="Receipts"
      description="Receipts are project-linked. Open a project to record collections and reconcile outstanding balances."
    />
  );
}
