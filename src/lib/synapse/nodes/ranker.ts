/**
 * Ranker — LLM-based relevance ranking of search results.
 *
 * Returns the full scored results list. The state.ts searchResults reducer
 * detects ranking updates (all items have relevanceScore > 0 with overlapping URLs)
 * and replaces instead of appending.
 */

import { getLLM } from "../config";
import type { ResearchStateType } from "../state";
import type { SearchResult } from "../types";

const SYSTEM_PROMPT = `You are a relevance ranker. Given a research query and a batch of search results, score each result's relevance from 0 to 10.

Respond with valid JSON only — an array of objects:
[{"index": 0, "score": 8.5}, {"index": 1, "score": 3.0}, ...]

Score criteria:
- 9-10: Directly answers a core aspect of the query with authoritative content
- 7-8: Highly relevant, provides useful supporting information
- 5-6: Somewhat relevant, tangential information
- 3-4: Marginally relevant
- 0-2: Irrelevant`;

function extractJSON(text: string): string {
  if (text.includes("```")) {
    const parts = text.split("```");
    let inner = parts[1] ?? "";
    if (inner.startsWith("json")) inner = inner.slice(4);
    return inner.trim();
  }
  return text.trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size)
  );
}

export async function ranker(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  const allResults = state.searchResults ?? [];
  if (allResults.length === 0) return {};

  // Only rank results that haven't been scored yet
  const hasUnranked = allResults.some((r) => r.relevanceScore === 0);
  if (!hasUnranked) return {};

  const llm = await getLLM("searcher");

  // Clone all results so we can set scores
  const scored: SearchResult[] = allResults.map((r) => ({ ...r }));

  // Find indices of unranked items
  const unrankedIndices: number[] = [];
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].relevanceScore === 0) {
      unrankedIndices.push(i);
    }
  }

  // Batch into groups of 10
  const batches = chunk(unrankedIndices, 10);

  const batchPromises = batches.map(async (batchIndices) => {
    const batch = batchIndices.map((i) => scored[i]);
    const summaries = batch
      .map((r, i) => {
        const preview = r.content?.slice(0, 500) || r.snippet;
        return `[${i}] Title: ${r.title}\nURL: ${r.url}\nContent: ${preview}`;
      })
      .join("\n\n");

    const prompt = `Research query: ${state.originalQuery}\n\nSearch results:\n${summaries}`;

    try {
      const response = await llm.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ]);

      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const scores: Array<{ index: number; score: number }> = JSON.parse(
        extractJSON(text)
      );

      for (const item of scores) {
        const idx = item.index;
        if (idx >= 0 && idx < batch.length) {
          scored[batchIndices[idx]] = {
            ...scored[batchIndices[idx]],
            relevanceScore: item.score,
          };
        }
      }
    } catch {
      // On failure, give all results a passing score
      for (const globalIdx of batchIndices) {
        scored[globalIdx] = { ...scored[globalIdx], relevanceScore: 6.0 };
      }
    }
  });

  await Promise.all(batchPromises);

  // Sort by relevance descending
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Return the full scored list — the smart reducer in state.ts detects this
  // as a ranking update (all items have scores > 0, URLs overlap with current)
  // and replaces instead of appending.
  return { searchResults: scored };
}
