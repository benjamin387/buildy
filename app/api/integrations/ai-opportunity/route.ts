import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization");

    if (token !== `Bearer ${process.env.AI_OPS_TOKEN}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
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
    } = body;

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "Missing title" },
        { status: 400 },
      );
    }

    const existing = await prisma.project.findFirst({
      where: {
        name: title,
      },
    });

    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        projectId: existing.id,
      });
    }

    const clientName = agency ?? "Unknown AI Opportunity Client";

    const project = await prisma.project.create({
      data: {
        name: title,
        notes: `${description ?? ""}\n\nSource: ${
          sourceUrl ?? "N/A"
        }\nAI Score: ${score ?? "N/A"}\nCategory: ${category ?? "General"}\nClosing: ${
          closingDate ?? "N/A"
        }`,
        status: "LEAD",
        clientName,
        propertyType: "COMMERCIAL",
        addressLine1: "Auto-generated from AI opportunity",
        client: {
          connectOrCreate: {
            where: {
              name: clientName,
            },
            create: {
              name: clientName,
              email: "ai-opportunity@buildy.sg",
              phone: "N/A",
            },
          },
        },
      } as any,
    });

    console.log("AI opportunity converted to project:", project.id);

    return NextResponse.json({
      ok: true,
      created: true,
      projectId: project.id,
    });
  } catch (err: any) {
    console.error("AI opportunity error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Unknown error",
      },
      { status: 500 },
    );
  }
}