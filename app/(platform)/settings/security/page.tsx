import { requireAuthenticatedSession, listActiveSessionsForUser } from "@/lib/auth/session";
import { PasswordChangeForm } from "@/app/(platform)/settings/security/password-change-form";
import { revokeSession } from "@/app/(platform)/settings/security/actions";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatUserAgent(userAgent: string | null): string {
  if (!userAgent) {
    return "Unknown device";
  }

  return userAgent.length > 120 ? `${userAgent.slice(0, 117)}...` : userAgent;
}

export default async function SecuritySettingsPage() {
  const currentSession = await requireAuthenticatedSession();
  const sessions = await listActiveSessionsForUser(currentSession.user.id);

  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Settings / Security
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              Security Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              Review your active sessions, revoke devices you no longer trust, and rotate your password.
            </p>
          </div>

          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
            <p className="font-semibold text-neutral-900">
              {currentSession.user.name ?? currentSession.user.email}
            </p>
            <p className="mt-1 text-neutral-600">{currentSession.user.email}</p>
            <p className="mt-2 inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
              {currentSession.user.primaryRoleLabel}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-neutral-950">Active Sessions</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Every session is tracked with device, IP, and last activity details.
          </p>
        </div>

        <div className="divide-y divide-neutral-200">
          {sessions.map((session) => {
            const isCurrent = session.id === currentSession.session.id;

            return (
              <div
                key={session.id}
                className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-neutral-950">
                      {formatUserAgent(session.userAgent)}
                    </p>
                    {isCurrent ? (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Current
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-1 text-sm text-neutral-600 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-6">
                    <p>Created: {formatDateTime(session.createdAt)}</p>
                    <p>Last seen: {formatDateTime(session.lastSeenAt)}</p>
                    <p>IP: {session.ipAddress ?? "Unknown"}</p>
                    <p>Expires: {formatDateTime(session.expiresAt)}</p>
                  </div>
                </div>

                {isCurrent ? null : (
                  <form action={revokeSession.bind(null, session.id)}>
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Revoke
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <PasswordChangeForm />
    </main>
  );
}
