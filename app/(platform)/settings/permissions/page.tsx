import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { ROLE_DEFINITIONS, type AppRoleKey } from "@/lib/rbac/permissions";
import { PERMISSION_MODULE_KEYS } from "@/lib/auth/permission-keys";
import { DEFAULT_PERMISSION_RULES_BY_ROLE } from "@/lib/auth/permission-defaults";
import { getCurrentUserAccess, requireModuleAccess } from "@/lib/auth/module-access";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { RolePermissionMatrix, type PermissionRuleLike } from "@/app/(platform)/settings/permissions/role-permission-matrix";
import { saveRolePermissionMatrixAction, resetRolePermissionMatrixAction } from "@/app/(platform)/settings/permissions/actions";

function toSingle(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export const dynamic = "force-dynamic";

export default async function PermissionsSettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireExecutive();
  await requireModuleAccess("roles_access", "view");
  const access = await getCurrentUserAccess();
  const canEdit = access.isAdmin || access.matrix.roles_access.canEdit;
  const sp = await props.searchParams;

  const roleParam = (toSingle(sp.role) ?? "").trim();
  const roleKey: AppRoleKey =
    ROLE_DEFINITIONS.some((r) => r.key === (roleParam as AppRoleKey))
      ? (roleParam as AppRoleKey)
      : "DIRECTOR";

  const modules = PERMISSION_MODULE_KEYS;
  const rulesDb = await prisma.permissionRule.findMany({ where: { roleKey } }).catch(() => []);

  // Merge code defaults with DB overrides so newly added modules (e.g. BIDDING)
  // show correct defaults even if DB hasn't been seeded yet.
  const defaults = DEFAULT_PERMISSION_RULES_BY_ROLE[roleKey] ?? [];
  const byModule = new Map<string, PermissionRuleLike>();
  for (const d of defaults) byModule.set(d.moduleKey, { ...d });
  for (const m of modules) {
    if (!byModule.has(m)) {
      byModule.set(m, {
        moduleKey: m,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canSend: false,
        canExport: false,
      });
    }
  }
  for (const r of rulesDb as any[]) {
    byModule.set(String(r.moduleKey), {
      moduleKey: String(r.moduleKey) as any,
      canView: Boolean(r.canView),
      canCreate: Boolean(r.canCreate),
      canEdit: Boolean(r.canEdit),
      canDelete: Boolean(r.canDelete),
      canApprove: Boolean(r.canApprove),
      canSend: Boolean(r.canSend),
      canExport: Boolean(r.canExport),
    });
  }
  const rules = Array.from(byModule.values());

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings / Security"
        title="Role Permissions"
        subtitle="Fine-grained module/action control by role. Sidebar items and key workflows use these rules."
        actions={
          <Link href="/settings">
            <ActionButton variant="secondary">Back to Settings</ActionButton>
          </Link>
        }
      />

      <SectionCard
        title="Roles"
        description="Select a role to edit. Changes apply to all users with that role."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {ROLE_DEFINITIONS.map((r) => (
              <Link key={r.key} href={`/settings/permissions?role=${r.key}`}>
                <ActionButton variant={r.key === roleKey ? "primary" : "secondary"} size="sm">
                  {r.name}
                </ActionButton>
              </Link>
            ))}
          </div>
        }
      >
        <div className="text-sm text-neutral-600">
          Current: <span className="font-semibold text-neutral-950">{ROLE_DEFINITIONS.find((r) => r.key === roleKey)?.name ?? roleKey}</span>
        </div>
      </SectionCard>

      <SectionCard
        title="Permission Matrix"
        description="Toggle what this role can do per module."
        actions={
          <form action={resetRolePermissionMatrixAction}>
            <input type="hidden" name="roleKey" value={roleKey} />
            <ActionButton type="submit" variant="danger" disabled={!canEdit}>
              Reset to defaults
            </ActionButton>
          </form>
        }
      >
        <form action={saveRolePermissionMatrixAction} className="space-y-4">
          <fieldset disabled={!canEdit} className="space-y-4 disabled:cursor-not-allowed disabled:opacity-60">
          <input type="hidden" name="roleKey" value={roleKey} />

          <RolePermissionMatrix roleKey={roleKey} modules={modules} rules={rules} />

          <div className="flex justify-end gap-2">
            <ActionButton type="submit">Save Changes</ActionButton>
          </div>
          </fieldset>
        </form>
      </SectionCard>
    </main>
  );
}
