import { InvoiceStatus } from "@prisma/client";

function classForStatus(status: InvoiceStatus): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "OVERDUE":
      return "bg-red-50 text-red-800 border-red-200";
    case "SENT":
    case "VIEWED":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "VOID":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "DRAFT":
    case "ISSUED":
    default:
      return "bg-neutral-50 text-neutral-800 border-neutral-200";
  }
}

export function InvoiceStatusBadge(props: { status: InvoiceStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        classForStatus(props.status),
      ].join(" ")}
    >
      {props.status}
    </span>
  );
}

