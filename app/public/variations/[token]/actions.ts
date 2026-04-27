"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { upsertApprovalDecisionByToken } from "@/lib/variation-orders/service";

const decisionSchema = z.object({
  token: z.string().min(20),
  approverName: z.string().min(1),
  approverEmail: z.string().email(),
  remarks: z.string().optional().or(z.literal("")).default(""),
});

export async function approveVariationPublicAction(formData: FormData) {
  const parsed = decisionSchema.safeParse({
    token: formData.get("token"),
    approverName: formData.get("approverName"),
    approverEmail: formData.get("approverEmail"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid approval request.");

  await upsertApprovalDecisionByToken({
    token: parsed.data.token,
    decision: "APPROVE",
    approverName: parsed.data.approverName,
    approverEmail: parsed.data.approverEmail,
    remarks: parsed.data.remarks || null,
  });

  redirect(`/public/variations/${parsed.data.token}?result=approved`);
}

export async function rejectVariationPublicAction(formData: FormData) {
  const parsed = decisionSchema.safeParse({
    token: formData.get("token"),
    approverName: formData.get("approverName"),
    approverEmail: formData.get("approverEmail"),
    remarks: formData.get("remarks"),
  });
  if (!parsed.success) throw new Error("Invalid rejection request.");

  await upsertApprovalDecisionByToken({
    token: parsed.data.token,
    decision: "REJECT",
    approverName: parsed.data.approverName,
    approverEmail: parsed.data.approverEmail,
    remarks: parsed.data.remarks || null,
  });

  redirect(`/public/variations/${parsed.data.token}?result=rejected`);
}

