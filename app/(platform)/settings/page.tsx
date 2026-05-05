import Link from "next/link";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function Card(props: { title: string; description: string; href: string }) {
  return (
    <Link
      href={props.href}
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-300 hover:shadow"
    >
      <p className="text-sm font-semibold text-neutral-950">{props.title}</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{props.description}</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Open →</p>
    </Link>
  );
}

export default async function SettingsIndexPage() {
  const user = await requireUser();
  await requirePermission({ permission: Permission.SETTINGS_READ });

  const isAdmin = user.isAdmin;
  const isExec = user.isAdmin || user.roleKeys.includes("DIRECTOR");

  return (
    <main className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">System</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-950">Settings</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-700">
          Platform configuration, access controls, integrations and automation.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isExec ? (
          <>
            <Card
              title="Company"
              description="Company profile and branding used across proposals, prints, and client portal."
              href="/settings/company"
            />
            <Card
              title="Proposal Theme"
              description="Presentation theme toggles, typography and color controls."
              href="/settings/proposal"
            />
            <Card
              title="Finance Defaults"
              description="GST defaults, payment terms, bank and PayNow instructions."
              href="/settings/finance"
            />
            <Card
              title="Notifications"
              description="Email From settings, reply-to defaults and WhatsApp sender label."
              href="/settings/notifications"
            />
            <Card
              title="GeBIZ Auto-Feed"
              description="RSS feed sources, keyword filters, minimum value rules, import runs and imported opportunities."
              href="/settings/gebiz"
            />
            <Card
              title="Company Compliance"
              description="UEN/GST/BCA/BizSAFE profile used in tender submission packs."
              href="/settings/company-compliance"
            />
            <Card
              title="Document Library"
              description="Reusable tender and compliance documents with expiry tracking."
              href="/settings/document-library"
            />
          </>
        ) : null}
        <Card
          title="Security"
          description="Roles, permissions, and access checks."
          href="/settings/security"
        />
        <Card
          title="Lead Channels"
          description="Mobile number, WhatsApp number, Telegram chat and lead intake controls."
          href="/settings/lead-channels"
        />
        <Card
          title="Bot Leads"
          description="WhatsApp/Telegram webhook URLs and bot session monitoring."
          href="/settings/bot-leads"
        />
        <Card
          title="Accounting"
          description="Xero-ready accounting mappings, tax codes and sync logs."
          href="/settings/accounting"
        />
        <Card
          title="Automation"
          description="AI orchestrator and platform automation controls (legacy read-only)."
          href="/settings/automation"
        />
        {isAdmin ? (
          <Card
            title="User Access"
            description="Create users and assign module-level permissions."
            href="/settings/users"
          />
        ) : null}
        {isExec ? (
          <Card
            title="Role Permissions"
            description="Fine-grained module/action permissions matrix by role."
            href="/settings/roles-access"
          />
        ) : null}
      </section>
    </main>
  );
}
