import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "client_portal_session";

type SessionPayload = {
  accountId: string;
  iat: number;
};

function getSecret(): string {
  const secret = process.env.CLIENT_PORTAL_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("CLIENT_PORTAL_SESSION_SECRET is not set");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function sign(data: string): string {
  const h = crypto.createHmac("sha256", getSecret());
  h.update(data);
  return base64url(h.digest());
}

function encode(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const body = base64url(json);
  const sig = sign(body);
  return `${body}.${sig}`;
}

function decode(value: string): SessionPayload | null {
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as SessionPayload).accountId !== "string" ||
      typeof (parsed as SessionPayload).iat !== "number"
    ) {
      return null;
    }
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

export async function setClientPortalSession(accountId: string) {
  const jar = await cookies();
  const payload: SessionPayload = { accountId, iat: Date.now() };

  jar.set(COOKIE_NAME, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/client",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearClientPortalSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/client",
    maxAge: 0,
  });
}

export async function getClientPortalSessionAccountId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const payload = decode(value);
  return payload?.accountId ?? null;
}

