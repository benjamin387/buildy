"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TemplateCategory } from "@prisma/client";
import { requireExecutive } from "@/lib/rbac/executive";
import { upsertTemplateLibraryItem, setTemplateLibraryItemActive } from "@/lib/templates/service";

const UpsertSchema = z.object({
  id: z.string().optional().or(z.literal("")).default(""),
  category: z.nativeEnum(TemplateCategory),
  code: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().optional().or(z.literal("")).default(""),
  content: z.string().min(1),
  variablesJson: z.string().trim().optional().or(z.literal("")).default(""),
  isActive: z.string().optional().or(z.literal("")).default(""),
});

function parseJsonOrNull(input: string): any {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid variables JSON.");
  }
}

export async function upsertTemplateLibraryItemAction(formData: FormData) {
  await requireExecutive();

  const parsed = UpsertSchema.safeParse({
    id: formData.get("id") ?? "",
    category: formData.get("category"),
    code: formData.get("code"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    content: formData.get("content"),
    variablesJson: formData.get("variablesJson") ?? "",
    isActive: formData.get("isActive") ?? "",
  });
  if (!parsed.success) throw new Error("Invalid template input.");

  const v = parsed.data;
  const row = await upsertTemplateLibraryItem({
    id: v.id.trim() ? v.id.trim() : null,
    category: v.category,
    code: v.code,
    title: v.title,
    description: v.description.trim() ? v.description.trim() : null,
    content: v.content,
    variablesJson: parseJsonOrNull(v.variablesJson),
    isActive: v.isActive === "on",
  });

  revalidatePath("/templates");
  revalidatePath(`/templates/${row.id}`);
  redirect(`/templates/${row.id}`);
}

const ToggleSchema = z.object({
  id: z.string().min(1),
  isActive: z.enum(["true", "false"]),
});

export async function toggleTemplateActiveAction(formData: FormData) {
  await requireExecutive();

  const parsed = ToggleSchema.safeParse({
    id: formData.get("id"),
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) throw new Error("Invalid request.");

  await setTemplateLibraryItemActive({
    id: parsed.data.id,
    isActive: parsed.data.isActive === "true",
  });

  revalidatePath("/templates");
  revalidatePath(`/templates/${parsed.data.id}`);
}

