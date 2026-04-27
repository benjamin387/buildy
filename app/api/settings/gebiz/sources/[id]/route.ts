import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { upsertGebizFeedSource, deleteGebizFeedSource } from "@/lib/gebiz/service";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  autoImport: z.boolean().optional(),
  keywordsInclude: z.string().nullable().optional(),
  keywordsExclude: z.string().nullable().optional(),
  minValue: z.number().finite().nullable().optional(),
  defaultOwnerUserId: z.string().nullable().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireExecutive();
  const { id } = await ctx.params;
  const source = await prisma.gebizFeedSource.findUnique({
    where: { id },
    include: {
      defaultOwnerUser: { select: { id: true, name: true, email: true } },
      _count: { select: { importedItems: true, importRuns: true } },
    },
  });
  if (!source) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, source });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireExecutive();
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });

  const existing = await prisma.gebizFeedSource.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  let updated: unknown;
  try {
    updated = await upsertGebizFeedSource({
      id,
      name: parsed.data.name ?? existing.name,
      rssUrl: parsed.data.url ?? existing.rssUrl,
      procurementCategoryName: parsed.data.category === undefined ? existing.procurementCategoryName : parsed.data.category,
      isEnabled: parsed.data.enabled ?? existing.isEnabled,
      autoImport: parsed.data.autoImport ?? existing.autoImport,
      defaultOwnerUserId:
        parsed.data.defaultOwnerUserId === undefined ? existing.defaultOwnerUserId : parsed.data.defaultOwnerUserId,
      minimumEstimatedValue:
        parsed.data.minValue === undefined ? (existing.minimumEstimatedValue ? Number(existing.minimumEstimatedValue) : null) : parsed.data.minValue,
      keywordsInclude: parsed.data.keywordsInclude === undefined ? existing.keywordsInclude : parsed.data.keywordsInclude,
      keywordsExclude: parsed.data.keywordsExclude === undefined ? existing.keywordsExclude : parsed.data.keywordsExclude,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update feed source.";
    return NextResponse.json({ ok: false, error: message.slice(0, 400) }, { status: 400 });
  }

  return NextResponse.json({ ok: true, source: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireExecutive();
  const { id } = await ctx.params;
  await deleteGebizFeedSource(id);
  return NextResponse.json({ ok: true });
}
