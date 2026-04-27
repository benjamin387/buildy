import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ProposalImage = {
  url: string;
  caption?: string | null;
  meta?: ReactNode;
};

export function ProposalImageGrid(props: {
  images: ProposalImage[];
  columns?: 2 | 3;
  className?: string;
}) {
  if (!props.images.length) return null;

  const cols = props.columns ?? 2;
  const gridClass = cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div className={cx("grid gap-4", gridClass, props.className)}>
      {props.images.map((img, idx) => (
        <figure key={`${img.url}-${idx}`} className="overflow-hidden rounded-[22px] border border-slate-200 bg-stone-50">
          <div className="relative">
            <img src={img.url} alt={img.caption ?? `Visual ${idx + 1}`} className="h-56 w-full object-cover sm:h-64" />
            {img.meta ? <div className="absolute left-3 top-3">{img.meta}</div> : null}
          </div>
          {img.caption ? (
            <figcaption className="border-t border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-neutral-700">
              {img.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

