/**
 * Brave Search API — fallback search provider.
 * Port of Python's tools/brave_search.py
 */

import type { SearchResult } from "../types";
import { getSettings } from "../config";

export async function braveSearch(
  query: string,
  numResults = 5
): Promise<SearchResult[]> {
  const { braveApiKey } = getSettings();
  if (!braveApiKey) return [];

  const params = new URLSearchParams({
    q: query,
    count: String(numResults),
  });

  try {
    const resp = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveApiKey,
        },
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.web?.results ?? [])
      .slice(0, numResults)
      .map(
        (item: Record<string, string>): SearchResult => ({
          url: item.url ?? "",
          title: item.title ?? "",
          snippet: item.description ?? "",
          content: "",
          relevanceScore: 0,
          sourceQuery: query,
        })
      );
  } catch {
    return [];
  }
}
