import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireExecutive } from "@/lib/rbac/executive";
import { AuditAction, AuditSource } from "@prisma/client";

function toSingle(v: string | string[] | undefined): string | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function csvEscape(value: string): string {
  const needs = value.includes(",") || value.includes("\"") || value.includes("\n") || value.includes("\r");
  const escaped = value.replaceAll("\"", "\"\"");
  return needs ? `"${escaped}"` : escaped;
}

export async function GET(request: Request) {
  await requireExecutive();

  const url = new URL(request.url);
  const entityType = (toSingle(url.searchParams.getAll("entityType")[0]) ?? "").trim();
  const entityId = (toSingle(url.searchParams.getAll("entityId")[0]) ?? "").trim();
  const actorEmail = (toSingle(url.searchParams.getAll("actorEmail")[0]) ?? "").trim();
  const actionRaw = (toSingle(url.searchParams.getAll("action")[0]) ?? "").trim();
  const sourceRaw = (toSingle(url.searchParams.getAll("source")[0]) ?? "").trim();
  const q = (toSingle(url.searchParams.getAll("q")[0]) ?? "").trim();

  const action =
    actionRaw && Object.values(AuditAction).includes(actionRaw as any)
      ? (actionRaw as AuditAction)
      : null;
  const source =
    sourceRaw && Object.values(AuditSource).includes(sourceRaw as any)
      ? (sourceRaw as AuditSource)
      : null;

  const where: any = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actorEmail) where.actorEmail = { contains: actorEmail, mode: "insensitive" };
  if (action) where.action = action;
  if (source) where.source = source;
  if (q) {
    where.OR = [
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { actorName: { contains: q, mode: "insensitive" } },
    ];
  }

  // Safety: cap exports to prevent huge payloads.
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 2000,
    select: {
      createdAt: true,
      action: true,
      source: true,
      entityType: true,
      entityId: true,
      actorName: true,
      actorEmail: true,
      actorRole: true,
      ipAddress: true,
      userAgent: true,
      beforeJson: true,
      afterJson: true,
      metadataJson: true,
    },
  });

  const header = [
    "createdAt",
    "action",
    "source",
    "entityType",
    "entityId",
    "actorName",
    "actorEmail",
    "actorRole",
    "ipAddress",
    "userAgent",
    "beforeJson",
    "afterJson",
    "metadataJson",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.action,
        r.source,
        r.entityType,
        r.entityId,
        r.actorName ?? "",
        r.actorEmail ?? "",
        r.actorRole ?? "",
        r.ipAddress ?? "",
        r.userAgent ?? "",
        JSON.stringify(r.beforeJson ?? null),
        JSON.stringify(r.afterJson ?? null),
        JSON.stringify(r.metadataJson ?? null),
      ].map((v) => csvEscape(String(v ?? ""))).join(","),
    );
  }

  const csv = lines.join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

