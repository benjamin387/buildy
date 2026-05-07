import "server-only";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const LOGO_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "logos");
const LOGO_URL_PREFIX = "/uploads/logos/";

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function deletePreviousLogo(previousLogoUrl: string | null | undefined) {
  if (!previousLogoUrl?.startsWith(LOGO_URL_PREFIX)) return;

  const fileName = path.basename(previousLogoUrl);
  if (!fileName) return;

  try {
    await unlink(path.join(LOGO_UPLOAD_DIR, fileName));
  } catch {
    // Ignore missing files so uploads can self-heal stale paths.
  }
}

export async function saveCompanyLogoUpload(params: {
  file: File;
  companyName: string;
  previousLogoUrl?: string | null;
}) {
  const extension = ALLOWED_LOGO_TYPES[params.file.type];
  if (!extension) {
    throw new Error("Logo must be a PNG, JPG, or WebP image.");
  }

  if (params.file.size <= 0) {
    throw new Error("Uploaded logo file is empty.");
  }

  const fileSlug = toSlug(params.companyName) || "company";
  const fileName = `${fileSlug}-logo-${Date.now()}${extension}`;
  const nextLogoUrl = `${LOGO_URL_PREFIX}${fileName}`;
  const filePath = path.join(LOGO_UPLOAD_DIR, fileName);
  const buffer = Buffer.from(await params.file.arrayBuffer());

  await mkdir(LOGO_UPLOAD_DIR, { recursive: true });
  await writeFile(filePath, buffer);
  await deletePreviousLogo(params.previousLogoUrl);

  return nextLogoUrl;
}

export async function deleteCompanyLogoUpload(logoUrl: string | null | undefined) {
  await deletePreviousLogo(logoUrl);
}
