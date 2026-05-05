import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";

export default async function FinanceRevenuePage() {
  await requireUser();

  return (
    <main className="space-y-6">
      <PageHeader kicker="Finance" title="Revenue" subtitle="Track invoices, receipts, and collections from commercial modules." backHref="/dashboard" />
      <SectionCard title="Revenue Control" description="Use current modules to manage revenue lifecycle.">
        <div className="flex flex-wrap gap-2">
          <Link href="/invoices" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Invoices</Link>
          <Link href="/receipts" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Receipts</Link>
          <Link href="/collections" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Collections</Link>
        </div>
      </SectionCard>
    </main>
  );
}
