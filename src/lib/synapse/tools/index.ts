/**
 * Search tools — cascading search orchestrator + concurrency control.
 * Port of Python's searcher cascade logic.
 */

import type { SearchResult } from "../types";
import { getSettings } from "../config";
import { jinaSearch } from "./jina-search";
import { braveSearch } from "./brave-search";
import { tavilySearch } from "./tavily-search";
import { fetchPageContent } from "./jina-reader";

// ---------------------------------------------------------------------------
// Cascading search: Jina → Brave → Tavily
// ---------------------------------------------------------------------------

export async function cascadingSearch(
  query: string,
  numResults = 5
): Promise<SearchResult[]> {
  const settings = getSettings();

  // Only try providers that have API keys configured — skip others instantly
  const providers: Array<(q: string, n: number) => Promise<SearchResult[]>> = [];
  if (settings.jinaApiKey) providers.push(jinaSearch);
  if (settings.braveApiKey) providers.push(braveSearch);
  if (settings.tavilyApiKey) providers.push(tavilySearch);

  // If no providers configured, return empty
  if (providers.length === 0) return [];

  for (const provider of providers) {
    try {
      const results = await provider(query, numResults);
      if (results.length > 0) return results;
    } catch {
      // try next provider
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Concurrency-limited mapping (replaces asyncio.Semaphore)
// ---------------------------------------------------------------------------

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const idx = i;
    const p = fn(items[idx]).then((r) => {
      results[idx] = r;
    });
    const tracked = p.finally(() => executing.delete(tracked));
    executing.add(tracked);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

// ---------------------------------------------------------------------------
// Search + content enrichment for a set of queries
// ---------------------------------------------------------------------------

export async function searchAndEnrich(
  queries: string[],
  seenUrls: Set<string>
): Promise<{ results: SearchResult[]; newUrls: string[] }> {
  const settings = getSettings();

  // Run searches concurrently with limit
  const rawResults = await pMap(
    queries,
    (q) => cascadingSearch(q, settings.searchResultsPerQuery),
    settings.maxConcurrentSearches
  );

  // Flatten and dedup
  const newResults: SearchResult[] = [];
  const newUrls: string[] = [];

  for (const batch of rawResults) {
    for (const r of batch) {
      if (r.url && !seenUrls.has(r.url) && !newUrls.includes(r.url)) {
        newResults.push(r);
        newUrls.push(r.url);
      }
    }
  }

  // Enrich top results with full-page content via Jina Reader
  const toFetch = newResults.filter((r) => !r.content).slice(0, 20);
  if (toFetch.length > 0) {
    const contents = await pMap(
      toFetch,
      (r) => fetchPageContent(r.url),
      settings.maxConcurrentSearches
    );
    for (let i = 0; i < toFetch.length; i++) {
      if (contents[i]) {
        toFetch[i].content = contents[i].slice(0, 15_000);
      }
    }
  }

  return { results: newResults, newUrls };
}

export { jinaSearch, braveSearch, tavilySearch, fetchPageContent };
