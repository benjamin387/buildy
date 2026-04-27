import { requireAuthenticatedSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PendingSubmitButton } from "@/app/(platform)/components/pending-submit-button";
import { updateLeadChannelsAction } from "@/app/(platform)/settings/lead-channels/actions";

export default async function LeadChannelsSettingsPage() {
  const session = await requireAuthenticatedSession();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      mobileNumber: true,
      whatsappNumber: true,
      telegramChatId: true,
      canSubmitLeads: true,
      updatedAt: true,
    },
  });

  if (!user) {
    // Should never happen for an authenticated session.
    return null;
  }

  return (
    <main className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Settings / Lead Channels
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Lead Channel Control
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Register your contact channels so the platform can attribute leads and route future WhatsApp/Telegram ingest safely.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <p className="font-semibold text-neutral-900">
              {session.user.name ?? session.user.email}
            </p>
            <p className="mt-1 text-neutral-600">{session.user.email}</p>
            <p className="mt-2 inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
              {session.user.primaryRoleLabel}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-neutral-950">Your Channels</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Store these values to support lead attribution and future automation. Do not paste any bot tokens here.
          </p>
        </div>

        <form action={updateLeadChannelsAction} className="grid gap-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile Number (E.164)" description="Example: +6581234567">
              <input
                name="mobileNumber"
                defaultValue={user.mobileNumber ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="+65..."
              />
            </Field>
            <Field label="WhatsApp Number (E.164)" description="Used for WhatsApp lead attribution. Example: +6581234567">
              <input
                name="whatsappNumber"
                defaultValue={user.whatsappNumber ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="+65..."
              />
            </Field>
            <Field label="Telegram Chat ID (optional)" description="Numeric chat id for future Telegram lead ingestion.">
              <input
                name="telegramChatId"
                defaultValue={user.telegramChatId ?? ""}
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none ring-neutral-400 focus:ring-2"
                placeholder="e.g. 123456789"
              />
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  name="canSubmitLeads"
                  className="h-4 w-4 rounded border-neutral-300"
                  defaultChecked={Boolean(user.canSubmitLeads)}
                />
                Enable lead submission for this account
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <PendingSubmitButton pendingText="Saving...">Save</PendingSubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}

function Field(props: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-neutral-900">{props.label}</span>
      {props.description ? <span className="text-xs text-neutral-500">{props.description}</span> : null}
      {props.children}
    </label>
  );
}

