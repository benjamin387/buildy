import "server-only";

/**
 * Minimal phone normalization for SG-focused workflows.
 * - Accepts blanks -> null
 * - Accepts `whatsapp:+65...` -> `+65...`
 * - Accepts `+65xxxxxxxx` -> `+65xxxxxxxx`
 * - Accepts `65xxxxxxxx` -> `+65xxxxxxxx`
 * - Accepts `xxxxxxxx` -> `+65xxxxxxxx` (assumes SG local 8-digit)
 */
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const withoutPrefix = raw.toLowerCase().startsWith("whatsapp:") ? raw.slice("whatsapp:".length).trim() : raw;
  const cleaned = withoutPrefix.replaceAll(/[^\d+]/g, "");

  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // If includes country code without '+'
  if (cleaned.startsWith("65") && cleaned.length === 10) {
    return `+${cleaned}`;
  }

  // If SG local 8-digit number, assume +65
  if (cleaned.length === 8) {
    return `+65${cleaned}`;
  }

  // Fallback: keep digits with '+' prefix
  return `+${cleaned}`;
}

