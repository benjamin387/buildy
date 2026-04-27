import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupplierInviteForPortal, submitSupplierQuoteByToken } from "@/lib/bidding/rfq-service";
import { toMoney } from "@/lib/bidding/service";

export const dynamic = "force-dynamic";

const lineSchema = z.object({
  description: z.string().min(1),
  unit: z.string().optional().nullable(),
  quantity: z.coerce.number().min(0),
  unitRate: z.coerce.number().min(0),
});

const submitSchema = z.object({
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  exclusions: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  quotationFileUrl: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const invite = await getSupplierInviteForPortal(token);
  if (!invite) return NextResponse.json({ ok: false, error: "Invalid or expired link." }, { status: 404 });

  const quote = invite.quote;
  const lines = (quote?.lines ?? []).map((l) => ({
    id: l.id,
    description: l.description,
    unit: l.unit,
    quantity: Number(l.quantity ?? 0),
    unitRate: Number(l.unitRate ?? 0),
    totalAmount: Number(l.totalAmount ?? 0),
    sortOrder: l.sortOrder,
  }));

  const total = lines.reduce((sum, l) => sum + toMoney(l.totalAmount), 0);

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      supplierName: invite.supplierNameSnapshot,
      status: invite.status,
      expiresAt: invite.expiresAt,
    },
    rfq: {
      id: invite.rfq.id,
      title: invite.rfq.title,
      status: invite.rfq.status,
      replyDeadline: invite.rfq.replyDeadline,
      briefingNotes: invite.rfq.briefingNotes,
      scopeSummary: invite.rfq.scopeSummary,
    },
    tradePackage: invite.tradePackage
      ? {
          id: invite.tradePackage.id,
          tradeKey: invite.tradePackage.tradeKey,
          title: invite.tradePackage.title,
          scopeSummary: invite.tradePackage.scopeSummary,
        }
      : null,
    quote: {
      id: quote?.id ?? null,
      status: quote?.status ?? null,
      leadTimeDays: quote?.leadTimeDays ?? null,
      exclusions: quote?.exclusions ?? null,
      remarks: quote?.remarks ?? null,
      quotationFileUrl: quote?.quotationFileUrl ?? null,
      lines,
      totalAmount: total,
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const res = submitSchema.safeParse(body ?? {});
  if (!res.success) return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });

  try {
    const result = await submitSupplierQuoteByToken({
      token,
      leadTimeDays: res.data.leadTimeDays ?? null,
      exclusions: res.data.exclusions ?? null,
      remarks: res.data.remarks ?? null,
      quotationFileUrl: res.data.quotationFileUrl ?? null,
      lines: res.data.lines.map((l) => ({
        description: l.description,
        unit: l.unit ?? null,
        quantity: l.quantity,
        unitRate: l.unitRate,
      })),
    });
    return NextResponse.json({ ok: true, rfqId: result.rfqId, quoteId: result.quoteId });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Failed to submit quote.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

