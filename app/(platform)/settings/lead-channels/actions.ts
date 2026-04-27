"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { normalizePhoneNumber } from "@/lib/validation/phone";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const schema = z.object({
  mobileNumber: z.string().optional().or(z.literal("")).default(""),
  whatsappNumber: z.string().optional().or(z.literal("")).default(""),
  telegramChatId: z.string().optional().or(z.literal("")).default(""),
  canSubmitLeads: z.string().optional().or(z.literal("")).default(""),
});

export async function updateLeadChannelsAction(formData: FormData) {
  const user = await requireUser();

  const parsed = schema.safeParse({
    mobileNumber: formData.get("mobileNumber"),
    whatsappNumber: formData.get("whatsappNumber"),
    telegramChatId: formData.get("telegramChatId"),
    canSubmitLeads: formData.get("canSubmitLeads"),
  });
  if (!parsed.success) throw new Error("Invalid input.");

  const mobileNumber = normalizePhoneNumber(parsed.data.mobileNumber) ?? null;
  const whatsappNumber = normalizePhoneNumber(parsed.data.whatsappNumber) ?? null;
  const telegramChatId = parsed.data.telegramChatId.trim() || null;
  const canSubmitLeads = parsed.data.canSubmitLeads === "on" || parsed.data.canSubmitLeads === "true";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mobileNumber,
      whatsappNumber,
      telegramChatId,
      canSubmitLeads,
    },
  });

  revalidatePath("/settings/lead-channels");
  redirect("/settings/lead-channels");
}

