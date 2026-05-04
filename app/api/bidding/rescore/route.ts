import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeTenderFitScoreLight, deriveTenderFitLabel } from "@/lib/bidding/intelligence";

export const dynamic = "force-dynamic";

function validateBearerToken(request: Request): NextResponse | null {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Missing CRON_SECRET" },
      { status: 500 },
    );
  }

  const authHeader = (request.headers.get("authorization") ?? "").trim();
  const provided = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";

  if (!provided || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}

async function rescore(params: { all: boolean; limit: number }) {
  const where = params.all
    ? {}
    : {
        OR: [
          { fitLabel: "UNKNOWN" as const },
          { fitScore: 0 },
        ],
      };

  const rows = await prisma.bidOpportunity.findMany({
    where,
    take: params.limit,
    select: {
      id: true,
      title: true,
      agency: true,
      category: true,
      procurementType: true,
      estimatedValue: true,
      closingDate: true,
      fitScore: true,
      fitLabel: true,
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  let updated = 0;
  let unchanged = 0;

  for (const r of rows) {
    const score = computeTenderFitScoreLight({
      title: r.title,
      agency: r.agency,
      category: r.category,
      procurementType: String(r.procurementType),
      estimatedValue: r.estimatedValue,
      closingDate: r.closingDate,
    });
    const label = deriveTenderFitLabel(score);

    if (score === r.fitScore && label === r.fitLabel) {
      unchanged += 1;
      continue;
    }

    await prisma.bidOpportunity.update({
      where: { id: r.id },
      data: { fitScore: score, fitLabel: label as any },
    });
    updated += 1;
  }

  return { scanned: rows.length, updated, unchanged };
}

export async function POST(request: NextRequest) {
  const unauthorized = validateBearerToken(request);
  if (unauthorized) return unauthorized;

  try {
    const sp = request.nextUrl.searchParams;
    const all = sp.get("all") === "1" || sp.get("all") === "true";
    const limitRaw = Number(sp.get("limit") ?? "");
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 5000)
        : 1000;

    const result = await rescore({ all, limit });

    return NextResponse.json({
      ok: true,
      mode: all ? "all" : "unknownOrZero",
      limit,
      ...result,
    });
  } catch (err) {
    console.error("[api/bidding/rescore] failed:", err);
    return NextResponse.json(
      {
        ok: false,
        scanned: 0,
        updated: 0,
        error: err instanceof Error ? err.message : "Rescore failed.",
      },
      { status: 500 },
    );
  }
}
