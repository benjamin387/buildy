"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { setPreferredQuoteForTradePackage } from "@/lib/bidding/rfq-service";
import { prisma } from "@/lib/prisma";

const preferredSchema = z.object({
  rfqId: z.string().min(1),
  tradePackageId: z.string().min(1),
  preferredQuoteId: z.string().optional().or(z.literal("")).default(""),
});

export async function setBidRfqPreferredQuoteAction(formData: FormData) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "edit" });
  const user = await requireUser();
  const parsed = preferredSchema.safeParse({
    rfqId: formData.get("rfqId"),
    tradePackageId: formData.get("tradePackageId"),
    preferredQuoteId: formData.get("preferredQuoteId"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await setPreferredQuoteForTradePackage({
    tradePackageId: parsed.data.tradePackageId,
    preferredQuoteId: parsed.data.preferredQuoteId.trim() ? parsed.data.preferredQuoteId.trim() : null,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  const rfq = await prisma.bidRfq.findUnique({ where: { id: parsed.data.rfqId }, select: { id: true, opportunityId: true } });
  const opportunityId = rfq?.opportunityId ?? null;
  if (opportunityId) {
    revalidatePath(`/bidding/${opportunityId}/rfq/${parsed.data.rfqId}`);
    revalidatePath(`/bidding/${opportunityId}/rfq`);
    redirect(`/bidding/${opportunityId}/rfq/${parsed.data.rfqId}`);
  }

  revalidatePath(`/bidding/pipeline`);
  redirect(`/bidding/pipeline`);
}
