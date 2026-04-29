import { randomUUID } from "node:crypto";

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResponse = {
  ok: boolean;
  query: string;
  provider: "placeholder" | "configured";
  results: WebSearchResult[];
  error?: string;
};

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function formatFallbackResults(query: string): WebSearchResult[] {
  const token = randomUUID().slice(0, 8);
  return [
    {
      title: `Search placeholder result for "${query}"`,
      url: `https://example.com/search/${encodeURIComponent(query)}`,
      snippet: `Web search provider is not configured. This is a generated preview result (${token}).`,
    },
  ];
}

export async function webSearch(query: string): Promise<WebSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      ok: false,
      query: "",
      provider: "placeholder",
      results: [],
      error: "Missing search query.",
    };
  }

  const hasProvider = Boolean(getEnv("OPENAI_API_KEY") || getEnv("WEB_SEARCH_PROVIDER"));
  if (!hasProvider) {
    return {
      ok: true,
      query: trimmed,
      provider: "placeholder",
      results: formatFallbackResults(trimmed),
    };
  }

  // Placeholder for production provider integration.
  // Keep output stable and auditable while provider wiring is completed.
  return {
    ok: true,
    query: trimmed,
    provider: "configured",
    results: [
      {
        title: `Configured search adapter returned placeholder for "${trimmed}"`,
        url: `https://example.com/search/${encodeURIComponent(trimmed)}`,
        snippet: "Provider is present; integration hook is ready for production search endpoint.",
      },
    ],
  };
}
