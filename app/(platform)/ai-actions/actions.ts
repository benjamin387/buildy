"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireExecutive } from "@/lib/rbac/executive";
import { approveAIActionLog, cancelAIActionLog, executeApprovedAIActionLog } from "@/lib/ai/action-runner";

const idSchema = z.object({ id: z.string().min(1) });

export async function approveAIActionAction(formData: FormData) {
  const user = await requireExecutive();
  const parsed = idSchema.parse({ id: String(formData.get("id") ?? "") });

  await approveAIActionLog({ id: parsed.id, approvedBy: user.id, isExec: true });

  revalidatePath("/ai-actions");
  redirect("/ai-actions");
}

export async function cancelAIActionAction(formData: FormData) {
  const user = await requireExecutive();
  const parsed = idSchema.parse({ id: String(formData.get("id") ?? "") });

  await cancelAIActionLog({ id: parsed.id, cancelledBy: user.id });

  revalidatePath("/ai-actions");
  redirect("/ai-actions");
}

export async function executeAIActionAction(formData: FormData) {
  const user = await requireExecutive();
  const parsed = idSchema.parse({ id: String(formData.get("id") ?? "") });

  await executeApprovedAIActionLog({ id: parsed.id, actorUserId: user.id });

  revalidatePath("/ai-actions");
  redirect("/ai-actions");
}

