"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { revalidatePath } from "next/cache";

const Schema = z.object({
  emailFromName: z.string().trim().optional().or(z.literal("")).default(""),
  emailFromAddress: z.string().trim().optional().or(z.literal("")).default(""),
  whatsappSenderLabel: z.string().trim().optional().or(z.literal("")).default(""),
  defaultReplyToEmail: z.string().trim().optional().or(z.literal("")).default(""),
  defaultSalesPhone: z.string().trim().optional().or(z.literal("")).default(""),
});

export async function updateNotificationSettingsAction(formData: FormData) {
  await requireExecutive();

  const parsed = Schema.safeParse({
    emailFromName: formData.get("emailFromName") ?? "",
    emailFromAddress: formData.get("emailFromAddress") ?? "",
    whatsappSenderLabel: formData.get("whatsappSenderLabel") ?? "",
    defaultReplyToEmail: formData.get("defaultReplyToEmail") ?? "",
    defaultSalesPhone: formData.get("defaultSalesPhone") ?? "",
  });
  if (!parsed.success) throw new Error("Invalid notification settings input.");

  const v = parsed.data;

  await prisma.notificationSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      emailFromName: v.emailFromName.trim() ? v.emailFromName.trim() : null,
      emailFromAddress: v.emailFromAddress.trim() ? v.emailFromAddress.trim() : null,
      whatsappSenderLabel: v.whatsappSenderLabel.trim() ? v.whatsappSenderLabel.trim() : null,
      defaultReplyToEmail: v.defaultReplyToEmail.trim() ? v.defaultReplyToEmail.trim() : null,
      defaultSalesPhone: v.defaultSalesPhone.trim() ? v.defaultSalesPhone.trim() : null,
    },
    update: {
      emailFromName: v.emailFromName.trim() ? v.emailFromName.trim() : null,
      emailFromAddress: v.emailFromAddress.trim() ? v.emailFromAddress.trim() : null,
      whatsappSenderLabel: v.whatsappSenderLabel.trim() ? v.whatsappSenderLabel.trim() : null,
      defaultReplyToEmail: v.defaultReplyToEmail.trim() ? v.defaultReplyToEmail.trim() : null,
      defaultSalesPhone: v.defaultSalesPhone.trim() ? v.defaultSalesPhone.trim() : null,
    },
  });

  revalidatePath("/settings/notifications");
  revalidatePath("/settings");
}

