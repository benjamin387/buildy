import Link from "next/link";
import { requestClientPortalMagicLinkAction } from "@/app/client/login/actions";

export const dynamic = "force-dynamic";

export default async function ClientLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sent = typeof sp.sent === "string" ? sp.sent : "";
  const debugLink = typeof sp.debugLink === "string" ? sp.debugLink : "";

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-12 text-neutral-900 sm:px-6">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Client Portal
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
            Secure access link
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Enter your email address to receive a time-limited magic link to your project portal.
          </p>
        </header>

        <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
          {sent ? (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              If an active portal account exists for this email, you will receive a login link shortly.
            </div>
          ) : null}

          <form action={requestClientPortalMagicLinkAction} className="space-y-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-neutral-800">Email</span>
              <input
                name="email"
                type="email"
                required
                className="h-11 rounded-xl border border-neutral-300 bg-white px-3 outline-none ring-neutral-400 focus:ring-2"
                placeholder="you@email.com"
              />
            </label>

            <button className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800">
              Send Magic Link
            </button>
          </form>

          {debugLink ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Debug link (dev only)</p>
              <p className="mt-2 break-all">
                <Link href={debugLink} className="underline">
                  {debugLink}
                </Link>
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

