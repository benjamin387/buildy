import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

export type PasswordDigest = {
  hashBase64: string;
  saltBase64: string;
};

export async function hashPassword(password: string): Promise<PasswordDigest> {
  const salt = crypto.randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return {
    hashBase64: derivedKey.toString("base64"),
    saltBase64: salt.toString("base64"),
  };
}

export async function verifyPassword(params: {
  password: string;
  hashBase64: string;
  saltBase64: string;
}): Promise<boolean> {
  const salt = Buffer.from(params.saltBase64, "base64");
  const derivedKey = (await scryptAsync(params.password, salt, 64)) as Buffer;
  const expected = Buffer.from(params.hashBase64, "base64");

  if (expected.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(expected, derivedKey);
}

