"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { revalidatePath } from "next/cache";

const Schema = z.object({
  themeName: z.string().trim().min(1).max(120),
  coverStyle: z.enum(["EDITORIAL_HERO", "MINIMAL"]),
  fontStyle: z.enum(["SERIF_HEADINGS", "SANS_SERIF"]),
  primaryColor: z.string().trim().min(1).max(32),
  secondaryColor: z.string().trim().min(1).max(32),
  showCompanyIntro: z.string().optional().or(z.literal("")).default(""),
  showPortfolio: z.string().optional().or(z.literal("")).default(""),
  showWhyChooseUs: z.string().optional().or(z.literal("")).default(""),
  showNextSteps: z.string().optional().or(z.literal("")).default(""),
});

export async function updateProposalThemeAction(formData: FormData) {
  await requireExecutive();

  const parsed = Schema.safeParse({
    themeName: formData.get("themeName"),
    coverStyle: formData.get("coverStyle"),
    fontStyle: formData.get("fontStyle"),
    primaryColor: formData.get("primaryColor"),
    secondaryColor: formData.get("secondaryColor"),
    showCompanyIntro: formData.get("showCompanyIntro") ?? "",
    showPortfolio: formData.get("showPortfolio") ?? "",
    showWhyChooseUs: formData.get("showWhyChooseUs") ?? "",
    showNextSteps: formData.get("showNextSteps") ?? "",
  });
  if (!parsed.success) throw new Error("Invalid proposal theme input.");

  const v = parsed.data;
  await prisma.proposalThemeSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      themeName: v.themeName,
      coverStyle: v.coverStyle,
      fontStyle: v.fontStyle,
      primaryColor: v.primaryColor,
      secondaryColor: v.secondaryColor,
      showCompanyIntro: v.showCompanyIntro === "on",
      showPortfolio: v.showPortfolio === "on",
      showWhyChooseUs: v.showWhyChooseUs === "on",
      showNextSteps: v.showNextSteps === "on",
    },
    update: {
      themeName: v.themeName,
      coverStyle: v.coverStyle,
      fontStyle: v.fontStyle,
      primaryColor: v.primaryColor,
      secondaryColor: v.secondaryColor,
      showCompanyIntro: v.showCompanyIntro === "on",
      showPortfolio: v.showPortfolio === "on",
      showWhyChooseUs: v.showWhyChooseUs === "on",
      showNextSteps: v.showNextSteps === "on",
    },
  });

  revalidatePath("/settings/proposal");
  revalidatePath("/settings/company");
  revalidatePath("/settings");
}

