/**
 * Searcher — cascading web search across multiple providers.
 * Port of Python's nodes/searcher.py
 */

import type { ResearchStateType } from "../state";
import { searchAndEnrich } from "../tools";

export async function searcher(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  const seenUrls = new Set(state.seenUrls ?? []);

  // Collect all search queries
  const allQueries: string[] = [];

  // From sub-questions that haven't been answered yet
  for (const sq of state.subQuestions ?? []) {
    if (!sq.answered) {
      allQueries.push(...sq.searchQueries);
    }
  }

  // From knowledge gaps (iterations > 0)
  for (const gap of state.knowledgeGaps ?? []) {
    allQueries.push(gap);
  }

  // Fallback to original query
  if (allQueries.length === 0) {
    allQueries.push(state.originalQuery);
  }

  const { results, newUrls } = await searchAndEnrich(allQueries, seenUrls);

  return {
    searchResults: results,
    seenUrls: newUrls,
    searchIteration: (state.searchIteration ?? 0) + 1,
  };
}
