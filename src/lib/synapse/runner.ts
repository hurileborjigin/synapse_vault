/**
 * Runner — executes the LangGraph research pipeline and maps events to SSE.
 */

import type { SSEEventType } from "./types";
import { buildGraph } from "./graph";

// Map LangGraph node names to frontend SSE event types
const NODE_TO_STAGE: Record<string, string> = {
  query_analyzer: "analyzing",
  searcher: "searching",
  ranker: "ranking",
  knowledge_graph: "knowledge_graph",
  synthesizer: "synthesizing",
  quality_gate: "quality_check",
};

export interface RunnerCallbacks {
  onEvent: (event: SSEEventType, data: unknown) => void;
}

/**
 * Strip the heavy `content` field from search results for SSE payloads.
 */
function slimSearchResults(
  results: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return results.map((r) => {
    const { content, ...rest } = r;
    return rest;
  });
}

/**
 * Run the research pipeline, emitting SSE events for each node completion.
 */
export async function runResearch(
  query: string,
  language: string,
  callbacks: RunnerCallbacks
): Promise<Record<string, unknown>> {
  const graph = buildGraph();

  const initialState = {
    originalQuery: query,
    language,
    domain: "general",
  };

  let latestState: Record<string, unknown> = { ...initialState };

  try {
    const stream = await graph.stream(initialState, {
      streamMode: "updates",
    });

    for await (const event of stream) {
      // event is { nodeName: partialStateUpdate }
      for (const [nodeName, update] of Object.entries(event)) {
        const stateUpdate = update as Record<string, unknown>;
        latestState = { ...latestState, ...stateUpdate };

        const stage = NODE_TO_STAGE[nodeName];
        if (!stage) continue;

        // Emit stage change
        callbacks.onEvent("stage", { stage, status: "running" });

        // Emit node-specific data
        if (nodeName === "query_analyzer") {
          callbacks.onEvent("sub_questions", {
            subQuestions: stateUpdate.subQuestions ?? [],
          });
        } else if (nodeName === "searcher") {
          callbacks.onEvent("search_results", {
            searchResults: slimSearchResults(
              (stateUpdate.searchResults ?? []) as Array<
                Record<string, unknown>
              >
            ),
            searchIteration: stateUpdate.searchIteration ?? 0,
          });
        } else if (nodeName === "ranker") {
          // After ranking, send the full accumulated results with scores
          callbacks.onEvent("ranking", {
            searchResults: slimSearchResults(
              ((latestState.searchResults as Array<Record<string, unknown>>) ?? [])
            ),
          });
        } else if (nodeName === "knowledge_graph") {
          callbacks.onEvent("knowledge_graph", {
            kgEntities: stateUpdate.kgEntities ?? [],
            kgRelations: stateUpdate.kgRelations ?? [],
            knowledgeGaps: stateUpdate.knowledgeGaps ?? [],
          });
        } else if (nodeName === "synthesizer") {
          callbacks.onEvent("synthesis", {
            article: stateUpdate.articleDraft ?? "",
            citations: stateUpdate.citations ?? [],
          });
        } else if (nodeName === "quality_gate") {
          callbacks.onEvent("quality", {
            qualityScores: stateUpdate.qualityScores ?? {},
            qualityPassed: stateUpdate.qualityPassed ?? false,
            revisionCount: stateUpdate.revisionCount ?? 0,
          });
        }
      }
    }

    // Pipeline complete — emit final result
    callbacks.onEvent("stage", { stage: "complete", status: "running" });
    callbacks.onEvent("complete", {
      status: "done",
      result: {
        query: latestState.originalQuery ?? query,
        language: latestState.language ?? language,
        subQuestions: latestState.subQuestions ?? [],
        searchResults: slimSearchResults(
          ((latestState.searchResults as Array<Record<string, unknown>>) ?? [])
        ),
        kgEntities: latestState.kgEntities ?? [],
        kgRelations: latestState.kgRelations ?? [],
        article: latestState.articleDraft ?? "",
        citations: latestState.citations ?? [],
        qualityScores: latestState.qualityScores ?? {},
        searchIterations: latestState.searchIteration ?? 0,
        revisions: latestState.revisionCount ?? 0,
      },
    });
  } catch (err) {
    callbacks.onEvent("error", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return latestState;
}
