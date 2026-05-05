import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await ctx.params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        contractSignatures: { orderBy: [{ signedAt: "desc" }] },
      },
    });

    if (!contract) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const signedCount = contract.contractSignatures.filter((s) => s.status === "SIGNED").length;

    return NextResponse.json({
      success: true,
      data: {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        contractStatus: contract.status,
        signatures: contract.contractSignatures,
        signedCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch status.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
