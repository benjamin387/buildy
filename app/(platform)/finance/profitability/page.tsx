import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";

export default async function FinanceProfitabilityPage() {
  await requireUser();

  return (
    <main className="space-y-6">
      <PageHeader kicker="Finance" title="Profitability" subtitle="Profitability dashboards are available inside each project." backHref="/projects" />
      <SectionCard title="Project Profitability" description="Select a project to view real-time margin, cost drift, and risk summaries.">
        <Link href="/projects" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Go to All Projects</Link>
      </SectionCard>
    </main>
  );
}
