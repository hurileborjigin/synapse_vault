/**
 * LangGraph workflow definition — wires all nodes with conditional edges.
 * Port of Python's graph.py
 */

import { END, StateGraph } from "@langchain/langgraph";
import { getSettings } from "./config";
import { ResearchState, type ResearchStateType } from "./state";

import { queryAnalyzer } from "./nodes/query-analyzer";
import { searcher } from "./nodes/searcher";
import { ranker } from "./nodes/ranker";
import { knowledgeGraph } from "./nodes/knowledge-graph";
import { synthesizer } from "./nodes/synthesizer";
import { qualityGate } from "./nodes/quality-gate";

// ---------------------------------------------------------------------------
// Conditional edge functions
// ---------------------------------------------------------------------------

function shouldContinueSearching(
  state: ResearchStateType
): "search_more" | "synthesize" {
  const settings = getSettings();
  const gaps = state.knowledgeGaps ?? [];
  const iteration = state.searchIteration ?? 0;

  if (gaps.length > 0 && iteration < settings.maxSearchIterations) {
    return "search_more";
  }
  return "synthesize";
}

function shouldRevise(state: ResearchStateType): "revise" | "done" {
  if (state.qualityPassed) {
    return "done";
  }
  return "revise";
}

// ---------------------------------------------------------------------------
// Build and compile the graph
// ---------------------------------------------------------------------------

export function buildGraph() {
  const workflow = new StateGraph(ResearchState)
    // Add nodes
    .addNode("query_analyzer", queryAnalyzer)
    .addNode("searcher", searcher)
    .addNode("ranker", ranker)
    .addNode("knowledge_graph", knowledgeGraph)
    .addNode("synthesizer", synthesizer)
    .addNode("quality_gate", qualityGate)

    // Linear edges
    .addEdge("__start__", "query_analyzer")
    .addEdge("query_analyzer", "searcher")
    .addEdge("searcher", "ranker")
    .addEdge("ranker", "knowledge_graph")

    // Conditional: after KG, either search more or synthesize
    .addConditionalEdges("knowledge_graph", shouldContinueSearching, {
      search_more: "searcher",
      synthesize: "synthesizer",
    })

    // After synthesis, evaluate quality
    .addEdge("synthesizer", "quality_gate")

    // Conditional: after quality gate, either revise or finish
    .addConditionalEdges("quality_gate", shouldRevise, {
      revise: "synthesizer",
      done: END,
    });

  return workflow.compile();
}
