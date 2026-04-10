/**
 * Knowledge Graph — entity extraction, relation building, gap analysis,
 * entity coverage evaluation, and grounding context generation.
 * Uses graphology for topology analysis.
 */

import Graph from "graphology";
import { getLLM, getSettings } from "../config";
import type { ResearchStateType } from "../state";
import type { KGEntity, KGRelation, SearchResult } from "../types";

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

const GUIDED_QUERY_PROMPT = `Given these knowledge gaps and the existing entity/relation structure, generate 2-3 specific search queries per gap that would fill the missing information. Make queries precise and searchable.

Return JSON only: {"queries": ["query1", "query2", ...]}`;

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

// ---------------------------------------------------------------------------
// Entity coverage evaluation
// ---------------------------------------------------------------------------

function computeEntityCoverage(
  entities: KGEntity[],
  searchResults: SearchResult[]
): Record<string, number> {
  const coverage: Record<string, number> = {};
  for (const entity of entities) {
    const nameLower = entity.name.toLowerCase();
    let mentions = 0;
    for (const r of searchResults) {
      const text = ((r.content || "") + " " + r.snippet).toLowerCase();
      if (text.includes(nameLower)) mentions++;
    }
    // Normalize: 0 mentions = 0, 5+ mentions = 1.0
    coverage[entity.name] = Math.min(mentions / 5, 1.0);
  }
  return coverage;
}

// ---------------------------------------------------------------------------
// Topology-based gap analysis
// ---------------------------------------------------------------------------

function topologyBasedGaps(
  graph: Graph,
  entities: KGEntity[],
  coverage: Record<string, number>
): string[] {
  const gaps: string[] = [];

  // 1. Isolated nodes with low coverage → under-researched
  graph.forEachNode((node) => {
    if (graph.degree(node) === 0 && (coverage[node] ?? 0) < 0.3) {
      const entity = entities.find((e) => e.name === node);
      if (entity) {
        gaps.push(
          `Under-researched isolated concept: "${node}" (${entity.entityType}) — needs more sources about its relationships`
        );
      }
    }
  });

  // 2. High-degree nodes with low coverage → important but under-sourced
  graph.forEachNode((node) => {
    if (graph.degree(node) >= 3 && (coverage[node] ?? 0) < 0.4) {
      gaps.push(
        `Central concept "${node}" has many connections but insufficient source coverage`
      );
    }
  });

  return gaps.slice(0, 5);
}

// ---------------------------------------------------------------------------
// KG context generation for synthesizer grounding
// ---------------------------------------------------------------------------

function generateKGContext(
  entities: KGEntity[],
  relations: KGRelation[],
  coverage: Record<string, number>,
  graph: Graph
): string {
  const sections: string[] = [];

  // Group entities by type
  const byType = new Map<string, KGEntity[]>();
  for (const e of entities) {
    const list = byType.get(e.entityType) || [];
    list.push(e);
    byType.set(e.entityType, list);
  }

  sections.push("## Knowledge Structure\n");

  for (const [type, entityList] of byType) {
    sections.push(`### ${type}s`);
    for (const e of entityList.slice(0, 10)) {
      const cov = coverage[e.name] ?? 0;
      const degree = graph.hasNode(e.name) ? graph.degree(e.name) : 0;
      sections.push(
        `- **${e.name}**: ${e.description} [coverage: ${(cov * 100).toFixed(0)}%, connections: ${degree}]`
      );
    }
  }

  sections.push("\n### Key Relationships");
  for (const r of relations.slice(0, 20)) {
    sections.push(
      `- ${r.source} —[${r.relation}]→ ${r.target}${r.evidence ? `: ${r.evidence}` : ""}`
    );
  }

  // Highlight under-covered areas
  const underCovered = entities.filter(
    (e) => (coverage[e.name] ?? 0) < 0.3
  );
  if (underCovered.length > 0) {
    sections.push("\n### Areas Needing More Depth");
    for (const e of underCovered.slice(0, 8)) {
      sections.push(
        `- ${e.name}: Only ~${Math.round((coverage[e.name] ?? 0) * 5)} sources mention this concept`
      );
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// KG-guided query generation
// ---------------------------------------------------------------------------

async function generateKGGuidedQueries(
  llm: Awaited<ReturnType<typeof getLLM>>,
  gaps: string[],
  entities: KGEntity[],
  relations: KGRelation[]
): Promise<string[]> {
  if (gaps.length === 0) return [];

  const prompt = [
    `Knowledge gaps to fill:\n${gaps.map((g) => `- ${g}`).join("\n")}`,
    `\nExisting entities: ${entities
      .slice(0, 20)
      .map((e) => e.name)
      .join(", ")}`,
    `\nExisting relations: ${relations
      .slice(0, 15)
      .map((r) => `${r.source}→${r.relation}→${r.target}`)
      .join(", ")}`,
  ].join("\n");

  try {
    const response = await llm.invoke([
      { role: "system", content: GUIDED_QUERY_PROMPT },
      { role: "user", content: prompt },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const data = JSON.parse(extractJSON(text));
    return (data.queries ?? []).slice(0, 10);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Connected components (BFS)
// ---------------------------------------------------------------------------

function countComponents(graph: Graph): number {
  let componentCount = 0;
  const visited = new Set<string>();
  graph.forEachNode((node) => {
    if (!visited.has(node)) {
      componentCount++;
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
  return componentCount;
}

// ---------------------------------------------------------------------------
// Main node
// ---------------------------------------------------------------------------

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
      .map(
        (r) => `Source: ${r.title} (${r.url})\n${r.content.slice(0, 3000)}`
      )
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

  // Build graphology graph
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

  // --- NEW: Entity coverage evaluation ---
  const entityCoverage = computeEntityCoverage(allEntities, searchResults);

  // Annotate entities with coverage scores
  for (const entity of allEntities) {
    entity.coverageScore = entityCoverage[entity.name] ?? 0;
  }

  // --- NEW: Topology-based gaps (complement LLM gap analysis) ---
  const topoGaps = topologyBasedGaps(graph, allEntities, entityCoverage);

  // LLM gap analysis
  const entityNames = allEntities.map((e) => e.name);
  const subQText = (state.subQuestions ?? [])
    .map((sq) => `- ${sq.question}`)
    .join("\n");

  const componentCount = countComponents(graph);

  const kgSummary = [
    `Entities (${allEntities.length}): ${entityNames.slice(0, 30).join(", ")}`,
    `Relations (${allRelations.length}): ${allRelations.length} connections`,
    `Graph components: ${componentCount}`,
    topoGaps.length > 0
      ? `\nTopology issues:\n${topoGaps.map((g) => `- ${g}`).join("\n")}`
      : "",
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
    knowledgeGaps = [...(gapData.gaps ?? []), ...topoGaps].slice(0, 7);
  } catch {
    knowledgeGaps = topoGaps;
  }

  // --- NEW: Generate KG grounding context ---
  const kgContext = generateKGContext(
    allEntities,
    allRelations,
    entityCoverage,
    graph
  );

  // --- NEW: Generate KG-guided search queries ---
  const kgGuidedQueries = await generateKGGuidedQueries(
    llm,
    knowledgeGaps,
    allEntities,
    allRelations
  );

  return {
    kgEntities: allEntities,
    kgRelations: allRelations,
    knowledgeGaps,
    kgContext,
    entityCoverage,
    kgGuidedQueries,
  };
}
