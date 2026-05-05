import Link from "next/link";
import { PermissionLevel, PlatformModule } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/rbac/admin";
import { ROLE_DEFINITIONS, type AppRoleKey } from "@/lib/rbac/permissions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { createUserAction } from "@/app/(platform)/settings/users/actions";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";

function moduleLabel(m: PlatformModule): string {
  switch (m) {
    case "PROJECTS":
      return "Projects";
    case "QUOTATIONS":
      return "Quotations";
    case "CONTRACTS":
      return "Contracts";
    case "INVOICES":
      return "Invoices";
    case "SUPPLIERS":
      return "Suppliers";
    case "SETTINGS":
      return "Settings";
    case "SECURITY":
      return "Security";
    default:
      return m;
  }
}

function levelLabel(level: PermissionLevel): string {
  switch (level) {
    case "NONE":
      return "No Access";
    case "VIEW":
      return "View";
    case "EDIT":
      return "Edit";
    case "APPROVE":
      return "Approve";
    case "ADMIN":
      return "Admin";
    default:
      return level;
  }
}

const modules = Object.values(PlatformModule);
const levels: PermissionLevel[] = ["NONE", "VIEW", "EDIT", "APPROVE", "ADMIN"];

export default async function NewUserPage() {
  await requirePlatformAdmin();

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings / Users"
        title="Create User"
        subtitle="Create a platform user and assign module access. Password hashes are never displayed."
        actions={
          <Link
            href="/settings/users"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50"
          >
            Back
          </Link>
        }
      />

      <SectionCard title="User Details" description="Set a temporary password and module access.">
        <form action={createUserAction} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Name</span>
              <input
                name="name"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Jane Tan"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Email</span>
              <input
                name="email"
                required
                type="email"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="name@company.com"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Temporary Password</span>
              <input
                name="tempPassword"
                required
                type="password"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Min 8 characters"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Role</span>
              <select
                name="roleKey"
                defaultValue={"PROJECT_MANAGER" satisfies AppRoleKey}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                {ROLE_DEFINITIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
              <span className="text-neutral-800">Active</span>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Module Permissions
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((m) => (
                <label key={m} className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">{moduleLabel(m)}</span>
                  <select
                    name={`perm_${m}`}
                    defaultValue={PermissionLevel.NONE}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                  >
                    {levels.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {levelLabel(lvl)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-600">
              ADMIN role bypasses module-level checks.
            </p>
          </div>

          <div className="flex justify-end">
            <PendingSubmitButton pendingText="Creating...">Create User</PendingSubmitButton>
          </div>
        </form>
      </SectionCard>
    </main>
  );
}

