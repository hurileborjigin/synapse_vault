import type {
  ResearchResult,
  SubQuestion,
  SearchResult,
  KGEntity,
  KGRelation,
  Citation,
  QualityScores,
} from "./sample-data";

const API_BASE = "/api";

// ---------------------------------------------------------------------------
// Snake → camelCase conversion
// ---------------------------------------------------------------------------

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function convertKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) return obj.map((v) => convertKeys(v)) as T;
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        snakeToCamel(k),
        convertKeys(v),
      ])
    ) as T;
  }
  return obj as T;
}

// ---------------------------------------------------------------------------
// SSE stream callbacks
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  onStageChange?: (stage: string, status: string) => void;
  onSubQuestions?: (subQuestions: SubQuestion[]) => void;
  onSearchResults?: (results: SearchResult[], searchIteration: number) => void;
  onRanking?: (results: SearchResult[]) => void;
  onKnowledgeGraph?: (entities: KGEntity[], relations: KGRelation[], gaps: string[]) => void;
  onSynthesis?: (article: string, citations: Citation[]) => void;
  onQuality?: (scores: QualityScores, passed: boolean, revisionCount: number) => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
}

export async function startResearch(
  query: string,
  language: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, language }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    callbacks.onError?.(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError?.("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:") && currentEvent) {
        const raw = line.slice(5).trim();
        try {
          const data = JSON.parse(raw);
          dispatchEvent(currentEvent, data, callbacks);
        } catch {
          // skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }
}

function dispatchEvent(event: string, data: Record<string, unknown>, cb: StreamCallbacks) {
  switch (event) {
    case "stage":
      cb.onStageChange?.(data.stage as string, data.status as string);
      break;
    case "sub_questions":
      cb.onSubQuestions?.(convertKeys<SubQuestion[]>(data.sub_questions));
      break;
    case "search_results":
      cb.onSearchResults?.(
        convertKeys<SearchResult[]>(data.search_results),
        data.search_iteration as number
      );
      break;
    case "ranking":
      cb.onRanking?.(convertKeys<SearchResult[]>(data.search_results));
      break;
    case "knowledge_graph":
      cb.onKnowledgeGraph?.(
        convertKeys<KGEntity[]>(data.kg_entities),
        convertKeys<KGRelation[]>(data.kg_relations),
        (data.knowledge_gaps as string[]) ?? []
      );
      break;
    case "synthesis":
      cb.onSynthesis?.(
        data.article as string,
        convertKeys<Citation[]>(data.citations)
      );
      break;
    case "quality": {
      // Don't convert quality_scores keys — component expects snake_case (instruction_following)
      const scores = data.quality_scores as QualityScores;
      cb.onQuality?.(scores, data.quality_passed as boolean, data.revision_count as number);
      break;
    }
    case "complete":
      cb.onComplete?.();
      break;
    case "error":
      cb.onError?.(data.message as string);
      break;
  }
}

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export interface AgentSettings {
  llmProvider: string;
  llmModel: string;
  llmTemperature: number;
  maxSearchIterations: number;
  maxRevisions: number;
  searchResultsPerQuery: number;
  relevanceThreshold: number;
  minCitations: number;
  qualityThreshold: number;
  maxConcurrentSearches: number;
}

export async function getSettings(): Promise<AgentSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  const data = await res.json();
  return convertKeys<AgentSettings>(data);
}

export async function updateSettings(updates: Partial<AgentSettings>): Promise<AgentSettings> {
  // Convert camelCase keys back to snake_case for the API
  const snakeUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    snakeUpdates[snakeKey] = value;
  }
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snakeUpdates),
  });
  const data = await res.json();
  return convertKeys<AgentSettings>(data);
}
