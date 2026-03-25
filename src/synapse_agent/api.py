"""FastAPI server — streams LangGraph pipeline progress via SSE."""

from __future__ import annotations

import json
import dataclasses
import os
import re
from typing import Any
from datetime import datetime

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from synapse_agent.config import settings, LLMProvider
from synapse_agent.graph import build_graph
from synapse_agent.state import ResearchState

app = FastAPI(title="Synapse Vault API")

RESULTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "results",
)

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


def _result_filename(query: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", query.lower())
    slug = re.sub(r"[\s]+", "-", slug.strip())[:80]
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{timestamp}_{slug}.md"


def _save_result_md(state: dict[str, Any]) -> str | None:
    article = state.get("article_draft", "")
    query = state.get("original_query", "").strip()
    if not article or not query:
        return None

    os.makedirs(RESULTS_DIR, exist_ok=True)
    filename = _result_filename(query)
    path = os.path.join(RESULTS_DIR, filename)

    header = (
        f"---\n"
        f"query: {json.dumps(query)}\n"
        f"date: {datetime.now().isoformat()}\n"
        f"provider: {getattr(settings.llm_provider, 'value', str(settings.llm_provider))}\n"
        f"model: {settings.llm_model}\n"
        f"search_results: {len(state.get('search_results', []))}\n"
        f"kg_entities: {len(state.get('kg_entities', []))}\n"
        f"search_iterations: {state.get('search_iteration', 0)}\n"
        f"revisions: {state.get('revision_count', 0)}\n"
        f"quality_scores: {json.dumps(state.get('quality_scores', {}))}\n"
        f"---\n\n"
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write(article)

    return filename


def _parse_result_md(filename: str) -> dict[str, Any] | None:
    path = os.path.join(RESULTS_DIR, filename)
    if not os.path.isfile(path) or not filename.endswith(".md"):
        return None

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    frontmatter_match = re.match(r"^---\n(.*?)\n---\n\n?(.*)$", content, re.DOTALL)
    metadata: dict[str, Any] = {}
    article = content

    if frontmatter_match:
        raw_meta, article = frontmatter_match.groups()
        for line in raw_meta.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            if key == "query":
                try:
                    metadata[key] = json.loads(value)
                except json.JSONDecodeError:
                    metadata[key] = value.strip('"')
            elif key == "quality_scores":
                try:
                    metadata[key] = json.loads(value)
                except json.JSONDecodeError:
                    metadata[key] = {}
            elif key in {"search_results", "kg_entities", "search_iterations", "revisions"}:
                try:
                    metadata[key] = int(value)
                except ValueError:
                    metadata[key] = 0
            else:
                metadata[key] = value

    timestamp = int(os.path.getmtime(path) * 1000)
    return {
        "id": filename,
        "query": metadata.get("query") or filename.rsplit(".", 1)[0],
        "timestamp": timestamp,
        "result": {
            "query": metadata.get("query") or filename.rsplit(".", 1)[0],
            "language": "en",
            "subQuestions": [],
            "searchResults": [],
            "kgEntities": [],
            "kgRelations": [],
            "article": article,
            "citations": [],
            "qualityScores": metadata.get("quality_scores", {}),
            "searchIterations": metadata.get("search_iterations", 0),
            "revisions": metadata.get("revisions", 0),
        },
    }


def _list_saved_results() -> list[dict[str, Any]]:
    if not os.path.isdir(RESULTS_DIR):
        return []

    results: list[dict[str, Any]] = []
    for filename in sorted(os.listdir(RESULTS_DIR), reverse=True):
        parsed = _parse_result_md(filename)
        if parsed:
            results.append(parsed)
    return results


def _build_complete_result(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "query": state.get("original_query", ""),
        "language": state.get("language", "en"),
        "sub_questions": _dc_to_dict(state.get("sub_questions", [])),
        "search_results": _slim_search_results(state.get("search_results", [])),
        "kg_entities": _dc_to_dict(state.get("kg_entities", [])),
        "kg_relations": _dc_to_dict(state.get("kg_relations", [])),
        "article": state.get("article_draft", ""),
        "citations": _dc_to_dict(state.get("citations", [])),
        "quality_scores": state.get("quality_scores", {}),
        "search_iterations": state.get("search_iteration", 0),
        "revisions": state.get("revision_count", 0),
    }


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
        latest_state: dict[str, Any] = dict(initial_state)
        try:
            async for event in graph.astream(initial_state, stream_mode="updates"):
                # Check if client disconnected
                if await request.is_disconnected():
                    return

                # event is {node_name: partial_state_update}
                for node_name, update in event.items():
                    latest_state.update(update)
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

            _save_result_md(latest_state)

            # Pipeline finished — send complete event with final state
            yield {"event": "stage", "data": json.dumps({"stage": "complete", "status": "running"})}
            yield {
                "event": "complete",
                "data": json.dumps({
                    "status": "done",
                    "result": _build_complete_result(latest_state),
                }),
            }

        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())


@app.get("/api/results")
async def get_results():
    return _list_saved_results()


@app.delete("/api/results")
async def delete_all_results():
    if not os.path.isdir(RESULTS_DIR):
        return JSONResponse({"deleted": 0})

    deleted = 0
    for filename in os.listdir(RESULTS_DIR):
        path = os.path.join(RESULTS_DIR, filename)
        if os.path.isfile(path) and filename.endswith(".md"):
            os.remove(path)
            deleted += 1
    return JSONResponse({"deleted": deleted})


@app.delete("/api/results/{result_id}")
async def delete_result(result_id: str):
    path = os.path.join(RESULTS_DIR, os.path.basename(result_id))
    if not os.path.isfile(path) or not result_id.endswith(".md"):
        return JSONResponse({"deleted": False}, status_code=404)

    os.remove(path)
    return JSONResponse({"deleted": True})

# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

# Fields safe to expose directly
_EXPOSED_FIELDS = {
    "llm_provider", "llm_model", "llm_temperature",
    "max_search_iterations", "max_revisions",
    "search_results_per_query", "relevance_threshold",
    "min_citations", "quality_threshold", "max_concurrent_searches",
    "azure_openai_endpoint", "azure_openai_api_version",
    "compatible_base_url",
}

# API key fields — returned masked, writable in full
_KEY_FIELDS = {
    "anthropic_api_key", "openai_api_key", "azure_openai_api_key",
    "compatible_api_key",
    "jina_api_key", "brave_api_key", "tavily_api_key",
}


def _mask_key(value: str) -> str:
    if not value or len(value) < 8:
        return "*" * len(value) if value else ""
    return value[:4] + "*" * (len(value) - 8) + value[-4:]


@app.get("/api/settings")
async def get_settings():
    data = {k: getattr(settings, k) for k in _EXPOSED_FIELDS}
    for k in _KEY_FIELDS:
        data[k] = _mask_key(getattr(settings, k, ""))
    return data


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
    # Provider-specific
    azure_openai_endpoint: str | None = None
    azure_openai_api_version: str | None = None
    compatible_base_url: str | None = None
    # API keys
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    azure_openai_api_key: str | None = None
    compatible_api_key: str | None = None
    jina_api_key: str | None = None
    brave_api_key: str | None = None
    tavily_api_key: str | None = None


@app.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    updates = body.model_dump(exclude_none=True)
    all_writable = _EXPOSED_FIELDS | _KEY_FIELDS
    for key, value in updates.items():
        if key not in all_writable:
            continue
        # Skip masked key values (user didn't change them)
        if key in _KEY_FIELDS and "*" in str(value):
            continue
        if key == "llm_provider":
            value = LLMProvider(value)
        setattr(settings, key, value)
    data = {k: getattr(settings, k) for k in _EXPOSED_FIELDS}
    for k in _KEY_FIELDS:
        data[k] = _mask_key(getattr(settings, k, ""))
    return data


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    uvicorn.run("synapse_agent.api:app", host="0.0.0.0", port=8000, reload=True)
