import "server-only";

export type CashflowAssumptions = {
  openingBalance: number;
  horizonDays: number;
  collectionDelayDays: number;
  supplierPaymentDelayDays: number;
};

export const DEFAULT_CASHFLOW_ASSUMPTIONS: CashflowAssumptions = {
  openingBalance: 0,
  horizonDays: 90,
  collectionDelayDays: 7,
  supplierPaymentDelayDays: 14,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function clampMoney(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function parseCashflowAssumptions(searchParams: Record<string, string | string[] | undefined>): CashflowAssumptions {
  const openingBalance = clampMoney(searchParams.openingBalance, -1_000_000_000, 1_000_000_000, DEFAULT_CASHFLOW_ASSUMPTIONS.openingBalance);
  const horizonDays = clampInt(searchParams.horizonDays, 7, 365, DEFAULT_CASHFLOW_ASSUMPTIONS.horizonDays);
  const collectionDelayDays = clampInt(searchParams.collectionDelayDays, 0, 60, DEFAULT_CASHFLOW_ASSUMPTIONS.collectionDelayDays);
  const supplierPaymentDelayDays = clampInt(searchParams.supplierPaymentDelayDays, 0, 90, DEFAULT_CASHFLOW_ASSUMPTIONS.supplierPaymentDelayDays);

  return { openingBalance, horizonDays, collectionDelayDays, supplierPaymentDelayDays };
}

