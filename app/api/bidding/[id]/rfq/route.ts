import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { createBidRfq, defaultTradePackages } from "@/lib/bidding/rfq-service";
import { BidTradePackageKey } from "@prisma/client";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(1),
  replyDeadline: z.string().optional().or(z.literal("")).default(""),
  briefingNotes: z.string().optional().or(z.literal("")).default(""),
  scopeSummary: z.string().optional().or(z.literal("")).default(""),
  tradeKeys: z.array(z.nativeEnum(BidTradePackageKey)).default([]),
});

function toDateOrNull(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "create" });
  const user = await requireUser();
  const { id: opportunityId } = await ctx.params;

  const contentType = req.headers.get("content-type") ?? "";
  let parsed: z.infer<typeof schema> | null = null;

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const res = schema.safeParse(body ?? {});
    if (!res.success) return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
    parsed = res.data;
  } else {
    const form = await req.formData();
    const tradeKeys = form.getAll("tradeKeys").map((v) => String(v)) as BidTradePackageKey[];
    const res = schema.safeParse({
      title: form.get("title"),
      replyDeadline: form.get("replyDeadline"),
      briefingNotes: form.get("briefingNotes"),
      scopeSummary: form.get("scopeSummary"),
      tradeKeys,
    });
    if (!res.success) return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
    parsed = res.data;
  }

  const tradeKeys =
    parsed.tradeKeys.length > 0
      ? parsed.tradeKeys
      : defaultTradePackages().map((t) => t.tradeKey);

  const rfq = await createBidRfq({
    opportunityId,
    title: parsed.title,
    replyDeadline: toDateOrNull(parsed.replyDeadline),
    briefingNotes: parsed.briefingNotes || null,
    scopeSummary: parsed.scopeSummary || null,
    tradeKeys,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.redirect(new URL(`/bidding/${opportunityId}/rfq/${rfq.id}`, req.url));
}

