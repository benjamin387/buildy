import { redirect } from "next/navigation";
import { requireExecutive } from "@/lib/rbac/executive";

export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  await requireExecutive();
  redirect("/settings/company");
}
