/**
 * Jina Search API — primary search provider.
 * Port of Python's tools/jina_search.py
 */

import type { SearchResult } from "../types";
import { getSettings } from "../config";

export async function jinaSearch(
  query: string,
  numResults = 5
): Promise<SearchResult[]> {
  const { jinaApiKey } = getSettings();
  if (!jinaApiKey) return [];

  try {
    const resp = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: {
        Authorization: `Bearer ${jinaApiKey}`,
        Accept: "application/json",
        "X-Retain-Images": "none",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.data ?? [])
      .slice(0, numResults)
      .map(
        (item: Record<string, string>): SearchResult => ({
          url: item.url ?? "",
          title: item.title ?? "",
          snippet:
            item.description ?? (item.content ?? "").slice(0, 500),
          content: item.content ?? "",
          relevanceScore: 0,
          sourceQuery: query,
        })
      );
  } catch {
    return [];
  }
}
