import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { DEFAULT_CASHFLOW_ASSUMPTIONS, type CashflowAssumptions } from "@/lib/cashflow/assumptions";
import { auditLog } from "@/lib/audit";
import type { ExecutionActor } from "@/lib/execution/budget-service";

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function clampDateWithin(date: Date, start: Date, end: Date): Date {
  if (date.getTime() < start.getTime()) return start;
  if (date.getTime() > end.getTime()) return end;
  return date;
}

function riskLevel(params: { expectedInflows: number; expectedOutflows: number; projectedClosingBalance: number; overdueReceivables: number }) {
  if (params.projectedClosingBalance < 0) return "CRITICAL" as const;
  if (params.expectedOutflows > params.expectedInflows * 1.3) return "HIGH" as const;
  if (params.expectedInflows > 0 && params.overdueReceivables > params.expectedInflows * 0.2) return "MEDIUM" as const;
  return "LOW" as const;
}

export async function generateExecutionCashflowSnapshot(params: {
  projectId: string;
  actor: ExecutionActor;
  assumptions?: Partial<CashflowAssumptions>;
}) {
  const assumptions: CashflowAssumptions = {
    ...DEFAULT_CASHFLOW_ASSUMPTIONS,
    ...(params.assumptions ?? {}),
  };

  const now = new Date();
  const start = now;
  const end = addDays(now, assumptions.horizonDays);

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, startDate: true, targetCompletionDate: true },
  });
  if (!project) throw new Error("Project not found.");

  const durationStart = project.startDate ?? now;
  const durationEnd = project.targetCompletionDate ?? addDays(durationStart, 90);

  const [schedules, procurementPlan, overdueAgg] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { projectId: params.projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
    prisma.projectProcurementPlan.findFirst({
      where: { projectId: params.projectId },
      orderBy: [{ createdAt: "desc" }],
      include: { items: { orderBy: [{ tradeKey: "asc" }, { createdAt: "asc" }], take: 400 } },
    }),
    prisma.invoice.aggregate({
      where: {
        projectId: params.projectId,
        dueDate: { lt: now },
        outstandingAmount: { gt: 0 },
        status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] },
      },
      _sum: { outstandingAmount: true },
    }),
  ]);

  const lines: Array<Prisma.CashflowForecastLineUncheckedCreateInput> = [];

  // Inflows: payment schedules (use remaining amount not yet paid).
  if (schedules.length > 0) {
    const spreadCount = schedules.filter((s) => !s.dueDate).length;
    const spreadStep = spreadCount > 0 ? Math.max(1, Math.floor((durationEnd.getTime() - durationStart.getTime()) / (spreadCount + 1) / (24 * 3600 * 1000))) : 0;
    let spreadIndex = 0;

    for (const s of schedules) {
      const remaining = roundCurrency(Math.max(Number(s.scheduledAmount ?? 0) - Number(s.paidAmount ?? 0), 0));
      if (!(remaining > 0)) continue;

      let due = s.dueDate;
      if (!due) {
        spreadIndex += 1;
        due = addDays(durationStart, spreadIndex * spreadStep);
      }
      const expected = clampDateWithin(addDays(due, assumptions.collectionDelayDays), start, end);

      lines.push({
        snapshotId: "TEMP",
        projectId: params.projectId,
        sourceType: "PAYMENT_SCHEDULE",
        sourceId: s.id,
        direction: "INFLOW",
        label: s.label,
        expectedDate: expected,
        amount: new Prisma.Decimal(remaining),
        confidenceLevel: new Prisma.Decimal(0.7),
        status: "EXPECTED",
        createdAt: now,
      });
    }
  }

  // Outflows: procurement plan items (planned amount, delayed by supplier payment terms).
  if (procurementPlan?.items?.length) {
    const items = procurementPlan.items.filter((i) => i.status !== "CANCELLED");
    const spreadCount = items.filter((i) => !i.plannedAwardDate && !i.plannedDeliveryDate).length;
    const spreadStep = spreadCount > 0 ? Math.max(2, Math.floor((durationEnd.getTime() - durationStart.getTime()) / (spreadCount + 1) / (24 * 3600 * 1000))) : 0;
    let spreadIndex = 0;

    for (const it of items) {
      const base = Number(it.committedAmount ?? 0) > 0 ? Number(it.committedAmount) : Number(it.plannedAmount ?? 0);
      const amt = roundCurrency(Math.max(base, 0));
      if (!(amt > 0)) continue;

      let anchor = it.plannedDeliveryDate ?? it.plannedAwardDate ?? null;
      if (!anchor) {
        spreadIndex += 1;
        anchor = addDays(durationStart, spreadIndex * spreadStep);
      }

      const expected = clampDateWithin(addDays(anchor, assumptions.supplierPaymentDelayDays), start, end);
      lines.push({
        snapshotId: "TEMP",
        projectId: params.projectId,
        sourceType: "PROCUREMENT_PLAN",
        sourceId: it.id,
        direction: "OUTFLOW",
        label: `${it.title}`,
        expectedDate: expected,
        amount: new Prisma.Decimal(amt),
        confidenceLevel: new Prisma.Decimal(0.6),
        status: "EXPECTED",
        createdAt: now,
      });
    }
  }

  const expectedInflows = roundCurrency(
    lines.filter((l) => l.direction === "INFLOW").reduce((sum, l) => sum + Number(l.amount), 0),
  );
  const expectedOutflows = roundCurrency(
    lines.filter((l) => l.direction === "OUTFLOW").reduce((sum, l) => sum + Number(l.amount), 0),
  );
  const netCashflow = roundCurrency(expectedInflows - expectedOutflows);
  const projectedClosingBalance = roundCurrency(assumptions.openingBalance + netCashflow);
  const overdueReceivables = roundCurrency(Number(overdueAgg._sum.outstandingAmount ?? 0));

  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.cashflowForecastSnapshot.create({
      data: {
        snapshotDate: now,
        projectId: params.projectId,
        forecastStartDate: start,
        forecastEndDate: end,
        openingBalance: new Prisma.Decimal(assumptions.openingBalance),
        expectedInflows: new Prisma.Decimal(expectedInflows),
        expectedOutflows: new Prisma.Decimal(expectedOutflows),
        netCashflow: new Prisma.Decimal(netCashflow),
        projectedClosingBalance: new Prisma.Decimal(projectedClosingBalance),
        riskLevel: riskLevel({ expectedInflows, expectedOutflows, projectedClosingBalance, overdueReceivables }),
        notes: "Auto-generated from execution payment schedules and procurement plan assumptions.",
      },
    });

    if (lines.length > 0) {
      await tx.cashflowForecastLine.createMany({
        data: lines.map((l) => ({ ...l, snapshotId: created.id })),
      });
    }

    return created;
  });

  await auditLog({
    module: "execution",
    action: "generate_cashflow_snapshot",
    actorUserId: params.actor.userId,
    projectId: params.projectId,
    entityType: "CashflowForecastSnapshot",
    entityId: snapshot.id,
    metadata: { horizonDays: assumptions.horizonDays, expectedInflows, expectedOutflows, projectedClosingBalance, overdueReceivables },
  });

  return snapshot;
}

