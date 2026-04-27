import { PaymentScheduleStatus } from "@prisma/client";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(value);
}

function statusPill(status: PaymentScheduleStatus): string {
  switch (status) {
    case "PAID":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "PARTIALLY_PAID":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "BILLED":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "OVERDUE":
      return "bg-red-50 text-red-800 border-red-200";
    default:
      return "bg-neutral-50 text-neutral-800 border-neutral-200";
  }
}

export function PaymentScheduleTable(props: {
  projectId: string;
  schedules: Array<{
    id: string;
    label: string;
    dueDate: Date | null;
    scheduledAmount: unknown;
    billedAmount: unknown;
    paidAmount: unknown;
    status: PaymentScheduleStatus;
  }>;
  renderAction: (scheduleId: string, status: PaymentScheduleStatus) => React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-100 text-neutral-800">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Label</th>
            <th className="px-4 py-3 text-left font-semibold">Due</th>
            <th className="px-4 py-3 text-right font-semibold">Scheduled</th>
            <th className="px-4 py-3 text-right font-semibold">Billed</th>
            <th className="px-4 py-3 text-right font-semibold">Paid</th>
            <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {props.schedules.map((s) => {
            const scheduled = Number(s.scheduledAmount);
            const billed = Number(s.billedAmount);
            const paid = Number(s.paidAmount);
            const outstanding = Math.max(scheduled - paid, 0);
            return (
              <tr key={s.id} className="border-t border-neutral-200 bg-white">
                <td className="px-4 py-3 font-medium text-neutral-900">{s.label}</td>
                <td className="px-4 py-3 text-neutral-700">{formatDate(s.dueDate)}</td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900">
                  {formatCurrency(scheduled)}
                </td>
                <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(billed)}</td>
                <td className="px-4 py-3 text-right text-neutral-900">{formatCurrency(paid)}</td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900">
                  {formatCurrency(outstanding)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                      statusPill(s.status),
                    ].join(" ")}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3">{props.renderAction(s.id, s.status)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
