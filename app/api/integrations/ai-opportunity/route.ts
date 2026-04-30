import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization");

    if (token !== `Bearer ${process.env.AI_OPS_TOKEN}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const {
      title,
      agency,
      category,
      closingDate,
      sourceUrl,
      description,
      score,
      opportunityId,
    } = body;

    // 🔁 Dedup check (VERY IMPORTANT)
    const existing = await prisma.project.findFirst({
      where: {
        OR: [
          { name: title },
          { notes: { contains: sourceUrl } },
        ],
      },
    });

    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        projectId: existing.id,
      });
    }

    // 🚀 Create project
    const project = await prisma.project.create({
      data: {
        name: title,
        description: `${description}\n\nSource: ${sourceUrl}\nAI Score: ${score}`,
        status: "NEW", // adjust if your enum differs
        // Optional fields (safe fallback)
        clientName: agency ?? "Unknown",
        category: category ?? "General",
      } as any, // safe cast for flexibility
    });

    console.log("AI opportunity converted to project:", project.id);

    return NextResponse.json({
      ok: true,
      created: true,
      projectId: project.id,
    });

  } catch (err: any) {
    console.error("AI opportunity error:", err);

    return NextResponse.json({
      ok: false,
      error: err.message,
    });
  }
}