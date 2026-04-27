import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionModuleKey } from "@/lib/auth/permission-keys";
import { buildSubmissionPackZip } from "@/lib/bidding/submission-pack-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ packId: string }> }) {
  await requirePermission({ moduleKey: "BIDDING" satisfies PermissionModuleKey, action: "export" });
  const { packId } = await ctx.params;

  try {
    const { filename, zip } = await buildSubmissionPackZip(packId);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Failed to export ZIP.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
