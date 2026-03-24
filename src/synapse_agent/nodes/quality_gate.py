"""Quality Gate — RACE-aligned self-evaluation with revision loop."""

from __future__ import annotations

import asyncio
import json

from langchain_core.messages import HumanMessage, SystemMessage

from synapse_agent.config import settings
from synapse_agent.state import ResearchState

SYSTEM_PROMPT = """You are a research article quality evaluator aligned with the RACE evaluation framework.

Score the article on these 4 dimensions (0-10 each):

1. **comprehensiveness**: Information coverage breadth, depth, data support, multiple perspectives
2. **insight**: Analysis depth, logical reasoning, problem insight, forward-looking thinking
3. **instruction_following**: Response to task objectives, scope adherence, complete coverage of requirements
4. **readability**: Clear structure, language fluency, appropriate terminology, information presentation

Also check:
- Citation count: Does the article have at least {min_citations} unique [N] citations?
- Are citations properly formatted with a References section?
- Does the article fully address the original query?

Respond with valid JSON only:
{{
  "scores": {{
    "comprehensiveness": 8.0,
    "insight": 7.5,
    "instruction_following": 8.0,
    "readability": 7.0
  }},
  "citation_count": 25,
  "passed": true,
  "feedback": "Specific feedback for improvement if not passed. Empty string if passed."
}}

Set "passed" to true ONLY if ALL dimension scores >= {threshold} AND citation_count >= {min_citations}."""


async def quality_gate(state: ResearchState) -> dict:
    """Evaluate article quality and decide whether to revise or accept."""
    llm = settings.get_llm("quality")
    article = state.get("article_draft", "")
    revision_count = state.get("revision_count", 0)

    if not article:
        return {
            "quality_scores": {},
            "quality_feedback": "No article draft to evaluate.",
            "quality_passed": False,
            "revision_count": revision_count,
        }

    sys_prompt = SYSTEM_PROMPT.format(
        min_citations=settings.min_citations,
        threshold=settings.quality_threshold,
    )

    # Truncate for evaluation — the LLM doesn't need the full article to score it
    eval_article = article if len(article) <= 15000 else article[:7500] + "\n\n[...middle truncated for evaluation...]\n\n" + article[-7500:]

    user_prompt = (
        f"Original query: {state['original_query']}\n"
        f"Language: {state['language']}\n\n"
        f"Article to evaluate:\n{eval_article}"
    )

    try:
        response = await asyncio.wait_for(
            llm.ainvoke([
                SystemMessage(content=sys_prompt),
                HumanMessage(content=user_prompt),
            ]),
            timeout=120,
        )
        text = response.content
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
    except Exception:
        # On parse failure, accept the article to avoid infinite loops
        return {
            "quality_scores": {},
            "quality_feedback": "",
            "quality_passed": True,
            "revision_count": revision_count,
        }

    scores = data.get("scores", {})
    passed = data.get("passed", False)
    feedback = data.get("feedback", "")

    # Force pass if we've hit max revisions
    if revision_count >= settings.max_revisions:
        passed = True

    return {
        "quality_scores": scores,
        "quality_feedback": feedback,
        "quality_passed": passed,
        "revision_count": revision_count + 1,
    }
