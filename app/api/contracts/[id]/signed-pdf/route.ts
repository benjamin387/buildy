import { requireUser } from "@/lib/auth/session";
import { downloadSignedContractPdf } from "@/lib/contracts/signature-engine";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireUser();

  const { id } = await ctx.params;
  const pdf = await downloadSignedContractPdf({ contractId: id });
  const body = Buffer.from(pdf.bytes);

  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
