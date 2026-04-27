import { Prisma } from "@prisma/client";

export type PaymentTermInput = {
  title: string;
  percent: number | null;
  amount: number | null;
  triggerType: string | null;
  dueDays: number | null;
  sortOrder: number;
};

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nearlyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function validatePaymentTerms(input: {
  terms: PaymentTermInput[];
  subtotal: number;
}) {
  const terms = input.terms
    .slice()
    .map((t, index) => ({ ...t, sortOrder: Number.isFinite(t.sortOrder) ? t.sortOrder : index }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t, index) => ({ ...t, sortOrder: index }));

  if (terms.length === 0) {
    return { ok: true as const, normalized: terms, derivedAmounts: [] as number[] };
  }

  const subtotal = roundCurrency(Math.max(input.subtotal, 0));
  const derivedAmounts: number[] = [];

  for (const term of terms) {
    const hasPercent = term.percent !== null && Number.isFinite(term.percent);
    const hasAmount = term.amount !== null && Number.isFinite(term.amount);

    if (hasPercent && hasAmount) {
      return {
        ok: false as const,
        error: `Payment term "${term.title}" cannot have both percentage and amount.`,
      };
    }
    if (!hasPercent && !hasAmount) {
      return {
        ok: false as const,
        error: `Payment term "${term.title}" must have either percentage or amount.`,
      };
    }
    if (hasPercent) {
      if (term.percent! < 0 || term.percent! > 100) {
        return { ok: false as const, error: `Invalid percentage for "${term.title}".` };
      }
      derivedAmounts.push(roundCurrency((term.percent! / 100) * subtotal));
      continue;
    }
    if (hasAmount) {
      if (term.amount! < 0) {
        return { ok: false as const, error: `Invalid amount for "${term.title}".` };
      }
      derivedAmounts.push(roundCurrency(term.amount!));
    }
  }

  const allPercent = terms.every((t) => t.percent !== null && t.amount === null);
  if (allPercent) {
    const percentSum = roundCurrency(
      terms.reduce((sum, t) => sum + roundCurrency(t.percent ?? 0), 0),
    );
    if (!nearlyEqual(percentSum, 100, 0.01)) {
      return {
        ok: false as const,
        error: `Payment term percentages must add up to 100%. Current total is ${percentSum.toFixed(
          2,
        )}%.`,
      };
    }
  }

  const amountSum = roundCurrency(derivedAmounts.reduce((sum, a) => sum + a, 0));
  if (!nearlyEqual(amountSum, subtotal, 0.02)) {
    return {
      ok: false as const,
      error: `Payment term total must match quotation subtotal. Terms total ${amountSum.toFixed(
        2,
      )} but subtotal is ${subtotal.toFixed(2)}.`,
    };
  }

  return { ok: true as const, normalized: terms, derivedAmounts };
}

export function toPaymentTermCreateMany(input: {
  terms: PaymentTermInput[];
}): Prisma.QuotationPaymentTermCreateWithoutQuotationInput[] {
  return input.terms.map((term, index) => ({
    title: term.title,
    percent: term.percent === null ? null : new Prisma.Decimal(term.percent),
    amount: term.amount === null ? null : new Prisma.Decimal(term.amount),
    triggerType: term.triggerType || null,
    dueDays: term.dueDays === null ? null : term.dueDays,
    dueDate: null,
    notes: null,
    sortOrder: Number.isFinite(term.sortOrder) ? term.sortOrder : index,
  }));
}

