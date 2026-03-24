# Synapse Vault

Agentic deep research system that takes PhD-level research queries, performs iterative web search with knowledge graph-guided gap analysis, and produces comprehensive research articles with verifiable citations.

Built to benchmark against [DeepResearch Bench](https://github.com/deep-research-bench) (100 queries, 50 zh / 50 en, evaluated on RACE report quality + FACT citation accuracy).

## Quick Start

```bash
# Install dependencies
uv pip install -e .

# Set API keys
export ANTHROPIC_API_KEY=sk-...
export JINA_API_KEY=jina_...

# Run on a single query
uv run synapse-agent \
  --query-file deep_research_bench/data/prompt_data/query.jsonl \
  --output-file deep_research_bench/data/test_data/raw_data/synapse-agent.jsonl \
  --ids 1

# Run all 100 queries
uv run synapse-agent \
  --query-file deep_research_bench/data/prompt_data/query.jsonl \
  --output-file deep_research_bench/data/test_data/raw_data/synapse-agent.jsonl
```

## How It Works

1. **Query Analysis** — Decomposes the research query into 3-7 sub-questions with prioritized search queries
2. **Cascading Search** — Jina Search → Brave → Tavily fallback chain, with Jina Reader for full-page content
3. **Relevance Ranking** — LLM scores each result 0-10, filters below threshold
4. **Knowledge Graph** — Extracts entities/relations into NetworkX graph, identifies coverage gaps
5. **Iterative Search** — If gaps exist and iterations remain, loops back to search with gap-targeted queries
6. **Synthesis** — Generates structured article with `[N]` inline citations from verified source URLs
7. **Quality Gate** — RACE-aligned self-evaluation; revises if scores are below threshold

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SYNAPSE_LLM_PROVIDER` | `anthropic` | `anthropic`, `openai`, `azure_openai`, `compatible` |
| `SYNAPSE_LLM_MODEL` | `claude-sonnet-4-20250514` | Model name |
| `SYNAPSE_MAX_SEARCH_ITERATIONS` | `3` | Search-KG loop iterations |
| `SYNAPSE_MAX_REVISIONS` | `2` | Quality gate revision rounds |
| `SYNAPSE_RELEVANCE_THRESHOLD` | `6.0` | Min relevance score (0-10) |
| `SYNAPSE_MIN_CITATIONS` | `10` | Min unique citations required |

## Evaluation

```bash
cd deep_research_bench
# Edit run_benchmark.sh to set TARGET_MODELS=("synapse-agent")
bash run_benchmark.sh
```

## License

MIT
