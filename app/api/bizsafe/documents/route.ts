import { NextRequest, NextResponse } from "next/server";
import { BizsafeDocumentType } from "@prisma/client";
import { z } from "zod";
import { createBizsafeDocument, listBizsafeDocuments } from "@/lib/bizsafe/service";
import { requireBizsafeEditAccess, requireBizsafeViewAccess } from "@/lib/bizsafe/access";

export const dynamic = "force-dynamic";

const documentSchema = z.object({
  documentType: z.nativeEnum(BizsafeDocumentType),
  title: z.string().trim().min(1).max(200),
  fileUrl: z.string().trim().url().optional().or(z.literal("")).nullable(),
  fileName: z.string().trim().max(200).optional().nullable(),
  remarks: z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  await requireBizsafeViewAccess();
  const documents = await listBizsafeDocuments();
  return NextResponse.json({ ok: true, data: documents });
}

export async function POST(req: NextRequest) {
  const user = await requireBizsafeEditAccess();
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = documentSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const row = await createBizsafeDocument({
    documentType: parsed.data.documentType,
    title: parsed.data.title,
    fileUrl: parsed.data.fileUrl,
    fileName: parsed.data.fileName,
    remarks: parsed.data.remarks,
    uploadedBy: user.name ?? user.email,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.json({ ok: true, data: row }, { status: 201 });
}

