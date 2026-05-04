import Link from "next/link";
import { ActionButton } from "@/app/components/ui/action-button";

export type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
};

export function PaginationControls(props: PaginationControlsProps) {
  const { page, pageSize, total, hrefForPage } = props;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <p className="text-sm text-neutral-600 tabular-nums">
        {total === 0 ? "0 results" : `${startIndex}–${endIndex} of ${total}`}
        <span className="ml-2 text-neutral-400">·</span>
        <span className="ml-2">Page {page} of {totalPages}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {page > 1 ? (
          <Link href={hrefForPage(page - 1)}>
            <ActionButton variant="secondary" size="sm">Previous</ActionButton>
          </Link>
        ) : (
          <ActionButton variant="secondary" size="sm" disabled>Previous</ActionButton>
        )}
        {page < totalPages ? (
          <Link href={hrefForPage(page + 1)}>
            <ActionButton variant="secondary" size="sm">Next</ActionButton>
          </Link>
        ) : (
          <ActionButton variant="secondary" size="sm" disabled>Next</ActionButton>
        )}
      </div>
    </div>
  );
}
