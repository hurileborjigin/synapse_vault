"""CLI entry point: load queries, run the research graph, write JSONL output."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from synapse_agent.config import settings
from synapse_agent.graph import build_graph
from synapse_agent.state import ResearchState
from synapse_agent.utils.output import format_output_line


async def run_single_query(graph, query: dict) -> dict:
    """Run the research pipeline on a single query and return the output dict."""
    initial_state: ResearchState = {
        "task_id": query["id"],
        "original_query": query["prompt"],
        "language": query.get("language", "en"),
        "domain": query.get("topic", "general"),
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

    final_state = await graph.ainvoke(initial_state)
    return format_output_line(
        task_id=query["id"],
        prompt=query["prompt"],
        article=final_state["article_draft"],
    )


async def run_all(
    query_file: Path,
    output_file: Path,
    query_ids: list[int] | None = None,
):
    graph = build_graph()

    queries = []
    with open(query_file) as f:
        for line in f:
            q = json.loads(line.strip())
            if query_ids is None or q["id"] in query_ids:
                queries.append(q)

    # Load already-processed IDs for resumability
    done_ids: set[int] = set()
    if output_file.exists():
        with open(output_file) as f:
            for line in f:
                done_ids.add(json.loads(line.strip())["id"])

    remaining = [q for q in queries if q["id"] not in done_ids]
    print(f"Total queries: {len(queries)}, already done: {len(done_ids)}, remaining: {len(remaining)}")

    with open(output_file, "a") as out:
        for i, query in enumerate(remaining):
            print(f"\n[{i+1}/{len(remaining)}] Processing query {query['id']}: {query['prompt'][:80]}...")
            try:
                result = await run_single_query(graph, query)
                out.write(json.dumps(result, ensure_ascii=False) + "\n")
                out.flush()
                print(f"  Done. Article length: {len(result['article'])} chars")
            except Exception as e:
                print(f"  ERROR on query {query['id']}: {e}", file=sys.stderr)
                # Write a minimal entry so we can skip it on resume
                fallback = format_output_line(query["id"], query["prompt"], f"Error: {e}")
                out.write(json.dumps(fallback, ensure_ascii=False) + "\n")
                out.flush()


def main():
    parser = argparse.ArgumentParser(description="Synapse Agent — Deep Research")
    parser.add_argument("--query-file", type=Path, required=True, help="Path to query.jsonl")
    parser.add_argument("--output-file", type=Path, required=True, help="Output JSONL path")
    parser.add_argument("--ids", type=int, nargs="*", default=None, help="Specific query IDs to process")
    args = parser.parse_args()

    asyncio.run(run_all(args.query_file, args.output_file, args.ids))


if __name__ == "__main__":
    main()
