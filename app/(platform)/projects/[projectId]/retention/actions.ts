"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission, RetentionEntryType } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { createRetentionRelease } from "@/lib/claims/service";

const releaseSchema = z.object({
  projectId: z.string().min(1),
  contractId: z.string().optional().or(z.literal("")).default(""),
  entryType: z.enum(["RELEASE_PRACTICAL_COMPLETION", "RELEASE_FINAL", "ADJUSTMENT"]),
  amount: z.coerce.number().finite().min(0.01),
  description: z.string().optional().or(z.literal("")).default(""),
});

export async function createRetentionReleaseAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const parsed = releaseSchema.safeParse({
    projectId,
    contractId: formData.get("contractId"),
    entryType: formData.get("entryType"),
    amount: formData.get("amount"),
    description: formData.get("description"),
  });
  if (!parsed.success) throw new Error("Invalid retention release input.");

  const { userId } = await requirePermission({ permission: Permission.INVOICE_WRITE, projectId });
  const user = await requireUser();

  await createRetentionRelease({
    projectId,
    contractId: parsed.data.contractId || null,
    entryType: parsed.data.entryType as Exclude<RetentionEntryType, "DEDUCTION">,
    amount: parsed.data.amount,
    description: parsed.data.description || null,
    actorUserId: userId,
    actorName: user.name ?? null,
    actorEmail: user.email,
    enforceDlpFinalRelease: parsed.data.entryType === "RELEASE_FINAL",
  });

  revalidatePath(`/projects/${projectId}/retention`);
  redirect(`/projects/${projectId}/retention`);
}

