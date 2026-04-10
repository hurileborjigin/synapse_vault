/**
 * Runner — executes the LangGraph research pipeline and maps events to SSE.
 * Supports interrupt/resume for human-in-the-loop.
 */

import { Command } from "@langchain/langgraph";
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

export interface RunResult {
  latestState: Record<string, unknown>;
  threadId: string;
  interrupted: boolean;
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
 * Process a stream event and emit the appropriate SSE events.
 */
function processNodeUpdate(
  nodeName: string,
  stateUpdate: Record<string, unknown>,
  latestState: Record<string, unknown>,
  callbacks: RunnerCallbacks
) {
  const stage = NODE_TO_STAGE[nodeName];
  if (!stage) return;

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
        (stateUpdate.searchResults ?? []) as Array<Record<string, unknown>>
      ),
      searchIteration: stateUpdate.searchIteration ?? 0,
    });
  } else if (nodeName === "ranker") {
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
      entityCoverage: stateUpdate.entityCoverage ?? {},
      kgGuidedQueries: stateUpdate.kgGuidedQueries ?? [],
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

/**
 * Emit the final complete event with the full result.
 */
function emitComplete(
  latestState: Record<string, unknown>,
  query: string,
  language: string,
  callbacks: RunnerCallbacks
) {
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
}

/**
 * Run the research pipeline. May be interrupted for human-in-the-loop.
 */
export async function runResearch(
  query: string,
  language: string,
  callbacks: RunnerCallbacks,
  threadId?: string
): Promise<RunResult> {
  const graph = buildGraph();
  const tid = threadId || crypto.randomUUID();

  const initialState = {
    originalQuery: query,
    language,
    domain: "general",
    threadId: tid,
  };

  let latestState: Record<string, unknown> = { ...initialState };
  let interrupted = false;

  try {
    const stream = await graph.stream(initialState, {
      streamMode: "updates",
      configurable: { thread_id: tid },
    });

    for await (const event of stream) {
      // Log every stream event for debugging
      const eventKeys = Object.keys(event);
      console.log(`[runner] stream event keys: [${eventKeys.join(", ")}]`);

      // Check for interrupt event — LangGraph.js may emit it as a top-level key
      // or as part of the stream metadata
      if (event && typeof event === "object" && "__interrupt__" in event) {
        const interruptData = (
          event as Record<string, unknown[]>
        ).__interrupt__;
        interrupted = true;
        console.log("[runner] INTERRUPT detected:", JSON.stringify(interruptData).slice(0, 500));

        // Extract the value passed to interrupt()
        const payload =
          Array.isArray(interruptData) && interruptData.length > 0
            ? (interruptData[0] as Record<string, unknown>)?.value
            : interruptData;

        callbacks.onEvent("approval_needed", {
          threadId: tid,
          ...(payload as Record<string, unknown>),
        });
        break;
      }

      // Normal node update processing
      for (const [nodeName, update] of Object.entries(event)) {
        if (nodeName.startsWith("__")) {
          console.log(`[runner] skipping internal key: ${nodeName}`);
          continue;
        }
        const stateUpdate = update as Record<string, unknown>;
        latestState = { ...latestState, ...stateUpdate };
        processNodeUpdate(nodeName, stateUpdate, latestState, callbacks);
      }
    }

    console.log(`[runner] stream ended. interrupted=${interrupted}`);

    if (!interrupted) {
      emitComplete(latestState, query, language, callbacks);
    }
  } catch (err) {
    callbacks.onEvent("error", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { latestState, threadId: tid, interrupted };
}

/**
 * Resume the research pipeline after human-in-the-loop approval.
 */
export async function resumeResearch(
  threadId: string,
  userInput: unknown,
  callbacks: RunnerCallbacks
): Promise<Record<string, unknown>> {
  const graph = buildGraph();
  let latestState: Record<string, unknown> = {};

  try {
    const stream = await graph.stream(new Command({ resume: userInput }), {
      streamMode: "updates",
      configurable: { thread_id: threadId },
    });

    for await (const event of stream) {
      // Process interrupt events (in case of future multi-interrupt flows)
      if (event && typeof event === "object" && "__interrupt__" in event) {
        break;
      }

      for (const [nodeName, update] of Object.entries(event)) {
        const stateUpdate = update as Record<string, unknown>;
        latestState = { ...latestState, ...stateUpdate };
        processNodeUpdate(nodeName, stateUpdate, latestState, callbacks);
      }
    }

    emitComplete(latestState, "", "", callbacks);
  } catch (err) {
    callbacks.onEvent("error", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return latestState;
}
