import "server-only";

import crypto from "node:crypto";

// Minimal ZIP writer (store-only, no compression) for small packs.
// This avoids additional dependencies and works for generated HTML + manifest files.

function u16(n: number) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n & 0xffff, 0);
  return b;
}

function u32(n: number) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function crc32(buf: Buffer): number {
  // Based on standard CRC-32 (IEEE 802.3).
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosDate, dosTime };
}

function normalizeName(name: string) {
  const safe = name.replaceAll("\\", "/").replaceAll(/^\//g, "");
  // Disallow path traversal.
  const parts = safe.split("/").filter((p) => p && p !== "." && p !== "..");
  return parts.join("/");
}

export type ZipFileInput = { name: string; data: string | Buffer; mtime?: Date };

export function createZip(files: ZipFileInput[]): Buffer {
  const now = new Date();
  const entries = files
    .map((f) => ({
      name: normalizeName(f.name),
      data: typeof f.data === "string" ? Buffer.from(f.data, "utf8") : f.data,
      mtime: f.mtime ?? now,
    }))
    .filter((f) => f.name);

  // Ensure deterministic-ish order.
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const dataBuf = e.data;
    const crc = crc32(dataBuf);
    const { dosDate, dosTime } = dosDateTime(e.mtime);

    // Local file header
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20), // version needed to extract
      u16(0), // flags
      u16(0), // compression (store)
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(dataBuf.length),
      u32(dataBuf.length),
      u16(nameBuf.length),
      u16(0), // extra length
      nameBuf,
    ]);

    localParts.push(localHeader, dataBuf);

    // Central directory header
    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0),
      u16(0), // store
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(dataBuf.length),
      u32(dataBuf.length),
      u16(nameBuf.length),
      u16(0), // extra length
      u16(0), // comment length
      u16(0), // disk number
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(offset),
      nameBuf,
    ]);
    centralParts.push(centralHeader);

    offset += localHeader.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const centralOffset = offset;
  const centralSize = centralDir.length;

  // End of central directory
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0), // disk
    u16(0), // start disk
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0), // comment length
  ]);

  // Add a tiny entropy marker for some clients (optional).
  const marker = Buffer.from(`\nBuildy-ZIP:${crypto.randomBytes(4).toString("hex")}\n`, "utf8");

  return Buffer.concat([...localParts, centralDir, end, marker]);
}

