"""Tavily Search — final fallback search provider."""

from __future__ import annotations

from synapse_agent.config import settings
from synapse_agent.state import SearchResult


async def tavily_search(query: str, num_results: int = 5) -> list[SearchResult]:
    """Search via Tavily API."""
    if not settings.tavily_api_key:
        return []

    try:
        from tavily import AsyncTavilyClient
        client = AsyncTavilyClient(api_key=settings.tavily_api_key)
        response = await client.search(
            query=query,
            max_results=num_results,
            include_raw_content=True,
        )
    except Exception:
        return []

    results = []
    for item in response.get("results", [])[:num_results]:
        results.append(SearchResult(
            url=item.get("url", ""),
            title=item.get("title", ""),
            snippet=item.get("content", ""),
            content=item.get("raw_content", ""),
            source_query=query,
        ))
    return results
