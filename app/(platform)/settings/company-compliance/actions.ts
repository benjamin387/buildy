"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { upsertCompanyComplianceProfile } from "@/lib/bidding/compliance-service";

function toDateOrNull(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

const schema = z.object({
  companyName: z.string().min(1),
  legalName: z.string().optional().or(z.literal("")).default(""),
  uen: z.string().optional().or(z.literal("")).default(""),
  gstRegistered: z.string().optional(),
  gstNumber: z.string().optional().or(z.literal("")).default(""),
  bcaRegistration: z.string().optional().or(z.literal("")).default(""),
  bcaExpiryDate: z.string().optional().or(z.literal("")).default(""),
  bizsafeStatus: z.string().optional().or(z.literal("")).default(""),
  bizsafeExpiryDate: z.string().optional().or(z.literal("")).default(""),
  notes: z.string().optional().or(z.literal("")).default(""),
});

export async function saveCompanyComplianceProfileAction(formData: FormData) {
  await requirePermission({ permission: Permission.SETTINGS_WRITE });
  const user = await requireUser();

  const parsed = schema.safeParse({
    companyName: formData.get("companyName"),
    legalName: formData.get("legalName"),
    uen: formData.get("uen"),
    gstRegistered: formData.get("gstRegistered"),
    gstNumber: formData.get("gstNumber"),
    bcaRegistration: formData.get("bcaRegistration"),
    bcaExpiryDate: formData.get("bcaExpiryDate"),
    bizsafeStatus: formData.get("bizsafeStatus"),
    bizsafeExpiryDate: formData.get("bizsafeExpiryDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) throw new Error("Invalid profile.");

  await upsertCompanyComplianceProfile({
    companyName: parsed.data.companyName,
    legalName: parsed.data.legalName.trim() || null,
    uen: parsed.data.uen.trim() || null,
    gstRegistered: String(parsed.data.gstRegistered ?? "") === "on",
    gstNumber: parsed.data.gstNumber.trim() || null,
    bcaRegistration: parsed.data.bcaRegistration.trim() || null,
    bcaExpiryDate: toDateOrNull(parsed.data.bcaExpiryDate),
    bizsafeStatus: parsed.data.bizsafeStatus.trim() || null,
    bizsafeExpiryDate: toDateOrNull(parsed.data.bizsafeExpiryDate),
    notes: parsed.data.notes.trim() || null,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath("/settings/company-compliance");
  redirect("/settings/company-compliance");
}

