import Link from "next/link";
import { PermissionLevel, PlatformModule, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/rbac/admin";
import { getPrimaryRoleKey, getRoleLabel, ROLE_DEFINITIONS, type AppRoleKey } from "@/lib/rbac/permissions";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { createUserAction } from "@/app/(platform)/settings/users/actions";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

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

function summarizePermissions(rows: { module: PlatformModule; level: PermissionLevel }[]): string {
  const important = rows.filter((r) => r.level !== "NONE");
  if (important.length === 0) return "No module access";
  return important
    .map((r) => `${moduleLabel(r.module)}: ${r.level}`)
    .join(" · ");
}

const modules = Object.values(PlatformModule);
const levels: PermissionLevel[] = ["NONE", "VIEW", "EDIT", "APPROVE", "ADMIN"];

export default async function UsersSettingsPage() {
  await requirePlatformAdmin();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      createdAt: true,
      roles: { select: { role: { select: { key: true, name: true } } } },
      modulePermissions: { select: { module: true, level: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const userRows = users.map((u) => {
    const roleKeys = u.roles.map((r) => r.role.key);
    const primary = getPrimaryRoleKey(roleKeys);
    return {
      ...u,
      primaryRoleKey: primary,
      primaryRoleLabel: getRoleLabel(primary),
      moduleSummary: summarizePermissions(u.modulePermissions),
    };
  });

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Settings / Users
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              User Access Management
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Create platform users, manage roles, and assign module-level access levels. Password hashes are never displayed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/settings/users/new"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              New User
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Create User</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Set a temporary password and module access. Users can change passwords in Settings → Security.
          </p>
        </div>

        <form action={createUserAction} className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Name</span>
              <input
                name="name"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. Jane Tan"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Email</span>
              <input
                name="email"
                required
                type="email"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="name@company.com"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Temporary Password</span>
              <input
                name="tempPassword"
                required
                type="password"
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="Min 8 characters"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Role</span>
              <select
                name="roleKey"
                defaultValue={"PROJECT_MANAGER" satisfies AppRoleKey}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
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
                    defaultValue={PermissionLevel.NONE}
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
            <PendingSubmitButton pendingText="Creating...">Create User</PendingSubmitButton>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">Users</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Manage user status and module access. Deleting users is disabled; deactivate instead.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Module Permissions</th>
                <th className="px-4 py-3 text-left font-semibold">Created</th>
                <th className="px-4 py-3 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {userRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-600" colSpan={7}>
                    No users found.
                  </td>
                </tr>
              ) : (
                userRows.map((u) => (
                  <tr key={u.id} className="border-t border-neutral-200">
                    <td className="px-4 py-3 font-medium text-neutral-950">{u.name ?? "-"}</td>
                    <td className="px-4 py-3 text-neutral-700">{u.email}</td>
                    <td className="px-4 py-3 text-neutral-700">{u.primaryRoleLabel}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {u.status === UserStatus.ACTIVE ? "Active" : "Inactive"}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{u.moduleSummary}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/settings/users/${u.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
