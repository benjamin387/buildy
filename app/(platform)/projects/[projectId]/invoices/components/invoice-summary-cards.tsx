function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

function Card(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
        {props.value}
      </p>
      {props.hint ? (
        <p className="mt-1 text-sm text-neutral-600">{props.hint}</p>
      ) : null}
    </div>
  );
}

export function InvoiceSummaryCards(props: {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  overdueAmount: number;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Total Invoiced" value={formatCurrency(props.totalInvoiced)} />
      <Card label="Total Collected" value={formatCurrency(props.totalCollected)} />
      <Card label="Outstanding" value={formatCurrency(props.totalOutstanding)} />
      <Card label="Overdue" value={formatCurrency(props.overdueAmount)} />
    </section>
  );
}

