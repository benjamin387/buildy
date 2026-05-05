import { NextResponse } from "next/server";
import { z } from "zod";
import { createContractSignature } from "@/lib/contracts/signature-engine";

const schema = z.object({
  token: z.string().min(20),
  signerName: z.string().min(1).max(160),
  signerEmail: z.string().email(),
  signerPhone: z.string().max(40).optional().nullable(),
  signatureDataUrl: z.string().min(32),
  acceptedTerms: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = schema.parse(body);
    await createContractSignature(input);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sign contract.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
