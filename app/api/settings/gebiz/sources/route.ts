import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { upsertGebizFeedSource } from "@/lib/gebiz/service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  category: z.string().optional().nullable(),
  enabled: z.boolean().optional().default(true),
  autoImport: z.boolean().optional().default(true),
  keywordsInclude: z.string().optional().nullable(),
  keywordsExclude: z.string().optional().nullable(),
  minValue: z.number().finite().optional().nullable(),
  defaultOwnerUserId: z.string().optional().nullable(),
});

export async function GET() {
  await requireExecutive();
  const sources = await prisma.gebizFeedSource.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      defaultOwnerUser: { select: { id: true, name: true, email: true } },
      _count: { select: { importedItems: true, importRuns: true } },
    },
  });

  return NextResponse.json({ ok: true, sources });
}

export async function POST(req: Request) {
  await requireExecutive();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });

  let created: unknown;
  try {
    created = await upsertGebizFeedSource({
      id: null,
      name: parsed.data.name,
      rssUrl: parsed.data.url,
      procurementCategoryName: parsed.data.category ?? null,
      isEnabled: Boolean(parsed.data.enabled),
      autoImport: Boolean(parsed.data.autoImport),
      defaultOwnerUserId: parsed.data.defaultOwnerUserId ?? null,
      minimumEstimatedValue: parsed.data.minValue ?? null,
      keywordsInclude: parsed.data.keywordsInclude ?? null,
      keywordsExclude: parsed.data.keywordsExclude ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save feed source.";
    return NextResponse.json({ ok: false, error: message.slice(0, 400) }, { status: 400 });
  }

  return NextResponse.json({ ok: true, source: created });
}
