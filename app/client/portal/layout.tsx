import Link from "next/link";
import { requireClientPortalAccount } from "@/lib/client-portal/auth";
import { getCompanyBranding } from "@/lib/branding";
import { clientPortalSignOutAction } from "@/app/client/portal/actions";

export const dynamic = "force-dynamic";

export default async function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const account = await requireClientPortalAccount();
  const branding = await getCompanyBranding();

  return (
    <div className="min-h-screen bg-stone-50 text-neutral-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/client/portal"
              className="inline-flex items-center gap-2 rounded-2xl px-2 py-1 text-sm font-semibold tracking-tight text-neutral-950 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="h-9 w-auto max-w-[160px] object-contain"
                />
              ) : (
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-950 text-xs font-bold text-white">
                  {branding.companyName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{branding.companyName} Client Portal</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-neutral-900">{account.name}</p>
              <p className="text-xs text-neutral-500">{account.email}</p>
            </div>
            <form action={clientPortalSignOutAction}>
              <button className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">{children}</div>
    </div>
  );
}
