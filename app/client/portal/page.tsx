import Link from "next/link";
import { requireClientPortalAccount } from "@/lib/client-portal/auth";
import { listAccessibleProjects } from "@/lib/client-portal/service";

export const dynamic = "force-dynamic";

export default async function ClientPortalDashboardPage() {
  const account = await requireClientPortalAccount();
  const projects = await listAccessibleProjects(account.id);

  return (
    <main className="space-y-8">
      <header className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Welcome</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">Your projects</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Review presentation, quotation, contract, invoices, and progress updates.
        </p>
      </header>

      {projects.length === 0 ? (
        <section className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)]">
          <p className="text-sm text-neutral-700">
            No projects are linked to this portal account yet. Please contact your project team.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/client/portal/projects/${p.id}`}
              className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-[0_1px_0_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] transition hover:bg-stone-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-neutral-950">{p.name}</p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {p.siteAddress || p.addressLine1 || "-"}
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-700">
                  {p.status}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
                <span>Open portal</span>
                <span className="text-neutral-400">→</span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
