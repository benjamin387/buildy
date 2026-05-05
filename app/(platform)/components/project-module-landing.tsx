import Link from "next/link";

export function ProjectModuleLanding(props: {
  title: string;
  description: string;
}) {
  return (
    <main className="space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Project Module
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
          {props.title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
          {props.description}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            href="/projects"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Open Projects
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100"
          >
            Back to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}

