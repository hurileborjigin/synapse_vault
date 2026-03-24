"""LangGraph state schema for the research workflow."""

from __future__ import annotations

import operator
from dataclasses import dataclass, field
from typing import Annotated, TypedDict


@dataclass
class SubQuestion:
    question: str
    priority: int = 1  # 1=highest
    answered: bool = False
    search_queries: list[str] = field(default_factory=list)


@dataclass
class SearchResult:
    url: str
    title: str
    snippet: str
    content: str = ""  # Full page content from Jina Reader
    relevance_score: float = 0.0
    source_query: str = ""


@dataclass
class KGEntity:
    name: str
    entity_type: str
    description: str = ""


@dataclass
class KGRelation:
    source: str
    target: str
    relation: str
    evidence: str = ""


@dataclass
class Citation:
    index: int
    url: str
    title: str
    snippet: str = ""


def _merge_sets(a: set[str], b: set[str]) -> set[str]:
    return a | b


class ResearchState(TypedDict):
    task_id: int
    original_query: str
    language: str  # "zh" or "en"
    domain: str

    sub_questions: list[SubQuestion]
    search_iteration: int
    max_iterations: int  # default 3

    search_results: Annotated[list[SearchResult], operator.add]
    seen_urls: Annotated[set[str], _merge_sets]

    kg_entities: list[KGEntity]
    kg_relations: list[KGRelation]
    knowledge_gaps: list[str]

    article_draft: str
    citations: list[Citation]

    quality_scores: dict
    quality_feedback: str
    quality_passed: bool
    revision_count: int
