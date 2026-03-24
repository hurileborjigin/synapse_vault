"""Searcher — cascading web search across multiple providers."""

from __future__ import annotations

import asyncio

from synapse_agent.config import settings
from synapse_agent.state import ResearchState, SearchResult
from synapse_agent.tools.jina_search import jina_search
from synapse_agent.tools.brave_search import brave_search
from synapse_agent.tools.tavily_search import tavily_search
from synapse_agent.tools.jina_reader import fetch_page_content


async def _cascade_search(query: str, num_results: int = 5) -> list[SearchResult]:
    """Try Jina → Brave → Tavily until we get results."""
    results = await jina_search(query, num_results)
    if results:
        return results
    results = await brave_search(query, num_results)
    if results:
        return results
    return await tavily_search(query, num_results)


async def _search_single_query(query: str, seen_urls: set[str]) -> list[SearchResult]:
    """Search a single query and filter out already-seen URLs."""
    results = await _cascade_search(query, settings.search_results_per_query)
    return [r for r in results if r.url and r.url not in seen_urls]


async def searcher(state: ResearchState) -> dict:
    """Execute searches for all pending sub-questions and knowledge gaps."""
    seen_urls = set(state.get("seen_urls", set()))

    # Collect all search queries
    all_queries: list[str] = []

    # From sub-questions that haven't been answered yet
    for sq in state.get("sub_questions", []):
        if not sq.answered:
            all_queries.extend(sq.search_queries)

    # From knowledge gaps (iterations > 0)
    for gap in state.get("knowledge_gaps", []):
        all_queries.append(gap)

    if not all_queries:
        all_queries = [state["original_query"]]

    # Run searches concurrently with semaphore
    sem = asyncio.Semaphore(settings.max_concurrent_searches)

    async def _bounded_search(q: str) -> list[SearchResult]:
        async with sem:
            return await _search_single_query(q, seen_urls)

    tasks = [_bounded_search(q) for q in all_queries]
    results_lists = await asyncio.gather(*tasks)

    # Flatten and dedup
    new_results: list[SearchResult] = []
    new_urls: set[str] = set()
    for result_list in results_lists:
        for r in result_list:
            if r.url not in seen_urls and r.url not in new_urls:
                new_results.append(r)
                new_urls.add(r.url)

    # Fetch full content for top results via Jina Reader
    # Only fetch for results that don't already have content
    to_fetch = [r for r in new_results if not r.content][:20]

    async def _fetch_content(result: SearchResult) -> None:
        async with sem:
            content = await fetch_page_content(result.url)
            if content:
                result.content = content[:15000]  # Cap content length

    if to_fetch:
        await asyncio.gather(*[_fetch_content(r) for r in to_fetch])

    return {
        "search_results": new_results,
        "seen_urls": new_urls,
        "search_iteration": state.get("search_iteration", 0) + 1,
    }
