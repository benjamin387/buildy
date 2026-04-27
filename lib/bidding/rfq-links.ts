import "server-only";

import crypto from "node:crypto";

function getPublicBaseUrl(): string {
  const value = process.env.PUBLIC_APP_URL?.trim();
  if (value) return value.replaceAll(/\/+$/g, "");
  return "http://localhost:3000";
}

export function buildSupplierQuotePortalUrl(token: string): string {
  return `${getPublicBaseUrl()}/supplier-quote/${token}`;
}

export function generateRfqToken(): string {
  // 192-bit token; URL safe.
  return crypto.randomBytes(24).toString("base64url");
}

