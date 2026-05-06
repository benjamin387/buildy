"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function createFloorPlanUpload(formData: FormData) {
  const projectName = String(formData.get("projectName") ?? "").trim();
  const fileValue = formData.get("floorPlanFile");
  const fileName = fileValue instanceof File ? fileValue.name.trim() : "";

  if (!projectName && !fileName) {
    redirect(
      `/design-ai/floor-plans/new?error=${encodeURIComponent(
        "Add a project name or choose a floor plan file before saving.",
      )}`,
    );
  }

  const name = projectName || stripFileExtension(fileName) || "Untitled Floor Plan";
  const storedFileName = fileName || `${name}.pdf`;
  const created = await prisma.floorPlanUpload.create({
    data: {
      name,
      fileUrl: `upload://${encodeURIComponent(storedFileName)}`,
    },
  });

  revalidatePath("/design-ai/floor-plans");
  redirect(`/design-ai/floor-plans/${created.id}`);
}

function stripFileExtension(value: string) {
  return value.replace(/\.[^.]+$/, "");
}
