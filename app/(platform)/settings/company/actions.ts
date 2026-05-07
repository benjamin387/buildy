"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { revalidatePath } from "next/cache";
import { deleteCompanyLogoUpload, saveCompanyLogoUpload } from "@/lib/settings/company-logo-upload";

const Schema = z.object({
  companyName: z.string().trim().min(1),
  legalName: z.string().trim().optional(),
  uen: z.string().trim().optional(),
  brandColor: z.string().trim().min(1),
  accentColor: z.string().trim().min(1),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(3),
  website: z.string().trim().min(1),
  registeredAddress: z.string().trim().optional(),
  companyIntro: z.string().trim().min(1),
  portfolioSummary: z.string().trim().min(1),
  whyChooseUsText: z.string().trim().optional(),
});

export async function updateCompanyProfileAction(formData: FormData) {
  await requireExecutive();

  const parsed = Schema.safeParse({
    companyName: formData.get("companyName"),
    legalName: formData.get("legalName"),
    uen: formData.get("uen"),
    brandColor: formData.get("brandColor"),
    accentColor: formData.get("accentColor"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    website: formData.get("website"),
    registeredAddress: formData.get("registeredAddress"),
    companyIntro: formData.get("companyIntro"),
    portfolioSummary: formData.get("portfolioSummary"),
    whyChooseUsText: formData.get("whyChooseUsText"),
  });
  if (!parsed.success) {
    throw new Error("Invalid company profile input.");
  }

  const v = parsed.data;
  const existing = await prisma.companySetting.findUnique({
    where: { id: "default" },
    select: { logoUrl: true },
  });
  const logoFile = formData.get("logoFile");
  const removeLogo = formData.get("removeLogo") === "1";
  let nextLogoUrl = existing?.logoUrl ?? null;

  if (removeLogo) {
    await deleteCompanyLogoUpload(existing?.logoUrl);
    nextLogoUrl = null;
  }

  if (logoFile instanceof File && logoFile.size > 0) {
    nextLogoUrl = await saveCompanyLogoUpload({
      file: logoFile,
      companyName: v.companyName,
      previousLogoUrl: existing?.logoUrl ?? null,
    });
  }

  await prisma.companySetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      companyName: v.companyName,
      legalName: v.legalName?.trim() ? v.legalName.trim() : null,
      uen: v.uen?.trim() ? v.uen.trim() : null,
      logoUrl: nextLogoUrl,
      brandColor: v.brandColor,
      accentColor: v.accentColor,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      website: v.website,
      registeredAddress: v.registeredAddress?.trim() ? v.registeredAddress.trim() : null,
      companyIntro: v.companyIntro,
      portfolioSummary: v.portfolioSummary,
      whyChooseUsText: v.whyChooseUsText?.trim() ? v.whyChooseUsText.trim() : null,
    },
    update: {
      companyName: v.companyName,
      legalName: v.legalName?.trim() ? v.legalName.trim() : null,
      uen: v.uen?.trim() ? v.uen.trim() : null,
      logoUrl: nextLogoUrl,
      brandColor: v.brandColor,
      accentColor: v.accentColor,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      website: v.website,
      registeredAddress: v.registeredAddress?.trim() ? v.registeredAddress.trim() : null,
      companyIntro: v.companyIntro,
      portfolioSummary: v.portfolioSummary,
      whyChooseUsText: v.whyChooseUsText?.trim() ? v.whyChooseUsText.trim() : null,
    },
  });

  revalidatePath("/settings/company");
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/client/portal", "layout");
  revalidatePath("/share/proposal/[token]", "page");
  revalidatePath("/public/documents/[token]", "page");
}
