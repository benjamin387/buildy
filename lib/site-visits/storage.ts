import "server-only";

import path from "node:path";
import fs from "node:fs/promises";

export type StoredFile = {
  fileUrl: string;
  fileName: string;
};

function safeFileName(input: string): string {
  const base = input.replaceAll(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 0 ? base.slice(0, 120) : "file";
}

function uploadsRootDir(): string {
  // Default to public/uploads for local development. For production, swap this implementation
  // to S3/R2 and keep the interface stable.
  return process.env.UPLOADS_LOCAL_DIR?.trim() || path.join(process.cwd(), "public", "uploads");
}

export async function storeSiteVisitPhoto(params: {
  siteVisitId: string;
  file: File;
}): Promise<StoredFile> {
  const file = params.file;
  const size = file.size ?? 0;
  if (size <= 0) throw new Error("Empty file.");
  if (size > 10 * 1024 * 1024) throw new Error("File too large (max 10MB).");

  const mime = file.type || "";
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(mime)) throw new Error("Unsupported file type.");

  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "bin";

  const originalName = safeFileName(file.name || `photo.${ext}`);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `${stamp}_${rand}_${originalName}`.replaceAll(/\.+/g, ".");

  const dir = path.join(uploadsRootDir(), "site-visits", params.siteVisitId);
  await fs.mkdir(dir, { recursive: true });

  const target = path.join(dir, fileName);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target, buf);

  // Map to public URL path. This assumes uploadsRootDir() points inside /public/uploads by default.
  const fileUrl = `/uploads/site-visits/${params.siteVisitId}/${encodeURIComponent(fileName)}`;

  return { fileUrl, fileName };
}

