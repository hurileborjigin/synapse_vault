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
    ? { scores: data.quality_scores, passed: data.quality_passed, revision: data.revision_count }
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
    case "complete": {
      const rawResult = data.result as Record<string, unknown> | undefined;
      const converted = rawResult
        ? ({
            query: rawResult.query as string,
            language: rawResult.language as string,
            subQuestions: convertKeys<SubQuestion[]>((rawResult.sub_questions ?? []) as SubQuestion[]),
            searchResults: convertKeys<SearchResult[]>((rawResult.search_results ?? []) as SearchResult[]),
            kgEntities: convertKeys<KGEntity[]>((rawResult.kg_entities ?? []) as KGEntity[]),
            kgRelations: convertKeys<KGRelation[]>((rawResult.kg_relations ?? []) as KGRelation[]),
            article: (rawResult.article as string) ?? "",
            citations: convertKeys<Citation[]>((rawResult.citations ?? []) as Citation[]),
            qualityScores: (rawResult.quality_scores as QualityScores) ?? {
              comprehensiveness: 0,
              insight: 0,
              instruction_following: 0,
              readability: 0,
            },
            searchIterations: (rawResult.search_iterations as number) ?? 0,
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
