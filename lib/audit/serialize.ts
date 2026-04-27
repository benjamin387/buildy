import { Prisma } from "@prisma/client";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Convert Prisma results (Decimal/Date/etc) into a JSON-safe structure for audit revisions.
 * - Prisma.Decimal -> string
 * - Date -> ISO string
 * - undefined -> null (JSON doesn't support undefined)
 */
export function toRevisionJson(value: unknown): JsonValue {
  if (value === null) return null;

  if (value === undefined) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toRevisionJson(item));
  }

  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toRevisionJson(v);
    }
    return out;
  }

  // Fallback for unexpected values (e.g. Error, class instances).
  return String(value);
}

