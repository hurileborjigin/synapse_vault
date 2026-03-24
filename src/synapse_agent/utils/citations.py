"""Citation manager — URL tracking, reference numbering, deduplication."""

from __future__ import annotations

from synapse_agent.state import Citation, SearchResult


class CitationManager:
    """Manages citations from search results. Only allows citing URLs that were
    actually found during search (whitelist enforcement)."""

    def __init__(self, search_results: list[SearchResult]):
        self._url_to_result: dict[str, SearchResult] = {}
        for r in search_results:
            if r.url and r.url not in self._url_to_result:
                self._url_to_result[r.url] = r

        self._citations: list[Citation] = []
        self._url_to_index: dict[str, int] = {}

    @property
    def whitelist(self) -> set[str]:
        return set(self._url_to_result.keys())

    def get_or_create(self, url: str) -> Citation | None:
        """Get existing citation or create a new one. Returns None if URL not in whitelist."""
        if url not in self._url_to_result:
            return None

        if url in self._url_to_index:
            return self._citations[self._url_to_index[url]]

        idx = len(self._citations) + 1
        result = self._url_to_result[url]
        citation = Citation(
            index=idx,
            url=url,
            title=result.title,
            snippet=result.snippet[:200],
        )
        self._citations.append(citation)
        self._url_to_index[url] = len(self._citations) - 1
        return citation

    def get_all(self) -> list[Citation]:
        return list(self._citations)

    def format_reference_list(self) -> str:
        """Format the numbered reference list for appending to the article."""
        if not self._citations:
            return ""
        lines = []
        for c in self._citations:
            lines.append(f"[{c.index}] {c.title}. {c.url}")
        return "\n".join(lines)

    def build_url_mapping_prompt(self) -> str:
        """Build a prompt section listing available URLs for the LLM to cite."""
        lines = []
        # Sort by relevance score (highest first)
        sorted_results = sorted(
            self._url_to_result.values(),
            key=lambda r: r.relevance_score,
            reverse=True,
        )
        for i, r in enumerate(sorted_results[:60]):
            preview = r.snippet[:150] if r.snippet else ""
            lines.append(f"URL_{i+1}: {r.url}\n  Title: {r.title}\n  Preview: {preview}")
        return "\n\n".join(lines)
