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
  onComplete?: (result?: ResearchResult) => void;
  onError?: (message: string) => void;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && /abort/i.test(err.message)) return true;
  return false;
}

export async function startResearch(
  query: string,
  language: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, language }),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) return;
    callbacks.onError?.(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch { /* aborted */ }
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
  let currentEvent = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

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
  } catch (err) {
    if (isAbortError(err)) return;
    callbacks.onError?.(err instanceof Error ? err.message : String(err));
  }
}

function dispatchEvent(event: string, data: Record<string, unknown>, cb: StreamCallbacks) {
  console.log(`[SSE] event=${event}`, event === "synthesis"
    ? { articleLen: (data.article as string)?.length ?? 0, citations: (data.citations as unknown[])?.length ?? 0 }
    : event === "complete"
    ? { hasResult: !!data.result, articleLen: ((data.result as Record<string,unknown>)?.article as string)?.length ?? 0 }
    : event === "quality"
    ? { scores: data.qualityScores, passed: data.qualityPassed, revision: data.revisionCount }
    : event === "stage"
    ? { stage: data.stage, status: data.status }
    : event === "error"
    ? { message: data.message }
    : { keys: Object.keys(data) }
  );
  switch (event) {
    case "stage":
      cb.onStageChange?.(data.stage as string, data.status as string);
      break;
    case "sub_questions":
      cb.onSubQuestions?.(data.subQuestions as SubQuestion[]);
      break;
    case "search_results":
      cb.onSearchResults?.(
        data.searchResults as SearchResult[],
        data.searchIteration as number
      );
      break;
    case "ranking":
      cb.onRanking?.(data.searchResults as SearchResult[]);
      break;
    case "knowledge_graph":
      cb.onKnowledgeGraph?.(
        data.kgEntities as KGEntity[],
        data.kgRelations as KGRelation[],
        (data.knowledgeGaps as string[]) ?? []
      );
      break;
    case "synthesis":
      cb.onSynthesis?.(
        data.article as string,
        data.citations as Citation[]
      );
      break;
    case "quality": {
      const scores = data.qualityScores as QualityScores;
      cb.onQuality?.(scores, data.qualityPassed as boolean, data.revisionCount as number);
      break;
    }
    case "complete": {
      const rawResult = data.result as Record<string, unknown> | undefined;
      const converted = rawResult
        ? ({
            query: rawResult.query as string,
            language: rawResult.language as string,
            subQuestions: (rawResult.subQuestions ?? []) as SubQuestion[],
            searchResults: (rawResult.searchResults ?? []) as SearchResult[],
            kgEntities: (rawResult.kgEntities ?? []) as KGEntity[],
            kgRelations: (rawResult.kgRelations ?? []) as KGRelation[],
            article: (rawResult.article as string) ?? "",
            citations: (rawResult.citations ?? []) as Citation[],
            qualityScores: (rawResult.qualityScores as QualityScores) ?? {
              comprehensiveness: 0,
              insight: 0,
              instruction_following: 0,
              readability: 0,
            },
            searchIterations: (rawResult.searchIterations as number) ?? 0,
            revisions: (rawResult.revisions as number) ?? 0,
          } satisfies ResearchResult)
        : undefined;
      cb.onComplete?.(converted);
      break;
    }
    case "error":
      cb.onError?.(data.message as string);
      break;
  }
}

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export interface SearchApiStatus {
  jina: boolean;
  brave: boolean;
  tavily: boolean;
}

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
  // Provider-specific
  azureOpenaiEndpoint: string;
  azureOpenaiApiVersion: string;
  compatibleBaseUrl: string;
  // API keys (masked on GET)
  anthropicApiKey: string;
  openaiApiKey: string;
  azureOpenaiApiKey: string;
  compatibleApiKey: string;
  jinaApiKey: string;
  braveApiKey: string;
  tavilyApiKey: string;
  // Search API availability
  searchApiStatus?: SearchApiStatus;
}

export async function getSettings(): Promise<AgentSettings> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) {
    throw new Error(`Failed to load settings: HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateSettings(updates: Partial<AgentSettings>): Promise<AgentSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`Failed to save settings: HTTP ${res.status}`);
  }
  return res.json();
}
