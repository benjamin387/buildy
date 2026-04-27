import Parser from "rss-parser";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { EmptyState } from "@/app/components/ui/empty-state";

const FEED_URL =
  "https://obtauarufcwgyiwilnar.supabase.co/functions/v1/gebiz-feed";

type GebizCustom = {
  "buildy:agency"?: string;
  "buildy:category"?: string;
  "buildy:closingDate"?: string;
  "buildy:reference"?: string;
};

type GebizItem = {
  title?: string;
  link?: string;
  agency?: string;
  category?: string;
  closingDate?: string;
  reference?: string;
};

const parser = new Parser<Record<string, unknown>, GebizCustom>({
  customFields: {
    item: [
      "buildy:agency",
      "buildy:category",
      "buildy:closingDate",
      "buildy:reference",
    ],
  },
});

function formatClosingDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

async function loadTenders(): Promise<GebizItem[]> {
  const res = await fetch(FEED_URL, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`GeBIZ feed responded ${res.status}`);
  }
  const xml = await res.text();
  const feed = await parser.parseString(xml);
  return feed.items.slice(0, 5).map((item) => ({
    title: item.title,
    link: item.link,
    agency: item["buildy:agency"],
    category: item["buildy:category"],
    closingDate: item["buildy:closingDate"],
    reference: item["buildy:reference"],
  }));
}

export async function TendersRssWidget() {
  let items: GebizItem[] = [];
  let failed = false;

  try {
    items = await loadTenders();
  } catch (err) {
    console.error("[dashboard] gebiz feed fetch failed:", err);
    failed = true;
  }

  return (
    <SectionCard
      title="Latest GeBIZ Tenders"
      description="Live snapshot from the public GeBIZ feed (refreshed every 5 minutes). Full sync runs daily at 06:00 SGT."
    >
      {failed || items.length === 0 ? (
        <EmptyState
          title="Tender feed unavailable"
          description="We couldn't load the live GeBIZ feed right now. The next scheduled sync runs at 06:00 SGT."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const closing = formatClosingDate(item.closingDate);
            const meta = [item.agency, closing ? `Closes ${closing}` : null, item.reference]
              .filter(Boolean)
              .join(" · ");
            const key = item.link ?? item.reference ?? `${idx}`;
            const content = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-950">
                    {item.title ?? "Untitled tender"}
                  </p>
                  {meta ? (
                    <p className="mt-0.5 text-xs text-neutral-600">{meta}</p>
                  ) : null}
                </div>
                {item.category ? (
                  <StatusPill tone="info">{item.category}</StatusPill>
                ) : null}
              </>
            );
            return item.link ? (
              <a
                key={key}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:bg-stone-50"
              >
                {content}
              </a>
            ) : (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
