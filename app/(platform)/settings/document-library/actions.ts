"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Permission, ComplianceDocumentCategory, ComplianceDocumentStatus } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { requireUser } from "@/lib/auth/session";
import { upsertComplianceDocument } from "@/lib/bidding/compliance-service";

function toDateOrNull(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

const schema = z.object({
  id: z.string().optional().or(z.literal("")).default(""),
  title: z.string().min(1),
  category: z.nativeEnum(ComplianceDocumentCategory),
  description: z.string().optional().or(z.literal("")).default(""),
  fileUrl: z.string().optional().or(z.literal("")).default(""),
  issueDate: z.string().optional().or(z.literal("")).default(""),
  expiryDate: z.string().optional().or(z.literal("")).default(""),
  status: z.nativeEnum(ComplianceDocumentStatus).optional(),
});

export async function upsertComplianceDocumentAction(formData: FormData) {
  await requirePermission({ permission: Permission.SETTINGS_WRITE });
  const user = await requireUser();

  const parsed = schema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    category: formData.get("category"),
    description: formData.get("description"),
    fileUrl: formData.get("fileUrl"),
    issueDate: formData.get("issueDate"),
    expiryDate: formData.get("expiryDate"),
    status: formData.get("status") ?? undefined,
  });
  if (!parsed.success) throw new Error("Invalid document.");

  await upsertComplianceDocument({
    id: parsed.data.id.trim() || null,
    title: parsed.data.title,
    category: parsed.data.category,
    description: parsed.data.description.trim() || null,
    fileUrl: parsed.data.fileUrl.trim() || null,
    issueDate: toDateOrNull(parsed.data.issueDate),
    expiryDate: toDateOrNull(parsed.data.expiryDate),
    status: parsed.data.status ?? ComplianceDocumentStatus.ACTIVE,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  revalidatePath("/settings/document-library");
  redirect("/settings/document-library");
}

