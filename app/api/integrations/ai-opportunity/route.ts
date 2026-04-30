import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const token = req.headers.get("authorization");

    if (token !== `Bearer ${process.env.AI_OPS_TOKEN}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    console.log("Incoming AI opportunity:", body);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message });
  }
}