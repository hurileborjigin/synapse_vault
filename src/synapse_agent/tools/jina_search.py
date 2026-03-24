"""Jina Search API — primary search provider."""

from __future__ import annotations

import httpx

from synapse_agent.config import settings
from synapse_agent.state import SearchResult


async def jina_search(query: str, num_results: int = 5) -> list[SearchResult]:
    """Search via Jina Search API. Returns structured results."""
    if not settings.jina_api_key:
        return []

    headers = {
        "Authorization": f"Bearer {settings.jina_api_key}",
        "Accept": "application/json",
        "X-Retain-Images": "none",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(
                f"https://s.jina.ai/{query}",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

    results = []
    for item in data.get("data", [])[:num_results]:
        results.append(SearchResult(
            url=item.get("url", ""),
            title=item.get("title", ""),
            snippet=item.get("description", item.get("content", "")[:500]),
            content=item.get("content", ""),
            source_query=query,
        ))
    return results
