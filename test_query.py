"""Interactive test script — run a single manual query through the pipeline."""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime

from synapse_agent.config import settings
from synapse_agent.graph import build_graph
from synapse_agent.state import ResearchState
from synapse_agent.utils.output import format_output_line

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")


def _print_node(prev_state, curr_state):
    """Diff two state snapshots and print what changed."""
    # Detect which node ran by checking what changed
    if not prev_state:
        return

    sqs_old = prev_state.get("sub_questions", [])
    sqs_new = curr_state.get("sub_questions", [])
    if len(sqs_new) > len(sqs_old):
        print(f"\n[query_analyzer] {len(sqs_new)} sub-questions:")
        for sq in sqs_new:
            print(f"  P{sq.priority}: {sq.question}")
            for q in sq.search_queries[:2]:
                print(f"       -> {q}")
        return

    sr_old = prev_state.get("search_results", [])
    sr_new = curr_state.get("search_results", [])
    it_old = prev_state.get("search_iteration", 0)
    it_new = curr_state.get("search_iteration", 0)
    if it_new > it_old:
        print(f"\n[searcher] iteration {it_new}: found {len(sr_new) - len(sr_old)} new results (total: {len(sr_new)})")
        return

    # Check if ranking happened (scores changed on existing results)
    scored_old = sum(1 for r in sr_old if r.relevance_score > 0)
    scored_new = sum(1 for r in sr_new if r.relevance_score > 0)
    if scored_new > scored_old:
        above = sum(1 for r in sr_new if r.relevance_score >= settings.relevance_threshold)
        print(f"\n[ranker] scored {scored_new} results, {above} above threshold ({settings.relevance_threshold})")
        return

    kg_old = len(prev_state.get("kg_entities", []))
    kg_new = len(curr_state.get("kg_entities", []))
    gaps_new = curr_state.get("knowledge_gaps", [])
    if kg_new > kg_old or gaps_new != prev_state.get("knowledge_gaps", []):
        rels = len(curr_state.get("kg_relations", []))
        print(f"\n[knowledge_graph] {kg_new} entities, {rels} relations")
        if gaps_new:
            print(f"  Gaps found: {gaps_new[:3]}{'...' if len(gaps_new) > 3 else ''}")
        else:
            print(f"  No gaps — proceeding to synthesis")
        return

    art_old = prev_state.get("article_draft", "")
    art_new = curr_state.get("article_draft", "")
    if art_new != art_old and art_new:
        rev = curr_state.get("revision_count", 0)
        label = "revision" if rev > 0 and art_old else "draft"
        print(f"\n[synthesizer] {label}: {len(art_new)} chars")
        return

    qp_old = prev_state.get("quality_passed", False)
    rev_old = prev_state.get("revision_count", 0)
    rev_new = curr_state.get("revision_count", 0)
    if rev_new > rev_old:
        scores = curr_state.get("quality_scores", {})
        passed = curr_state.get("quality_passed", False)
        print(f"\n[quality_gate] scores={scores}, passed={passed}, revision={rev_new}")
        if not passed:
            fb = curr_state.get("quality_feedback", "")
            if fb:
                print(f"  Feedback: {fb[:200]}")
        return

    print(f"\n[node] state updated")


def _save_result_md(query: str, final_state: dict):
    """Save the final article and metadata to results/ as a markdown file."""
    os.makedirs(RESULTS_DIR, exist_ok=True)

    # Build a filename from the query
    slug = re.sub(r'[^\w\s-]', '', query.lower())
    slug = re.sub(r'[\s]+', '-', slug.strip())[:80]
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"{timestamp}_{slug}.md"

    article = final_state.get("article_draft", "")
    scores = final_state.get("quality_scores", {})
    n_results = len(final_state.get("search_results", []))
    n_entities = len(final_state.get("kg_entities", []))
    iterations = final_state.get("search_iteration", 0)
    revisions = final_state.get("revision_count", 0)

    header = (
        f"---\n"
        f"query: \"{query}\"\n"
        f"date: {datetime.now().isoformat()}\n"
        f"provider: {settings.llm_provider.value}\n"
        f"model: {settings.llm_model}\n"
        f"search_results: {n_results}\n"
        f"kg_entities: {n_entities}\n"
        f"search_iterations: {iterations}\n"
        f"revisions: {revisions}\n"
        f"quality_scores: {json.dumps(scores)}\n"
        f"---\n\n"
    )

    path = os.path.join(RESULTS_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write(article)

    return path


async def run_query(query: str, language: str = "en", task_id: int = 0, verbose: bool = True):
    graph = build_graph()

    initial_state: ResearchState = {
        "task_id": task_id,
        "original_query": query,
        "language": language,
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

    if verbose:
        print(f"Query: {query}")
        print(f"Language: {language}")
        print(f"Provider: {settings.llm_provider.value} / {settings.llm_model}")
        print(f"Max search iterations: {settings.max_search_iterations}")
        print(f"Max revisions: {settings.max_revisions}")
        print("---")

    prev_state = None
    final_state = None

    async for state_snapshot in graph.astream(initial_state, stream_mode="values"):
        if verbose and prev_state is not None:
            _print_node(prev_state, state_snapshot)
        prev_state = state_snapshot
        final_state = state_snapshot

    if final_state is None:
        print("ERROR: No output from graph", file=sys.stderr)
        return format_output_line(task_id, query, "Error: empty graph output")

    article = final_state.get("article_draft", "")

    # Save to results/ as markdown
    md_path = _save_result_md(query, final_state)

    if verbose:
        print("\n" + "=" * 60)
        print("FINAL ARTICLE")
        print("=" * 60)
        print(article[:2000])
        if len(article) > 2000:
            print(f"\n... ({len(article) - 2000} more chars)")
        print("=" * 60)
        print(f"Article length: {len(article)} chars")
        print(f"Search results: {len(final_state.get('search_results', []))}")
        print(f"KG entities: {len(final_state.get('kg_entities', []))}")
        print(f"Search iterations: {final_state.get('search_iteration', 0)}")
        print(f"Revisions: {final_state.get('revision_count', 0)}")
        print(f"\nSaved to: {md_path}")

    return format_output_line(task_id, query, article)


def main():
    parser = argparse.ArgumentParser(description="Test synapse-agent with a manual query")
    parser.add_argument("query", nargs="?", help="Research query (or use --interactive)")
    parser.add_argument("--lang", default="en", choices=["en", "zh"], help="Language")
    parser.add_argument("--interactive", "-i", action="store_true", help="Interactive mode")
    parser.add_argument("--output", "-o", type=str, help="Save output to JSONL file")
    parser.add_argument("--quiet", "-q", action="store_true", help="Minimal output")
    args = parser.parse_args()

    if args.interactive:
        print("Synapse Agent — Interactive Test Mode")
        print("Type a research query and press Enter. Type 'quit' to exit.\n")
        while True:
            try:
                query = input("Query> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not query or query.lower() in ("quit", "exit", "q"):
                break
            lang = "zh" if any('\u4e00' <= c <= '\u9fff' for c in query) else "en"
            result = asyncio.run(run_query(query, lang, verbose=not args.quiet))
            if args.output:
                with open(args.output, "a") as f:
                    f.write(json.dumps(result, ensure_ascii=False) + "\n")
    elif args.query:
        result = asyncio.run(run_query(args.query, args.lang, verbose=not args.quiet))
        if args.output:
            with open(args.output, "a") as f:
                f.write(json.dumps(result, ensure_ascii=False) + "\n")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
