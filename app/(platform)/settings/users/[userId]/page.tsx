import Link from "next/link";
import { notFound } from "next/navigation";
import { PermissionLevel, PlatformModule, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/rbac/admin";
import { getPrimaryRoleKey, getRoleLabel, ROLE_DEFINITIONS, type AppRoleKey } from "@/lib/rbac/permissions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { updateUserAction } from "@/app/(platform)/settings/users/actions";

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

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requirePlatformAdmin();

  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: true } },
      modulePermissions: true,
    },
  });
  if (!user) notFound();

  const roleKeys = user.roles.map((r) => r.role.key);
  const primaryKey = getPrimaryRoleKey(roleKeys);

  const permsByModule = new Map<PlatformModule, PermissionLevel>();
  for (const p of user.modulePermissions) {
    permsByModule.set(p.module, p.level);
  }

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/settings/users"
                className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
              >
                Back
              </Link>
              <span className="inline-flex rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
                {user.status === "ACTIVE" ? "Active" : "Inactive"}
              </span>
            </div>

            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Settings / Users
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Edit User
            </h1>
            <p className="mt-2 text-sm text-neutral-700">{user.email}</p>
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Current Role
            </p>
            <p className="mt-2 font-semibold text-neutral-900">{getRoleLabel(primaryKey)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">User Details</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Update profile, access, and optional password reset. Do not deactivate the last active ADMIN.
          </p>
        </div>

        <form action={updateUserAction} className="space-y-6 p-6">
          <input type="hidden" name="userId" value={user.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Name</span>
              <input
                name="name"
                defaultValue={user.name ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Email</span>
              <input
                name="email"
                required
                type="email"
                defaultValue={user.email}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Role</span>
              <select
                name="roleKey"
                defaultValue={(primaryKey ?? "PROJECT_MANAGER") satisfies AppRoleKey}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
              >
                {ROLE_DEFINITIONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Reset Password (optional)</span>
              <input
                name="resetPassword"
                type="password"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Leave blank to keep current password"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={user.status === UserStatus.ACTIVE}
                className="h-4 w-4"
              />
              <span className="text-neutral-800">Active</span>
            </label>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Module Permissions
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((m) => (
                <label key={m} className="grid gap-2 text-sm">
                  <span className="font-medium text-neutral-800">{moduleLabel(m)}</span>
                  <select
                    name={`perm_${m}`}
                    defaultValue={permsByModule.get(m) ?? PermissionLevel.NONE}
                    className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
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
            <PendingSubmitButton pendingText="Saving...">Save Changes</PendingSubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}

