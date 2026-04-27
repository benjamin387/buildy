import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { createBidRfqInvite } from "@/lib/bidding/rfq-service";

export const dynamic = "force-dynamic";

const schema = z.object({
  tradePackageId: z.string().optional().or(z.literal("")).default(""),
  supplierId: z.string().optional().or(z.literal("")).default(""),
  supplierNameSnapshot: z.string().optional().or(z.literal("")).default(""),
  recipientName: z.string().optional().or(z.literal("")).default(""),
  recipientEmail: z.string().optional().or(z.literal("")).default(""),
  recipientPhone: z.string().optional().or(z.literal("")).default(""),
  expiresAt: z.string().optional().or(z.literal("")).default(""),
});

function toDateOrNull(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ rfqId: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const { rfqId } = await ctx.params;

  const form = await req.formData();
  const res = schema.safeParse({
    tradePackageId: form.get("tradePackageId"),
    supplierId: form.get("supplierId"),
    supplierNameSnapshot: form.get("supplierNameSnapshot"),
    recipientName: form.get("recipientName"),
    recipientEmail: form.get("recipientEmail"),
    recipientPhone: form.get("recipientPhone"),
    expiresAt: form.get("expiresAt"),
  });
  if (!res.success) return NextResponse.json({ ok: false, error: "Invalid input." }, { status: 400 });

  let supplierNameSnapshot = res.data.supplierNameSnapshot.trim();
  let supplierId = res.data.supplierId.trim() || null;
  if (supplierId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: supplierId }, select: { id: true, name: true, email: true, phone: true } });
    if (!vendor) supplierId = null;
    if (vendor?.name) supplierNameSnapshot = vendor.name;
  }

  const rfq = await prisma.bidRfq.findUnique({ where: { id: rfqId }, select: { id: true, opportunityId: true } });
  if (!rfq) return NextResponse.json({ ok: false, error: "RFQ not found." }, { status: 404 });

  await createBidRfqInvite({
    rfqId,
    tradePackageId: res.data.tradePackageId.trim() || null,
    supplierId,
    supplierNameSnapshot,
    recipientName: res.data.recipientName || null,
    recipientEmail: res.data.recipientEmail || null,
    recipientPhone: res.data.recipientPhone || null,
    expiresAt: toDateOrNull(res.data.expiresAt),
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.redirect(new URL(`/bidding/${rfq.opportunityId}/rfq/${rfqId}`, req.url));
}

