"""Jina Reader — full-page content fetching."""

from __future__ import annotations

import httpx

from synapse_agent.config import settings


async def fetch_page_content(url: str) -> str:
    """Fetch full page content via Jina Reader API. Returns markdown text."""
    headers: dict[str, str] = {
        "Accept": "application/json",
        "X-Retain-Images": "none",
    }
    if settings.jina_api_key:
        headers["Authorization"] = f"Bearer {settings.jina_api_key}"

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        try:
            resp = await client.get(
                f"https://r.jina.ai/{url}",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("content", "")
        except Exception:
            return ""
