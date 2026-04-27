import { ProjectModuleLanding } from "@/app/(platform)/components/project-module-landing";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

export default async function SupplierBillsIndexPage() {
  await requirePermission({ moduleKey: "SUPPLIER_BILLS" satisfies PermissionModuleKey, action: "view" });
  return (
    <ProjectModuleLanding
      title="Supplier Bills"
      description="Supplier bills are project-linked. Open a project to record supplier bills and update actual cost tracking."
    />
  );
}
