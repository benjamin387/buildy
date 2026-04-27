import { ProjectModuleLanding } from "@/app/(platform)/components/project-module-landing";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";

export default async function InvoicesIndexPage() {
  await requirePermission({ moduleKey: "INVOICES" satisfies PermissionModuleKey, action: "view" });
  return (
    <ProjectModuleLanding
      title="Invoices"
      description="Invoices are project-linked. Open a project to create invoices, print, and record receipts."
    />
  );
}
