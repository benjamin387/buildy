import { notFound } from "next/navigation";
import { getSupplierInviteForPortal } from "@/lib/bidding/rfq-service";
import { SupplierQuoteForm } from "@/app/supplier-quote/[token]/supplier-quote-form";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-SG", { year: "numeric", month: "short", day: "2-digit" }).format(value);
}

export default async function SupplierQuotePortalPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invite = await getSupplierInviteForPortal(token);
  if (!invite) notFound();

  const quote = invite.quote;

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <SupplierQuoteForm
          token={token}
          initial={{
            supplierName: invite.supplierNameSnapshot,
            rfqTitle: invite.rfq.title,
            replyDeadline: formatDate(invite.rfq.replyDeadline),
            briefingNotes: invite.rfq.briefingNotes ?? null,
            scopeSummary: invite.rfq.scopeSummary ?? null,
            tradeTitle: invite.tradePackage?.title ?? null,
            tradeScopeSummary: invite.tradePackage?.scopeSummary ?? null,
            quote: {
              leadTimeDays: quote?.leadTimeDays ?? null,
              exclusions: quote?.exclusions ?? null,
              remarks: quote?.remarks ?? null,
              quotationFileUrl: quote?.quotationFileUrl ?? null,
              lines:
                quote?.lines?.map((l) => ({
                  description: l.description,
                  unit: l.unit,
                  quantity: Number(l.quantity ?? 0),
                  unitRate: Number(l.unitRate ?? 0),
                })) ?? [],
            },
          }}
        />

        <footer className="mt-10 text-center text-xs text-neutral-500">
          Powered by <span className="font-semibold text-neutral-700">Buildy</span>
        </footer>
      </div>
    </div>
  );
}

