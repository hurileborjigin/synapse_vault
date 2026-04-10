/**
 * CitationManager — URL tracking, reference numbering, deduplication.
 * Port of Python's synapse_agent/utils/citations.py
 */

import type { Citation, SearchResult } from "../types";

export class CitationManager {
  private urlToResult = new Map<string, SearchResult>();
  private citations: Citation[] = [];
  private urlToIndex = new Map<string, number>();

  constructor(searchResults: SearchResult[]) {
    for (const r of searchResults) {
      if (r.url && !this.urlToResult.has(r.url)) {
        this.urlToResult.set(r.url, r);
      }
    }
  }

  get whitelist(): Set<string> {
    return new Set(this.urlToResult.keys());
  }

  /**
   * Get existing citation or create a new one.
   * Returns null if URL not in the whitelist of search results.
   */
  getOrCreate(url: string): Citation | null {
    if (!this.urlToResult.has(url)) return null;

    const existing = this.urlToIndex.get(url);
    if (existing !== undefined) return this.citations[existing];

    const idx = this.citations.length + 1;
    const result = this.urlToResult.get(url)!;
    const citation: Citation = {
      index: idx,
      url,
      title: result.title,
      snippet: result.snippet.slice(0, 200),
    };
    this.citations.push(citation);
    this.urlToIndex.set(url, this.citations.length - 1);
    return citation;
  }

  getAll(): Citation[] {
    return [...this.citations];
  }

  formatReferenceList(): string {
    if (this.citations.length === 0) return "";
    return this.citations
      .map((c) => `[${c.index}] ${c.title}. ${c.url}`)
      .join("\n");
  }

  /**
   * Build a prompt section listing available URLs for the LLM to cite.
   * Sorted by relevance score (highest first).
   */
  buildUrlMappingPrompt(): string {
    const sorted = [...this.urlToResult.values()].sort(
      (a, b) => b.relevanceScore - a.relevanceScore
    );
    return sorted
      .slice(0, 60)
      .map((r, i) => {
        const preview = r.snippet.slice(0, 150);
        return `URL_${i + 1}: ${r.url}\n  Title: ${r.title}\n  Preview: ${preview}`;
      })
      .join("\n\n");
  }
}
