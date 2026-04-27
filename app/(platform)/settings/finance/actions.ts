"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { revalidatePath } from "next/cache";

const Schema = z.object({
  gstRegistered: z.string().optional().or(z.literal("")).default(""),
  gstRatePercent: z.string().optional().or(z.literal("")).default(""),
  defaultPaymentTerms: z.string().trim().optional().or(z.literal("")).default(""),
  paymentInstructions: z.string().trim().optional().or(z.literal("")).default(""),
  bankName: z.string().trim().optional().or(z.literal("")).default(""),
  bankAccountName: z.string().trim().optional().or(z.literal("")).default(""),
  bankAccountNumber: z.string().trim().optional().or(z.literal("")).default(""),
  paynowUen: z.string().trim().optional().or(z.literal("")).default(""),
});

function clampRateDecimalFromPercent(input: string): Prisma.Decimal {
  const raw = Number(String(input ?? "").trim());
  if (!Number.isFinite(raw) || raw < 0) return new Prisma.Decimal("0");
  const pct = Math.min(raw, 100);
  const dec = pct / 100;
  return new Prisma.Decimal(dec.toFixed(4));
}

export async function updateFinanceSettingsAction(formData: FormData) {
  await requireExecutive();

  const parsed = Schema.safeParse({
    gstRegistered: formData.get("gstRegistered") ?? "",
    gstRatePercent: formData.get("gstRatePercent") ?? "",
    defaultPaymentTerms: formData.get("defaultPaymentTerms") ?? "",
    paymentInstructions: formData.get("paymentInstructions") ?? "",
    bankName: formData.get("bankName") ?? "",
    bankAccountName: formData.get("bankAccountName") ?? "",
    bankAccountNumber: formData.get("bankAccountNumber") ?? "",
    paynowUen: formData.get("paynowUen") ?? "",
  });
  if (!parsed.success) throw new Error("Invalid finance settings input.");

  const v = parsed.data;
  const gstRate = clampRateDecimalFromPercent(v.gstRatePercent);

  await prisma.companySetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      gstRegistered: v.gstRegistered === "on",
      gstRate,
      defaultPaymentTerms: v.defaultPaymentTerms.trim() ? v.defaultPaymentTerms.trim() : null,
      paymentInstructions: v.paymentInstructions.trim() ? v.paymentInstructions.trim() : null,
      bankName: v.bankName.trim() ? v.bankName.trim() : null,
      bankAccountName: v.bankAccountName.trim() ? v.bankAccountName.trim() : null,
      bankAccountNumber: v.bankAccountNumber.trim() ? v.bankAccountNumber.trim() : null,
      paynowUen: v.paynowUen.trim() ? v.paynowUen.trim() : null,
    },
    update: {
      gstRegistered: v.gstRegistered === "on",
      gstRate,
      defaultPaymentTerms: v.defaultPaymentTerms.trim() ? v.defaultPaymentTerms.trim() : null,
      paymentInstructions: v.paymentInstructions.trim() ? v.paymentInstructions.trim() : null,
      bankName: v.bankName.trim() ? v.bankName.trim() : null,
      bankAccountName: v.bankAccountName.trim() ? v.bankAccountName.trim() : null,
      bankAccountNumber: v.bankAccountNumber.trim() ? v.bankAccountNumber.trim() : null,
      paynowUen: v.paynowUen.trim() ? v.paynowUen.trim() : null,
    },
  });

  revalidatePath("/settings/finance");
  revalidatePath("/settings/company");
  revalidatePath("/settings");
}

