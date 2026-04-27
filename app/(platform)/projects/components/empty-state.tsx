import Link from "next/link";

export function EmptyState(props: {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-6 text-center">
      <p className="text-lg font-semibold text-neutral-900">{props.title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
        {props.description}
      </p>
      <Link
        href={props.ctaHref}
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
      >
        {props.ctaLabel}
      </Link>
    </div>
  );
}

