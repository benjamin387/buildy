import "server-only";

export type XeroConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type XeroRuntimeCredentials = {
  tenantId: string;
  accessToken: string;
};

export function isXeroOAuthConfigured(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI);
}

export function isXeroRuntimeConfigured(): boolean {
  return Boolean(process.env.XERO_TENANT_ID && process.env.XERO_ACCESS_TOKEN);
}

export function getXeroConfig(): XeroConfig {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Xero OAuth is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI.");
  }
  return { clientId, clientSecret, redirectUri };
}

export function getXeroRuntimeCredentials(): XeroRuntimeCredentials {
  const tenantId = process.env.XERO_TENANT_ID;
  const accessToken = process.env.XERO_ACCESS_TOKEN;
  if (!tenantId || !accessToken) {
    throw new Error("Xero runtime credentials not set. Set XERO_TENANT_ID and XERO_ACCESS_TOKEN.");
  }
  return { tenantId, accessToken };
}

export class XeroClientPlaceholder {
  // Intentionally minimal for foundation. Real HTTP calls will be added later.
  constructor(
    public readonly config: XeroConfig,
    public readonly creds: XeroRuntimeCredentials,
  ) {}

  async testConnection(): Promise<{ ok: true } | { ok: false; message: string }> {
    // Placeholder: do not call Xero yet.
    return { ok: true };
  }
}

export async function getXeroClientIfConfigured(): Promise<XeroClientPlaceholder | null> {
  if (!isXeroOAuthConfigured() || !isXeroRuntimeConfigured()) return null;
  return new XeroClientPlaceholder(getXeroConfig(), getXeroRuntimeCredentials());
}

