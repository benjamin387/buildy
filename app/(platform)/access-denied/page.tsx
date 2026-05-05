import Link from "next/link";

function toSingle(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccessDeniedPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const moduleKey = toSingle(searchParams.module);
  const action = toSingle(searchParams.action);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Access Control</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Access denied</h1>
        <p className="mt-3 text-sm text-slate-600">
          You do not have permission to access this module or action. Contact an administrator to update your module access.
        </p>

        {moduleKey || action ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              <span className="font-medium text-slate-900">Module:</span> {moduleKey ?? "-"}
            </p>
            <p className="mt-1">
              <span className="font-medium text-slate-900">Action:</span> {action ?? "view"}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/settings/users"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
          >
            Request Access
          </Link>
        </div>
      </section>
    </main>
  );
}
