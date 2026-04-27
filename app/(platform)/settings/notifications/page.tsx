import "server-only";

import type { InputHTMLAttributes } from "react";
import { requireExecutive } from "@/lib/rbac/executive";
import { getNotificationSetting } from "@/lib/settings/service";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { ActionButton } from "@/app/components/ui/action-button";
import { updateNotificationSettingsAction } from "@/app/(platform)/settings/notifications/actions";

export const dynamic = "force-dynamic";

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-950 shadow-sm",
        "placeholder:text-neutral-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-neutral-900">{props.label}</p>
        {props.hint ? <p className="mt-1 text-xs leading-5 text-neutral-500">{props.hint}</p> : null}
      </div>
      {props.children}
    </div>
  );
}

export default async function NotificationSettingsPage() {
  await requireExecutive();
  const notification = await getNotificationSetting();

  return (
    <main className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Notifications"
        subtitle="Sender defaults for email and WhatsApp messaging. Provider credentials remain in environment variables."
        backHref="/settings"
        backLabel="Settings"
      />

      <form action={updateNotificationSettingsAction} className="space-y-8">
        <SectionCard
          title="Email Sender Defaults"
          description="Used when sending messages through SMTP. Some providers require the From address to match the authenticated mailbox."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From name" hint="Displayed as sender name in clients' inbox.">
              <Input
                name="emailFromName"
                defaultValue={notification.emailFromName ?? ""}
                placeholder="Buildy"
              />
            </Field>
            <Field
              label="From address (optional)"
              hint="If set, used as the From header. Ensure SMTP provider allows it."
            >
              <Input
                name="emailFromAddress"
                defaultValue={notification.emailFromAddress ?? ""}
                placeholder="hello@company.com"
              />
            </Field>
            <Field label="Default reply-to (optional)" hint="Where client replies should go.">
              <Input
                name="defaultReplyToEmail"
                defaultValue={notification.defaultReplyToEmail ?? ""}
                placeholder="sales@company.com"
              />
            </Field>
            <Field
              label="Default sales phone (optional)"
              hint="Used in templates and client-facing contact cards."
            >
              <Input
                name="defaultSalesPhone"
                defaultValue={notification.defaultSalesPhone ?? ""}
                placeholder="+65 ..."
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="WhatsApp Sender Label"
          description="A UI label to identify which sender/channel is being used. Actual sender number is configured in provider env."
        >
          <Field label="Sender label (optional)" hint="Example: Buildy WhatsApp Business">
            <Input
              name="whatsappSenderLabel"
              defaultValue={notification.whatsappSenderLabel ?? ""}
              placeholder="Buildy WhatsApp Business"
            />
          </Field>
        </SectionCard>

        <div className="flex items-center justify-end">
          <ActionButton type="submit" variant="primary">
            Save Notification Defaults
          </ActionButton>
        </div>
      </form>
    </main>
  );
}
