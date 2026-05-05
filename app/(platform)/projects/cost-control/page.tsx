import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";

export default async function ProjectsCostControlPage() {
  await requireUser();

  return (
    <main className="space-y-6">
      <PageHeader kicker="Projects" title="Project Cost Control" subtitle="Project-level cost control is managed within each project workspace." backHref="/projects" />
      <SectionCard title="Open a Project" description="Use project tabs for Cost Ledger, Variation Orders, and Profitability.">
        <Link href="/projects" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Go to All Projects</Link>
      </SectionCard>
    </main>
  );
}
