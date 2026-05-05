import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";

export default async function DesignAiConceptsLandingPage() {
  await requireUser();

  return (
    <main className="space-y-6">
      <PageHeader kicker="AI Design" title="Concepts" subtitle="Concept generation lives inside each design brief." backHref="/design-ai" />
      <SectionCard title="Open Concepts via Briefs" description="Use briefs to review existing concepts and generate new ones.">
        <Link href="/design-ai/briefs" className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-slate-50">
          Go to Design Briefs
        </Link>
      </SectionCard>
    </main>
  );
}
