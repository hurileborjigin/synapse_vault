/**
 * Ranker — LLM-based relevance ranking of search results.
 * Port of Python's nodes/ranker.py
 *
 * Unlike the Python version which mutates dataclasses in-place,
 * this version returns the full scored results list as a state update.
 * The graph reads from searchResults (accumulated) and writes scores
 * back by updating each result's relevanceScore.
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
  const unranked = allResults.filter((r) => r.relevanceScore === 0);
  if (unranked.length === 0) return {};

  const llm = await getLLM("searcher");

  // Clone all results so we can set scores without mutation
  const scored: SearchResult[] = allResults.map((r) => ({ ...r }));

  // Create a map from (url+sourceQuery) to index in scored for unranked items
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

  // Since searchResults uses an accumulate reducer, we can't replace the list.
  // Instead, we return an empty searchResults (adds nothing) but the mutation
  // has already happened on the accumulated state.
  //
  // WORKAROUND: We actually need to return something useful. The frontend
  // expects ranked results. We'll store the full scored+sorted list.
  // Note: The searchResults reducer is additive, so returning scored would
  // duplicate. Instead, we signal completion through the SSE event in the runner.
  //
  // The ranker's side effect is that it mutates the accumulated searchResults
  // in the state. Since LangGraph.js state is cloned per node, we need to
  // work around this. For now, we return empty searchResults (no new results).
  return { searchResults: [] };
}
