"""Knowledge Graph — entity extraction, relation building, gap analysis."""

from __future__ import annotations

import json

import networkx as nx
from langchain_core.messages import HumanMessage, SystemMessage

from synapse_agent.config import settings
from synapse_agent.state import KGEntity, KGRelation, ResearchState

EXTRACT_PROMPT = """You are an entity/relation extractor for building a knowledge graph.
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

Extract 5-15 entities and 5-20 relations. Focus on the most important facts."""

GAP_PROMPT = """You are a research gap analyzer. Given:
1. The original research query and sub-questions
2. A summary of what the knowledge graph currently covers

Identify 2-5 specific knowledge gaps — topics or questions NOT yet covered that are important for a comprehensive answer.

Respond with valid JSON only:
{"gaps": ["gap description 1", "gap description 2", ...]}

If coverage is sufficient, respond: {"gaps": []}"""


async def knowledge_graph(state: ResearchState) -> dict:
    """Extract entities/relations from search results, build KG, analyze gaps."""
    llm = settings.get_llm("analyzer")
    search_results = state.get("search_results", [])
    threshold = settings.relevance_threshold

    # Filter to relevant results with content
    relevant = [
        r for r in search_results
        if r.content and r.relevance_score >= threshold
    ]
    if not relevant:
        relevant = [r for r in search_results if r.content][:10]

    # Extract entities/relations from content batches
    all_entities: list[KGEntity] = list(state.get("kg_entities", []))
    all_relations: list[KGRelation] = list(state.get("kg_relations", []))

    # Process in batches of 3 results
    batch_size = 3
    batches = [relevant[i:i + batch_size] for i in range(0, len(relevant), batch_size)]

    for batch in batches[:5]:  # Cap at 5 batches
        combined_content = "\n\n---\n\n".join(
            f"Source: {r.title} ({r.url})\n{r.content[:3000]}" for r in batch
        )
        prompt = f"Research topic: {state['original_query']}\n\nContent:\n{combined_content}"

        try:
            response = await llm.ainvoke([
                SystemMessage(content=EXTRACT_PROMPT),
                HumanMessage(content=prompt),
            ])
            text = response.content
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            data = json.loads(text)

            for e in data.get("entities", []):
                all_entities.append(KGEntity(
                    name=e["name"],
                    entity_type=e.get("type", "other"),
                    description=e.get("description", ""),
                ))
            for r in data.get("relations", []):
                all_relations.append(KGRelation(
                    source=r["source"],
                    target=r["target"],
                    relation=r["relation"],
                    evidence=r.get("evidence", ""),
                ))
        except Exception:
            continue

    # Build NetworkX graph for gap analysis
    G = nx.DiGraph()
    for e in all_entities:
        G.add_node(e.name, type=e.entity_type, description=e.description)
    for r in all_relations:
        G.add_edge(r.source, r.target, relation=r.relation, evidence=r.evidence)

    # Gap analysis
    entity_names = [e.name for e in all_entities]
    sub_q_text = "\n".join(f"- {sq.question}" for sq in state.get("sub_questions", []))
    kg_summary = (
        f"Entities ({len(all_entities)}): {', '.join(entity_names[:30])}\n"
        f"Relations ({len(all_relations)}): {len(all_relations)} connections\n"
        f"Graph components: {nx.number_weakly_connected_components(G)}"
    )

    gap_prompt = (
        f"Research query: {state['original_query']}\n\n"
        f"Sub-questions:\n{sub_q_text}\n\n"
        f"Current KG coverage:\n{kg_summary}"
    )

    knowledge_gaps: list[str] = []
    try:
        response = await llm.ainvoke([
            SystemMessage(content=GAP_PROMPT),
            HumanMessage(content=gap_prompt),
        ])
        text = response.content
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        gap_data = json.loads(text)
        knowledge_gaps = gap_data.get("gaps", [])
    except Exception:
        pass

    return {
        "kg_entities": all_entities,
        "kg_relations": all_relations,
        "knowledge_gaps": knowledge_gaps,
    }
