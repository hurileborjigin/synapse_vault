"""Ranker — LLM-based relevance ranking of search results."""

from __future__ import annotations

import asyncio
import json

from langchain_core.messages import HumanMessage, SystemMessage

from synapse_agent.config import settings
from synapse_agent.state import ResearchState, SearchResult

SYSTEM_PROMPT = """You are a relevance ranker. Given a research query and a batch of search results, score each result's relevance from 0 to 10.

Respond with valid JSON only — an array of objects:
[{"index": 0, "score": 8.5}, {"index": 1, "score": 3.0}, ...]

Score criteria:
- 9-10: Directly answers a core aspect of the query with authoritative content
- 7-8: Highly relevant, provides useful supporting information
- 5-6: Somewhat relevant, tangential information
- 3-4: Marginally relevant
- 0-2: Irrelevant"""


async def ranker(state: ResearchState) -> dict:
    """Rank search results by relevance and filter low-scoring ones."""
    all_results = state.get("search_results", [])
    if not all_results:
        return {}

    # Only rank results from the latest search iteration (unranked ones with score 0)
    unranked = [r for r in all_results if r.relevance_score == 0.0]
    if not unranked:
        return {}

    llm = settings.get_llm("searcher")
    threshold = settings.relevance_threshold

    # Batch into groups of 10 for ranking
    batch_size = 10
    batches = [unranked[i:i + batch_size] for i in range(0, len(unranked), batch_size)]

    async def _rank_batch(batch: list[SearchResult]) -> None:
        summaries = []
        for i, r in enumerate(batch):
            preview = r.content[:500] if r.content else r.snippet
            summaries.append(f"[{i}] Title: {r.title}\nURL: {r.url}\nContent: {preview}")

        prompt = f"Research query: {state['original_query']}\n\nSearch results:\n" + "\n\n".join(summaries)

        try:
            response = await llm.ainvoke([
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])
            text = response.content
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            scores = json.loads(text)
            for item in scores:
                idx = item.get("index", -1)
                if 0 <= idx < len(batch):
                    batch[idx].relevance_score = float(item.get("score", 0))
        except Exception:
            # On failure, give all results a passing score so we don't lose them
            for r in batch:
                r.relevance_score = 6.0

    await asyncio.gather(*[_rank_batch(b) for b in batches])

    # Scores are set in-place on the SearchResult dataclass objects.
    # search_results uses operator.add reducer so we can't replace the list,
    # but the mutations persist since dataclasses are mutable references.
    return {"search_results": []}
