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

  // Search results accumulate across iterations
  searchResults: Annotation<SearchResult[]>({
    reducer: (current, update) => [...current, ...update],
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
});

export type ResearchStateType = typeof ResearchState.State;
