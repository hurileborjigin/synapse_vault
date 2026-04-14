# Synapse Vault

Agentic deep research system that takes PhD-level research queries, performs iterative web search with knowledge graph-guided gap analysis, and produces comprehensive research articles with verifiable citations.

Built with Next.js 15 (App Router) and LangGraph.js. Features a real-time web UI with SSE streaming, interactive knowledge graph visualization, and human-in-the-loop topic approval.

Built to benchmark against [DeepResearch Bench](https://github.com/deep-research-bench) (100 queries, 50 zh / 50 en, evaluated on RACE report quality + FACT citation accuracy).

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.local.example .env.local   # then edit with your API keys

# Start development server (frontend + API in one process)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start researching.

## How It Works

1. **Query Analysis** — Decomposes the research query into 3–7 sub-questions with prioritized search queries; performs a light preliminary search for human approval
2. **Human-in-the-Loop Approval** — Presents decomposed topics and preliminary results for user review before committing to full search (uses LangGraph MemorySaver checkpointing)
3. **Cascading Search** — Jina Search → Brave → Tavily fallback chain, with Jina Reader for full-page content extraction
4. **Relevance Ranking** — LLM scores each result 0–10, filters below threshold
5. **Knowledge Graph** — Extracts entities/relations into a Graphology graph, identifies coverage gaps
6. **Iterative Search** — If gaps exist and iterations remain, loops back to search with gap-targeted queries
7. **Synthesis** — Generates structured article with `[N]` inline citations from verified source URLs; uses context-aware token budgeting
8. **Quality Gate** — RACE-aligned self-evaluation; revises if scores are below threshold

![Workflow](./SynapseVault%20Workflow.png)

## Configuration

### Environment Variables

Set in `.env.local`:

```bash
# LLM Provider (anthropic | openai | azure_openai | compatible)
SYNAPSE_LLM_PROVIDER=anthropic
SYNAPSE_LLM_MODEL=claude-sonnet-4-20250514

# Provider API keys (set the one matching your provider)
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-06-01
COMPATIBLE_API_KEY=
COMPATIBLE_BASE_URL=

# Per-node model overrides (optional, falls back to SYNAPSE_LLM_MODEL)
SYNAPSE_ANALYZER_MODEL=
SYNAPSE_SEARCHER_MODEL=
SYNAPSE_SYNTHESIZER_MODEL=
SYNAPSE_QUALITY_MODEL=

# Search APIs (at least one required)
JINA_API_KEY=jina_...
BRAVE_API_KEY=
TAVILY_API_KEY=tvly-...
```

### Workflow Tuning

| Variable | Default | Description |
|---|---|---|
| `SYNAPSE_LLM_PROVIDER` | `anthropic` | `anthropic`, `openai`, `azure_openai`, `compatible` |
| `SYNAPSE_LLM_MODEL` | `claude-sonnet-4-20250514` | Model name / deployment name |
| `SYNAPSE_LLM_TEMPERATURE` | `0.3` | LLM sampling temperature |
| `SYNAPSE_MAX_SEARCH_ITERATIONS` | `1` | Search → KG loop iterations (set > 1 to enable gap-based iteration) |
| `SYNAPSE_MAX_REVISIONS` | `2` | Quality gate revision rounds |
| `SYNAPSE_SEARCH_RESULTS_PER_QUERY` | `10` | Results fetched per search query |
| `SYNAPSE_RELEVANCE_THRESHOLD` | `6.0` | Min relevance score (0–10) |
| `SYNAPSE_QUALITY_THRESHOLD` | `7.0` | Min quality score for synthesis pass |
| `SYNAPSE_MIN_CITATIONS` | `10` | Min unique citations required |
| `SYNAPSE_MAX_CONCURRENT_SEARCHES` | `5` | Concurrent search requests |

> **Note:** `maxSearchIterations` defaults to `1`, meaning the knowledge-graph gap-analysis loop is disabled by default. Set to `2` or `3` for iterative, gap-guided search.

## Tech Stack

- **Runtime**: Node.js 18+, Next.js 15 (App Router, Turbopack dev)
- **Language**: TypeScript 5.7 (strict mode)
- **Frontend**: React 19, Tailwind CSS 3.4, Lucide icons, react-force-graph-2d, D3 force layout
- **Backend Pipeline**: @langchain/langgraph (StateGraph + MemorySaver checkpointer)
- **LLM Abstraction**: @langchain/core, @langchain/anthropic, @langchain/openai
- **Knowledge Graphs**: graphology
- **Search**: Jina Search API, Brave Search API, Tavily API (cascading fallback)
- **Config**: Zod schema + process.env

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/research` | Start research pipeline (SSE stream) |
| POST | `/api/research/resume` | Resume pipeline after human-in-the-loop approval |
| GET | `/api/settings` | Get current settings (API keys masked) |
| PUT | `/api/settings` | Update settings at runtime |
| GET | `/api/results` | List saved research results |
| DELETE | `/api/results` | Delete all results |
| DELETE | `/api/results/[id]` | Delete single result |

## Evaluation

```bash
cd deep_research_bench
# Edit run_benchmark.sh to set TARGET_MODELS=("synapse-agent")
bash run_benchmark.sh
```

## License

MIT
