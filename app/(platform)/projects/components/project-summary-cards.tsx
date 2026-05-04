function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function ProjectSummaryCards(props: {
  contractValue: number;
  estimatedCost: number;
  projectedProfit: number;
  targetCompletionDate: Date | null;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard title="Contract Value" value={formatCurrency(props.contractValue)} />
      <SummaryCard title="Estimated Cost" value={formatCurrency(props.estimatedCost)} />
      <SummaryCard title="Projected Profit" value={formatCurrency(props.projectedProfit)} />
      <SummaryCard
        title="Target Completion"
        value={props.targetCompletionDate ? props.targetCompletionDate.toISOString().slice(0, 10) : "-"}
      />
    </section>
  );
}

function SummaryCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
        {props.title}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
        {props.value}
      </p>
    </div>
  );
}

