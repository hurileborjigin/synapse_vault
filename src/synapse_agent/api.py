"""FastAPI server — streams LangGraph pipeline progress via SSE."""

from __future__ import annotations

import json
import dataclasses
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from synapse_agent.config import settings, LLMProvider
from synapse_agent.graph import build_graph
from synapse_agent.state import ResearchState

app = FastAPI(title="Synapse Vault API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Map LangGraph node names to frontend stage names
NODE_TO_STAGE = {
    "query_analyzer": "analyzing",
    "searcher": "searching",
    "ranker": "ranking",
    "knowledge_graph": "knowledge_graph",
    "synthesizer": "synthesizing",
    "quality_gate": "quality_check",
}


def _dc_to_dict(obj: Any) -> Any:
    """Convert dataclass instances (and lists of them) to plain dicts."""
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    if isinstance(obj, list):
        return [_dc_to_dict(item) for item in obj]
    return obj


def _slim_search_results(results: list) -> list[dict]:
    """Strip heavy `content` field from search results for SSE payloads."""
    out = []
    for r in results:
        d = _dc_to_dict(r)
        if isinstance(d, dict):
            d.pop("content", None)
        out.append(d)
    return out


# ---------------------------------------------------------------------------
# SSE research endpoint
# ---------------------------------------------------------------------------

class ResearchRequest(BaseModel):
    query: str
    language: str = "en"


@app.post("/api/research")
async def research(req: ResearchRequest, request: Request):
    graph = build_graph()

    initial_state: ResearchState = {
        "task_id": 0,
        "original_query": req.query,
        "language": req.language,
        "domain": "general",
        "sub_questions": [],
        "search_iteration": 0,
        "max_iterations": settings.max_search_iterations,
        "search_results": [],
        "seen_urls": set(),
        "kg_entities": [],
        "kg_relations": [],
        "knowledge_gaps": [],
        "article_draft": "",
        "citations": [],
        "quality_scores": {},
        "quality_feedback": "",
        "quality_passed": False,
        "revision_count": 0,
    }

    async def event_generator():
        try:
            async for event in graph.astream(initial_state, stream_mode="updates"):
                # Check if client disconnected
                if await request.is_disconnected():
                    return

                # event is {node_name: partial_state_update}
                for node_name, update in event.items():
                    stage = NODE_TO_STAGE.get(node_name)
                    if not stage:
                        continue

                    # Emit stage change
                    yield {"event": "stage", "data": json.dumps({"stage": stage, "status": "running"})}

                    # Emit node-specific data
                    if node_name == "query_analyzer":
                        sub_qs = _dc_to_dict(update.get("sub_questions", []))
                        yield {"event": "sub_questions", "data": json.dumps({"sub_questions": sub_qs})}

                    elif node_name == "searcher":
                        yield {
                            "event": "search_results",
                            "data": json.dumps({
                                "search_results": _slim_search_results(update.get("search_results", [])),
                                "search_iteration": update.get("search_iteration", 0),
                            }),
                        }

                    elif node_name == "ranker":
                        yield {
                            "event": "ranking",
                            "data": json.dumps({
                                "search_results": _slim_search_results(update.get("search_results", [])),
                            }),
                        }

                    elif node_name == "knowledge_graph":
                        yield {
                            "event": "knowledge_graph",
                            "data": json.dumps({
                                "kg_entities": _dc_to_dict(update.get("kg_entities", [])),
                                "kg_relations": _dc_to_dict(update.get("kg_relations", [])),
                                "knowledge_gaps": update.get("knowledge_gaps", []),
                            }),
                        }

                    elif node_name == "synthesizer":
                        yield {
                            "event": "synthesis",
                            "data": json.dumps({
                                "article": update.get("article_draft", ""),
                                "citations": _dc_to_dict(update.get("citations", [])),
                            }),
                        }

                    elif node_name == "quality_gate":
                        yield {
                            "event": "quality",
                            "data": json.dumps({
                                "quality_scores": update.get("quality_scores", {}),
                                "quality_passed": update.get("quality_passed", False),
                                "revision_count": update.get("revision_count", 0),
                            }),
                        }

            # Pipeline finished — send complete event with final state
            yield {"event": "stage", "data": json.dumps({"stage": "complete", "status": "running"})}
            yield {"event": "complete", "data": json.dumps({"status": "done"})}

        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())

# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

# Fields safe to expose (no API keys)
_EXPOSED_FIELDS = {
    "llm_provider", "llm_model", "llm_temperature",
    "max_search_iterations", "max_revisions",
    "search_results_per_query", "relevance_threshold",
    "min_citations", "quality_threshold", "max_concurrent_searches",
}


@app.get("/api/settings")
async def get_settings():
    return {k: getattr(settings, k) for k in _EXPOSED_FIELDS}


class SettingsUpdate(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_temperature: float | None = None
    max_search_iterations: int | None = None
    max_revisions: int | None = None
    search_results_per_query: int | None = None
    relevance_threshold: float | None = None
    min_citations: int | None = None
    quality_threshold: float | None = None
    max_concurrent_searches: int | None = None


@app.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    updates = body.model_dump(exclude_none=True)
    for key, value in updates.items():
        if key in _EXPOSED_FIELDS:
            if key == "llm_provider":
                value = LLMProvider(value)
            setattr(settings, key, value)
    return {k: getattr(settings, k) for k in _EXPOSED_FIELDS}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    uvicorn.run("synapse_agent.api:app", host="0.0.0.0", port=8000, reload=True)

