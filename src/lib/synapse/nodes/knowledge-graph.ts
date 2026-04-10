/**
 * Knowledge Graph — entity extraction, relation building, gap analysis.
 * Port of Python's nodes/knowledge_graph.py
 * Uses graphology instead of NetworkX.
 */

import Graph from "graphology";
import { getLLM, getSettings } from "../config";
import type { ResearchStateType } from "../state";
import type { KGEntity, KGRelation } from "../types";

const EXTRACT_PROMPT = `You are an entity/relation extractor for building a knowledge graph.
Given search result content about a research topic, extract key entities and their relationships.

Respond with valid JSON only:
{
  "entities": [
    {"name": "Entity Name", "type": "person|org|concept|event|technology|location|other", "description": "brief description"}
  ],
  "relations": [
    {"source": "Entity A", "target": "Entity B", "relation": "relationship type", "evidence": "brief supporting text"}
  ]
}

Extract 5-15 entities and 5-20 relations. Focus on the most important facts.`;

const GAP_PROMPT = `You are a research gap analyzer. Given:
1. The original research query and sub-questions
2. A summary of what the knowledge graph currently covers

Identify 2-5 specific knowledge gaps — topics or questions NOT yet covered that are important for a comprehensive answer.

Respond with valid JSON only:
{"gaps": ["gap description 1", "gap description 2", ...]}

If coverage is sufficient, respond: {"gaps": []}`;

function extractJSON(text: string): string {
  if (text.includes("```")) {
    const parts = text.split("```");
    let inner = parts[1] ?? "";
    if (inner.startsWith("json")) inner = inner.slice(4);
    return inner.trim();
  }
  return text.trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size)
  );
}

export async function knowledgeGraph(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  const llm = await getLLM("analyzer");
  const settings = getSettings();
  const searchResults = state.searchResults ?? [];
  const threshold = settings.relevanceThreshold;

  // Filter to relevant results with content
  let relevant = searchResults.filter(
    (r) => r.content && r.relevanceScore >= threshold
  );
  if (relevant.length === 0) {
    relevant = searchResults.filter((r) => r.content).slice(0, 10);
  }

  // Extract entities/relations from content batches
  const allEntities: KGEntity[] = [...(state.kgEntities ?? [])];
  const allRelations: KGRelation[] = [...(state.kgRelations ?? [])];

  // Process in batches of 3, cap at 5 batches
  const batches = chunk(relevant, 3).slice(0, 5);

  for (const batch of batches) {
    const combinedContent = batch
      .map((r) => `Source: ${r.title} (${r.url})\n${r.content.slice(0, 3000)}`)
      .join("\n\n---\n\n");

    const prompt = `Research topic: ${state.originalQuery}\n\nContent:\n${combinedContent}`;

    try {
      const response = await llm.invoke([
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: prompt },
      ]);

      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const data = JSON.parse(extractJSON(text));

      for (const e of data.entities ?? []) {
        allEntities.push({
          name: e.name,
          entityType: e.type ?? "other",
          description: e.description ?? "",
        });
      }
      for (const r of data.relations ?? []) {
        allRelations.push({
          source: r.source,
          target: r.target,
          relation: r.relation,
          evidence: r.evidence ?? "",
        });
      }
    } catch {
      continue;
    }
  }

  // Build graphology graph for gap analysis
  const graph = new Graph();
  for (const entity of allEntities) {
    if (!graph.hasNode(entity.name)) {
      graph.addNode(entity.name, { type: entity.entityType });
    }
  }
  for (const rel of allRelations) {
    if (graph.hasNode(rel.source) && graph.hasNode(rel.target)) {
      try {
        graph.addEdge(rel.source, rel.target, { relation: rel.relation });
      } catch {
        // graphology throws on duplicate edges — ignore
      }
    }
  }

  // Gap analysis via LLM
  const entityNames = allEntities.map((e) => e.name);
  const subQText = (state.subQuestions ?? [])
    .map((sq) => `- ${sq.question}`)
    .join("\n");

  // Count connected components
  let componentCount = 0;
  const visited = new Set<string>();
  graph.forEachNode((node) => {
    if (!visited.has(node)) {
      componentCount++;
      // BFS
      const queue = [node];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        graph.forEachNeighbor(current, (neighbor) => {
          if (!visited.has(neighbor)) queue.push(neighbor);
        });
      }
    }
  });

  const kgSummary = [
    `Entities (${allEntities.length}): ${entityNames.slice(0, 30).join(", ")}`,
    `Relations (${allRelations.length}): ${allRelations.length} connections`,
    `Graph components: ${componentCount}`,
  ].join("\n");

  const gapPrompt = [
    `Research query: ${state.originalQuery}`,
    `\nSub-questions:\n${subQText}`,
    `\nCurrent KG coverage:\n${kgSummary}`,
  ].join("\n");

  let knowledgeGaps: string[] = [];
  try {
    const response = await llm.invoke([
      { role: "system", content: GAP_PROMPT },
      { role: "user", content: gapPrompt },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const gapData = JSON.parse(extractJSON(text));
    knowledgeGaps = gapData.gaps ?? [];
  } catch {
    // No gaps on failure
  }

  return {
    kgEntities: allEntities,
    kgRelations: allRelations,
    knowledgeGaps,
  };
}
