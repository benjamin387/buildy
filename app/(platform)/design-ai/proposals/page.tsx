import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";

export default async function DesignAiProposalsPage() {
  await requireUser();

  return (
    <main className="space-y-6">
      <PageHeader kicker="AI Design" title="Proposals" subtitle="Proposal center is ready for the next module milestone." backHref="/design-ai" />
      <SectionCard title="Module Placeholder" description="Use design briefs, concepts, BOQ, and sales follow-up while proposal workflows are being finalized.">
        <div className="flex flex-wrap gap-2">
          <Link href="/design-ai/briefs" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">Design Briefs</Link>
          <Link href="/design-ai/boq" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">AI BOQ</Link>
        </div>
      </SectionCard>
    </main>
  );
}
