import "server-only";

export type ParsedGeBizOpportunity = {
  opportunityNo?: string;
  title?: string;
  agency?: string;
  procurementType?: "QUOTATION" | "TENDER" | "RFI" | "FRAMEWORK";
  category?: string;
  closingDate?: Date;
  briefingDate?: Date;
  estimatedValue?: number;
};

function firstMatch(text: string, re: RegExp): string | undefined {
  const m = re.exec(text);
  if (!m) return undefined;
  return (m[1] ?? "").trim() || undefined;
}

function parseMoney(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  // Accept "SGD 123,456.78" / "$123,456" / "123456.00"
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  // Common GeBIZ formatting: "26 Apr 2026 04:00 PM" or "26/04/2026 16:00"
  const d = new Date(raw);
  if (Number.isFinite(d.getTime())) return d;

  const normalized = raw
    .replace(/\s+/g, " ")
    .replace("hrs", "")
    .trim();
  const d2 = new Date(normalized);
  if (Number.isFinite(d2.getTime())) return d2;
  return undefined;
}

function detectProcurementType(text: string): ParsedGeBizOpportunity["procurementType"] {
  const t = text.toLowerCase();
  if (t.includes("request for information") || /\brfi\b/.test(t)) return "RFI";
  if (t.includes("framework agreement") || t.includes("term contract")) return "FRAMEWORK";
  if (t.includes("invitation to tender") || /\btender\b/.test(t)) return "TENDER";
  if (t.includes("quotation") || /\brfq\b/.test(t)) return "QUOTATION";
  return undefined;
}

export function parseGeBizText(input: string): ParsedGeBizOpportunity {
  const text = (input ?? "").trim();
  if (!text) return {};

  const opportunityNo =
    firstMatch(text, /\b(?:Opportunity\s*(?:No\.?|Number)|Quotation\s*No\.?|Tender\s*No\.?)\s*[:\-]\s*([A-Z0-9\-\/]+)/i) ??
    firstMatch(text, /\b([A-Z]{2,6}\d{3,}[A-Z0-9\-\/]*)\b/i);

  const title =
    firstMatch(text, /\b(?:Title|Procurement\s*Title)\s*[:\-]\s*(.+)$/im) ??
    firstMatch(text, /\b(?:Description)\s*[:\-]\s*(.+)$/im);

  const agency =
    firstMatch(text, /\b(?:Agency|Buyer)\s*[:\-]\s*(.+)$/im) ??
    firstMatch(text, /\b(?:Organisation|Organization)\s*[:\-]\s*(.+)$/im);

  const category =
    firstMatch(text, /\b(?:Category|Procurement\s*Category)\s*[:\-]\s*(.+)$/im) ??
    firstMatch(text, /\b(?:Procurement\s*Type)\s*[:\-]\s*(.+)$/im);

  const closingDate =
    parseDate(firstMatch(text, /\b(?:Closing\s*Date|Closing)\s*[:\-]\s*(.+)$/im)) ??
    parseDate(firstMatch(text, /\b(?:Closing\s*Date)\s*[:\-]\s*([0-9]{1,2}\s+\w+\s+[0-9]{4}.*)$/im));

  const briefingDate =
    parseDate(firstMatch(text, /\b(?:Briefing\s*Date|Site\s*Briefing|Site\s*Showround)\s*[:\-]\s*(.+)$/im));

  const estimatedValue =
    parseMoney(firstMatch(text, /\b(?:Estimated\s*Value|Estimated\s*Contract\s*Value)\s*[:\-]\s*(.+)$/im)) ??
    parseMoney(firstMatch(text, /\b(?:Value)\s*[:\-]\s*(SGD[^\n]+)$/im));

  const procurementType = detectProcurementType(text);

  return {
    opportunityNo,
    title,
    agency,
    procurementType,
    category,
    closingDate,
    briefingDate,
    estimatedValue,
  };
}

