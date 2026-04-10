/**
 * Core data types for the Synapse research pipeline.
 * These are used internally by the backend; the frontend types in lib/sample-data.ts
 * remain the source of truth for UI components.
 */

export interface SubQuestion {
  question: string;
  priority: number; // 1 = highest
  answered: boolean;
  searchQueries: string[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  content: string; // Full page content from Jina Reader
  relevanceScore: number; // 0-10, filled by ranker
  sourceQuery: string; // The sub-question/gap query that triggered this result
}

export interface KGEntity {
  name: string;
  entityType: string;
  description: string;
}

export interface KGRelation {
  source: string;
  target: string;
  relation: string;
  evidence: string;
}

export interface Citation {
  index: number;
  url: string;
  title: string;
  snippet: string;
}

export interface QualityScores {
  comprehensiveness: number;
  insight: number;
  instruction_following: number;
  readability: number;
}

/** SSE event types matching the frontend's StreamCallbacks */
export type SSEEventType =
  | "stage"
  | "sub_questions"
  | "search_results"
  | "ranking"
  | "knowledge_graph"
  | "synthesis"
  | "quality"
  | "complete"
  | "error";
