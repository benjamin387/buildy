import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/app/components/ui/page-header";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { ActionButton } from "@/app/components/ui/action-button";
import { TemplateCopyButton } from "@/app/components/templates/copy-button";
import {
  generateAISalesAdvice,
  generateWhatsAppReply,
  markFollowUpDone,
  scheduleNextFollowUp,
} from "@/app/(platform)/design-ai/sales/actions";
import { whatsappCredentialsConfigured } from "@/lib/design-ai/sales-engine";
import { SALES_STAGES } from "@/lib/design-ai/sales-constants";

export default async function DesignAiSalesDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const followUp = await prisma.clientFollowUp.findUnique({
    where: { id },
    include: {
      designBrief: true,
      quotation: true,
    },
  });

  if (!followUp) notFound();

  const canSendWhatsApp = whatsappCredentialsConfigured();

  return (
    <main className="space-y-6">
      <PageHeader
        kicker="AI Design"
        title={followUp.clientName}
        subtitle="AI-driven follow-up strategy, WhatsApp response, and close-plan execution."
        backHref="/design-ai/sales"
        actions={<StatusPill tone={followUp.status === "DONE" ? "success" : "warning"}>{followUp.status}</StatusPill>}
      />

      <SectionCard title="Follow-up Details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Phone" value={followUp.clientPhone} />
          <Info label="Stage" value={followUp.stage} />
          <Info label="Priority" value={followUp.priority} />
          <Info label="Next Follow-up" value={followUp.nextFollowUpAt ? followUp.nextFollowUpAt.toLocaleString() : "-"} />
          <Info label="Design Brief" value={followUp.designBrief?.title ?? "-"} />
          <Info label="Quotation" value={followUp.quotation ? `${followUp.quotation.quotationNumber} (V${followUp.quotation.version})` : "-"} />
          <Info label="Last Contacted" value={followUp.lastContactedAt ? followUp.lastContactedAt.toLocaleString() : "-"} />
          <Info label="Proposal ID" value={followUp.proposalId || "-"} />
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Client Concern</p>
          <p className="mt-1 text-sm text-neutral-700">{followUp.clientConcern || "-"}</p>
        </div>
      </SectionCard>

      <SectionCard title="AI Recommendation Panel" description="Best next action, objection handling, upsell, discount, and closing strategy.">
        <div className="flex flex-wrap gap-2">
          <form action={generateAISalesAdvice}>
            <input type="hidden" name="followUpId" value={followUp.id} />
            <ActionButton type="submit">Generate AI Sales Advice</ActionButton>
          </form>
          <form action={generateWhatsAppReply}>
            <input type="hidden" name="followUpId" value={followUp.id} />
            <input type="hidden" name="sendNow" value="no" />
            <ActionButton type="submit" variant="secondary">Generate WhatsApp Reply</ActionButton>
          </form>
          <form action={markFollowUpDone}>
            <input type="hidden" name="followUpId" value={followUp.id} />
            <ActionButton type="submit" variant="secondary">Mark Done</ActionButton>
          </form>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Panel title="AI Suggested Reply" value={followUp.aiSuggestedReply || "-"} />
          <Panel title="AI Objection Handling" value={followUp.aiObjectionHandling || "-"} />
          <Panel title="AI Upsell Suggestion" value={followUp.aiUpsellSuggestion || "-"} />
          <Panel title="AI Discount Recommendation" value={followUp.aiDiscountLimit || "-"} />
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp Message Preview" description="Send directly when provider credentials are configured, otherwise copy-only mode.">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{followUp.aiSuggestedReply || "Generate AI reply first."}</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <TemplateCopyButton text={followUp.aiSuggestedReply || ""} label="Copy Message" />
          {canSendWhatsApp ? (
            <form action={generateWhatsAppReply}>
              <input type="hidden" name="followUpId" value={followUp.id} />
              <input type="hidden" name="sendNow" value="yes" />
              <ActionButton type="submit">Send via WhatsApp</ActionButton>
            </form>
          ) : (
            <StatusPill tone="info">Provider not configured: copy-only mode</StatusPill>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Schedule Next Follow-up">
        <form action={scheduleNextFollowUp} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="followUpId" value={followUp.id} />
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Next Follow-up</span>
            <input name="nextFollowUpAt" type="datetime-local" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
          </label>
          <ActionButton type="submit">Schedule</ActionButton>
        </form>
      </SectionCard>

      <SectionCard title="Stage Guide">
        <div className="flex flex-wrap gap-2">
          {SALES_STAGES.map((stage) => (
            <StatusPill key={stage} tone={stage === followUp.stage ? "success" : "neutral"}>{stage}</StatusPill>
          ))}
        </div>
      </SectionCard>
    </main>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.label}</p>
      <p className="mt-1 text-sm text-neutral-900">{props.value}</p>
    </div>
  );
}

function Panel(props: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{props.title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{props.value}</p>
    </div>
  );
}
