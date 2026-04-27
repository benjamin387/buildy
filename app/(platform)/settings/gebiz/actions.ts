"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireExecutive } from "@/lib/rbac/executive";
import { upsertGebizFeedSource, deleteGebizFeedSource, convertImportedItemToBidOpportunity } from "@/lib/gebiz/service";
import { runGebizRssImport } from "@/lib/gebiz/importer";

const upsertSchema = z.object({
  id: z.string().optional().or(z.literal("")).default(""),
  name: z.string().min(1),
  rssUrl: z.string().min(1),
  procurementCategoryName: z.string().optional().or(z.literal("")).default(""),
  isEnabled: z.string().optional(),
  autoImport: z.string().optional(),
  defaultOwnerUserId: z.string().optional().or(z.literal("")).default(""),
  minimumEstimatedValue: z.coerce.number().optional(),
  keywordsInclude: z.string().optional().or(z.literal("")).default(""),
  keywordsExclude: z.string().optional().or(z.literal("")).default(""),
});

export async function upsertGebizFeedSourceAction(formData: FormData) {
  await requireExecutive();

  const parsed = upsertSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    rssUrl: formData.get("rssUrl"),
    procurementCategoryName: formData.get("procurementCategoryName"),
    isEnabled: formData.get("isEnabled"),
    autoImport: formData.get("autoImport"),
    defaultOwnerUserId: formData.get("defaultOwnerUserId"),
    minimumEstimatedValue: formData.get("minimumEstimatedValue") ?? undefined,
    keywordsInclude: formData.get("keywordsInclude"),
    keywordsExclude: formData.get("keywordsExclude"),
  });
  if (!parsed.success) throw new Error("Invalid input.");

  try {
    await upsertGebizFeedSource({
      id: parsed.data.id || null,
      name: parsed.data.name,
      rssUrl: parsed.data.rssUrl,
      procurementCategoryName: parsed.data.procurementCategoryName || null,
      isEnabled: String(parsed.data.isEnabled ?? "") === "on",
      autoImport: String(parsed.data.autoImport ?? "") === "on",
      defaultOwnerUserId: parsed.data.defaultOwnerUserId || null,
      minimumEstimatedValue: parsed.data.minimumEstimatedValue ?? null,
      keywordsInclude: parsed.data.keywordsInclude || null,
      keywordsExclude: parsed.data.keywordsExclude || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save feed source.";
    redirect(`/settings/gebiz?error=${encodeURIComponent(msg.slice(0, 180))}`);
  }

  revalidatePath("/settings/gebiz");
  redirect("/settings/gebiz?notice=Saved");
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteGebizFeedSourceAction(formData: FormData) {
  await requireExecutive();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) throw new Error("Invalid request.");
  try {
    await deleteGebizFeedSource(parsed.data.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete feed source.";
    redirect(`/settings/gebiz?error=${encodeURIComponent(msg.slice(0, 180))}`);
  }
  revalidatePath("/settings/gebiz");
  redirect("/settings/gebiz?notice=Deleted");
}

export async function runGebizImportNowAction() {
  await requireExecutive();
  try {
    await runGebizRssImport({ dryRun: false, limitPerSource: 120 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed.";
    redirect(`/settings/gebiz?error=${encodeURIComponent(msg.slice(0, 180))}`);
  }
  revalidatePath("/settings/gebiz");
  redirect("/settings/gebiz?notice=Import+completed");
}

const convertSchema = z.object({ importedItemId: z.string().min(1) });

export async function convertGebizImportedItemAction(formData: FormData) {
  await requireExecutive();
  const parsed = convertSchema.safeParse({ importedItemId: formData.get("importedItemId") });
  if (!parsed.success) throw new Error("Invalid request.");

  const res = await convertImportedItemToBidOpportunity(parsed.data.importedItemId);
  revalidatePath("/settings/gebiz");
  redirect(`/bidding/${res.bidOpportunityId}`);
}
