import "server-only";

import { CashflowRiskLevel, type Prisma } from "@prisma/client";

export type CashflowLine = {
  projectId: string | null;
  projectLabel: string | null;
  sourceType: string;
  sourceId: string | null;
  direction: "INFLOW" | "OUTFLOW";
  label: string;
  expectedDate: Date;
  amount: number;
  confidenceLevel: number;
  status: "EXPECTED" | "CONFIRMED" | "RECEIVED" | "PAID" | "OVERDUE" | "CANCELLED";
};

export type CashflowWindowTotals = {
  days: 7 | 30 | 60 | 90;
  inflows: number;
  outflows: number;
  net: number;
};

export type CashflowForecast = {
  forecastStartDate: Date;
  forecastEndDate: Date;
  openingBalance: number;
  expectedInflows: number;
  expectedOutflows: number;
  netCashflow: number;
  projectedClosingBalance: number;
  overdueReceivables: number;
  overduePayables: number;
  riskLevel: CashflowRiskLevel;
  lines: CashflowLine[];
  windows: CashflowWindowTotals[];
};

export function toMoney(value: Prisma.Decimal | number | null | undefined): number {
  const n = value === null || value === undefined ? 0 : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeExpectedDate(params: {
  baseDate: Date | null | undefined;
  fallbackDate: Date;
  delayDays: number;
  treatOverdueAsToday?: boolean;
}): Date {
  const today = startOfToday();
  const base = params.baseDate ? new Date(params.baseDate) : params.fallbackDate;
  base.setHours(0, 0, 0, 0);

  const delayed = addDays(base, params.delayDays);
  if (params.treatOverdueAsToday && delayed.getTime() < today.getTime()) {
    return addDays(today, params.delayDays);
  }
  return delayed;
}

export function computeRiskLevel(params: {
  projectedClosingBalance: number;
  inflowsNext30: number;
  outflowsNext30: number;
  overdueReceivables: number;
}): CashflowRiskLevel {
  if (params.projectedClosingBalance < 0) return CashflowRiskLevel.CRITICAL;

  const inflows = Math.max(params.inflowsNext30, 0);
  const outflows = Math.max(params.outflowsNext30, 0);
  const overdue = Math.max(params.overdueReceivables, 0);

  if (inflows > 0 && outflows > inflows * 1.3) return CashflowRiskLevel.HIGH;
  if (inflows > 0 && overdue > inflows * 0.2) return CashflowRiskLevel.MEDIUM;
  return CashflowRiskLevel.LOW;
}

export function computeForecast(params: {
  forecastStartDate: Date;
  forecastEndDate: Date;
  openingBalance: number;
  lines: CashflowLine[];
}): CashflowForecast {
  const start = new Date(params.forecastStartDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(params.forecastEndDate);
  end.setHours(23, 59, 59, 999);

  const lines = params.lines
    .slice()
    .filter((l) => l.expectedDate.getTime() >= start.getTime() && l.expectedDate.getTime() <= end.getTime())
    .sort((a, b) => a.expectedDate.getTime() - b.expectedDate.getTime());

  const expectedInflows = toMoney(
    lines
      .filter((l) => l.direction === "INFLOW" && l.status !== "CANCELLED")
      .reduce((sum, l) => sum + l.amount, 0),
  );
  const expectedOutflows = toMoney(
    lines
      .filter((l) => l.direction === "OUTFLOW" && l.status !== "CANCELLED")
      .reduce((sum, l) => sum + l.amount, 0),
  );

  const netCashflow = toMoney(expectedInflows - expectedOutflows);
  const projectedClosingBalance = toMoney(params.openingBalance + netCashflow);

  const today = startOfToday().getTime();
  const overdueReceivables = toMoney(
    lines
      .filter((l) => l.direction === "INFLOW" && l.status === "OVERDUE")
      .reduce((sum, l) => sum + l.amount, 0),
  );
  const overduePayables = toMoney(
    lines
      .filter((l) => l.direction === "OUTFLOW" && l.status === "OVERDUE")
      .reduce((sum, l) => sum + l.amount, 0),
  );

  function windowTotals(days: 7 | 30 | 60 | 90): CashflowWindowTotals {
    const windowEnd = addDays(startOfToday(), days);
    const within = lines.filter((l) => l.expectedDate.getTime() >= today && l.expectedDate.getTime() < windowEnd.getTime() && l.status !== "CANCELLED");
    const inflows = toMoney(within.filter((l) => l.direction === "INFLOW").reduce((sum, l) => sum + l.amount, 0));
    const outflows = toMoney(within.filter((l) => l.direction === "OUTFLOW").reduce((sum, l) => sum + l.amount, 0));
    return { days, inflows, outflows, net: toMoney(inflows - outflows) };
  }

  const windows: CashflowWindowTotals[] = [windowTotals(7), windowTotals(30), windowTotals(60), windowTotals(90)];

  const inflowsNext30 = windows.find((w) => w.days === 30)?.inflows ?? 0;
  const outflowsNext30 = windows.find((w) => w.days === 30)?.outflows ?? 0;

  const riskLevel = computeRiskLevel({
    projectedClosingBalance,
    inflowsNext30,
    outflowsNext30,
    overdueReceivables,
  });

  return {
    forecastStartDate: start,
    forecastEndDate: end,
    openingBalance: toMoney(params.openingBalance),
    expectedInflows,
    expectedOutflows,
    netCashflow,
    projectedClosingBalance,
    overdueReceivables,
    overduePayables,
    riskLevel,
    lines,
    windows,
  };
}

