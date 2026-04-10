/**
 * LangGraph.js state definition with Annotation reducers.
 * Replaces Python's ResearchState TypedDict.
 */

import { Annotation } from "@langchain/langgraph";
import type {
  SubQuestion,
  SearchResult,
  KGEntity,
  KGRelation,
  Citation,
  QualityScores,
} from "./types";

export const ResearchState = Annotation.Root({
  // Input
  originalQuery: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  language: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "en",
  }),
  domain: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "general",
  }),

  // Query analysis
  subQuestions: Annotation<SubQuestion[]>({
    reducer: (_, update) => update, // replace
    default: () => [],
  }),

  // Search iteration tracking
  searchIteration: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  // Search results: smart reducer that appends new results or replaces on ranking update
  searchResults: Annotation<SearchResult[]>({
    reducer: (current, update) => {
      if (update.length === 0) return current;
      // Detect ranking update: all items have scores > 0 and overlap with current URLs
      const updateUrls = new Set(update.map((r) => r.url));
      const isRankingUpdate =
        update.every((r) => r.relevanceScore > 0) &&
        current.some((r) => updateUrls.has(r.url));
      return isRankingUpdate ? update : [...current, ...update];
    },
    default: () => [],
  }),

  // URL deduplication — string[] with dedup reducer (not Set for JSON serialization)
  seenUrls: Annotation<string[]>({
    reducer: (current, update) => [...new Set([...current, ...update])],
    default: () => [],
  }),

  // Knowledge graph
  kgEntities: Annotation<KGEntity[]>({
    reducer: (_, update) => update, // replace each iteration
    default: () => [],
  }),
  kgRelations: Annotation<KGRelation[]>({
    reducer: (_, update) => update, // replace each iteration
    default: () => [],
  }),
  knowledgeGaps: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // KG grounding context for synthesizer
  kgContext: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  entityCoverage: Annotation<Record<string, number>>({
    reducer: (_, update) => update,
    default: () => ({}),
  }),
  kgGuidedQueries: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // Synthesis
  articleDraft: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  citations: Annotation<Citation[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // Quality evaluation
  qualityScores: Annotation<QualityScores | Record<string, never>>({
    reducer: (_, update) => update,
    default: () => ({}),
  }),
  qualityFeedback: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  qualityPassed: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  revisionCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  // Token usage tracking per node
  tokenUsage: Annotation<Record<string, number>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // Human-in-the-loop
  threadId: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
  lightSearchResults: Annotation<
    Array<{
      query: string;
      topResults: Array<{ title: string; snippet: string; url: string }>;
    }>
  >({
    reducer: (_, update) => update,
    default: () => [],
  }),
  topicsApproved: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
});

export type ResearchStateType = typeof ResearchState.State;
