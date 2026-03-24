"""Brave Search API — fallback search provider."""

from __future__ import annotations

import httpx

from synapse_agent.config import settings
from synapse_agent.state import SearchResult


async def brave_search(query: str, num_results: int = 5) -> list[SearchResult]:
    """Search via Brave Search API."""
    if not settings.brave_api_key:
        return []

    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": settings.brave_api_key,
    }
    params = {"q": query, "count": num_results}

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

    results = []
    for item in data.get("web", {}).get("results", [])[:num_results]:
        results.append(SearchResult(
            url=item.get("url", ""),
            title=item.get("title", ""),
            snippet=item.get("description", ""),
            source_query=query,
        ))
    return results
