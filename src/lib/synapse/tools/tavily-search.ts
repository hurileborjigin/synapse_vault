/**
 * Tavily Search API — final fallback search provider.
 * Uses direct HTTP instead of SDK for consistency with Jina/Brave.
 * Port of Python's tools/tavily_search.py
 */

import type { SearchResult } from "../types";
import { getSettings } from "../config";

export async function tavilySearch(
  query: string,
  numResults = 5
): Promise<SearchResult[]> {
  const { tavilyApiKey } = getSettings();
  if (!tavilyApiKey) return [];

  console.log(`[tavilySearch] searching: "${query.slice(0, 60)}..."`);
  try {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        max_results: numResults,
        include_raw_content: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.results ?? [])
      .slice(0, numResults)
      .map(
        (item: Record<string, string>): SearchResult => ({
          url: item.url ?? "",
          title: item.title ?? "",
          snippet: item.content ?? "",
          content: item.raw_content ?? "",
          relevanceScore: 0,
          sourceQuery: query,
        })
      );
  } catch {
    return [];
  }
}
