/**
 * Searcher — cascading web search across multiple providers.
 * Uses KG-guided queries when available for more targeted searching.
 */

import type { ResearchStateType } from "../state";
import { searchAndEnrich } from "../tools";

export async function searcher(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  const seenUrls = new Set(state.seenUrls ?? []);

  // Collect all search queries
  const allQueries: string[] = [];

  // Priority 1: KG-guided queries (more targeted than raw gaps)
  if ((state.kgGuidedQueries ?? []).length > 0) {
    allQueries.push(...state.kgGuidedQueries!);
  }

  // Priority 2: Knowledge gaps (iterations > 0, fallback if no guided queries)
  if (allQueries.length === 0) {
    for (const gap of state.knowledgeGaps ?? []) {
      allQueries.push(gap);
    }
  }

  // Priority 3: Sub-questions that haven't been answered yet
  if (allQueries.length === 0) {
    for (const sq of state.subQuestions ?? []) {
      if (!sq.answered) {
        allQueries.push(...sq.searchQueries);
      }
    }
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
