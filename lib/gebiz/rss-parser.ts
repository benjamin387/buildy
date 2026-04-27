import "server-only";

export type RssItem = {
  title: string;
  link?: string;
  guid?: string;
  pubDate?: Date;
  categories: string[];
  description?: string;
};

export type ParsedRssFeed = {
  title?: string;
  items: RssItem[];
};

function stripCdata(value: string): string {
  const v = value.trim();
  if (v.startsWith("<![CDATA[") && v.endsWith("]]>")) {
    return v.slice(9, -3).trim();
  }
  return v;
}

function decodeXmlEntities(input: string): string {
  let s = input;
  s = s.replaceAll("&amp;", "&");
  s = s.replaceAll("&lt;", "<");
  s = s.replaceAll("&gt;", ">");
  s = s.replaceAll("&quot;", "\"");
  s = s.replaceAll("&apos;", "'");
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    if (!Number.isFinite(code)) return _;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _;
    }
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const code = Number.parseInt(String(hex), 16);
    if (!Number.isFinite(code)) return _;
    try {
      return String.fromCodePoint(code);
    } catch {
      return _;
    }
  });
  return s;
}

function extractTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  if (!m) return undefined;
  return decodeXmlEntities(stripCdata(m[1] ?? "")).trim() || undefined;
}

function extractTags(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  for (;;) {
    const m = re.exec(block);
    if (!m) break;
    const v = decodeXmlEntities(stripCdata(m[1] ?? "")).trim();
    if (v) out.push(v);
  }
  return out;
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isFinite(d.getTime())) return d;
  return undefined;
}

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRssXml(xml: string): ParsedRssFeed {
  const text = xml ?? "";
  const channel = extractTag(text, "channel");
  const title = channel ? extractTag(channel, "title") : extractTag(text, "title");

  const items: RssItem[] = [];
  const itemRe = /<item(?:\s+[^>]*)?>([\s\S]*?)<\/item>/gi;
  for (;;) {
    const m = itemRe.exec(text);
    if (!m) break;
    const block = m[1] ?? "";
    const titleRaw = extractTag(block, "title") ?? "";
    const titleClean = titleRaw.trim();
    if (!titleClean) continue;

    const link = extractTag(block, "link");
    const guid = extractTag(block, "guid");
    const pubDate = parseDate(extractTag(block, "pubDate"));
    const description = extractTag(block, "description");
    const categories = extractTags(block, "category");

    items.push({
      title: titleClean,
      link,
      guid,
      pubDate,
      categories,
      description,
    });
  }

  return { title, items };
}

