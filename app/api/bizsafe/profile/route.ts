import { NextRequest, NextResponse } from "next/server";
import { BizsafeApplicationStatus, BizsafeLevel } from "@prisma/client";
import { z } from "zod";
import { requireBizsafeEditAccess, requireBizsafeViewAccess } from "@/lib/bizsafe/access";
import { getOrCreateBizsafeProfile, upsertBizsafeProfile } from "@/lib/bizsafe/service";

export const dynamic = "force-dynamic";

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

const profileSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  uen: z.string().trim().max(40).optional().nullable(),
  currentLevel: z.nativeEnum(BizsafeLevel),
  certificateNumber: z.string().trim().max(120).optional().nullable(),
  approvalDate: z.string().optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  status: z.nativeEnum(BizsafeApplicationStatus),
  seniorManagementName: z.string().trim().max(160).optional().nullable(),
  seniorManagementEmail: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  seniorManagementPhone: z.string().trim().max(40).optional().nullable(),
  rmChampionName: z.string().trim().max(160).optional().nullable(),
  rmChampionEmail: z.string().trim().email().max(160).optional().or(z.literal("")).nullable(),
  rmChampionPhone: z.string().trim().max(40).optional().nullable(),
  auditorName: z.string().trim().max(160).optional().nullable(),
  auditCompany: z.string().trim().max(160).optional().nullable(),
  auditDate: z.string().optional().nullable(),
  auditReportExpiryDate: z.string().optional().nullable(),
  remarks: z.string().trim().max(4000).optional().nullable(),
});

export async function GET() {
  await requireBizsafeViewAccess();
  const profile = await getOrCreateBizsafeProfile();
  return NextResponse.json({ ok: true, data: profile });
}

export async function POST(req: NextRequest) {
  const user = await requireBizsafeEditAccess();
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = profileSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const row = await upsertBizsafeProfile({
    companyName: parsed.data.companyName,
    uen: parsed.data.uen,
    currentLevel: parsed.data.currentLevel,
    certificateNumber: parsed.data.certificateNumber,
    approvalDate: toDateOrNull(parsed.data.approvalDate),
    issueDate: toDateOrNull(parsed.data.issueDate),
    expiryDate: toDateOrNull(parsed.data.expiryDate),
    status: parsed.data.status,
    seniorManagementName: parsed.data.seniorManagementName,
    seniorManagementEmail: parsed.data.seniorManagementEmail,
    seniorManagementPhone: parsed.data.seniorManagementPhone,
    rmChampionName: parsed.data.rmChampionName,
    rmChampionEmail: parsed.data.rmChampionEmail,
    rmChampionPhone: parsed.data.rmChampionPhone,
    auditorName: parsed.data.auditorName,
    auditCompany: parsed.data.auditCompany,
    auditDate: toDateOrNull(parsed.data.auditDate),
    auditReportExpiryDate: toDateOrNull(parsed.data.auditReportExpiryDate),
    remarks: parsed.data.remarks,
    actor: { name: user.name, email: user.email, role: user.primaryRoleLabel },
  });

  return NextResponse.json({ ok: true, data: row });
}

