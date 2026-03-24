"""Query Analyzer — decompose query into sub-questions and detect domain."""

from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage

from synapse_agent.config import settings
from synapse_agent.state import ResearchState, SubQuestion

SYSTEM_PROMPT = """You are a research query analyzer. Given a research query, you must:
1. Decompose it into 3-7 focused sub-questions that together cover the full scope
2. Assign priority (1=highest, 3=lowest) to each sub-question
3. Generate 2-3 search queries per sub-question (varied phrasing for better coverage)

For Chinese (zh) queries, generate search queries in BOTH Chinese AND English.
For English (en) queries, generate search queries in English only.

Respond with valid JSON only:
{
  "sub_questions": [
    {
      "question": "...",
      "priority": 1,
      "search_queries": ["query1", "query2"]
    }
  ]
}"""


async def query_analyzer(state: ResearchState) -> dict:
    """Decompose the original query into sub-questions with search queries."""
    llm = settings.get_llm("analyzer")

    prompt = f"Research query: {state['original_query']}\nLanguage: {state['language']}\nDomain: {state['domain']}"

    response = await llm.ainvoke([
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])

    try:
        text = response.content
        # Extract JSON from potential markdown code blocks
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        data = json.loads(text)
    except (json.JSONDecodeError, IndexError):
        # Fallback: create a single sub-question from the original query
        data = {
            "sub_questions": [{
                "question": state["original_query"],
                "priority": 1,
                "search_queries": [state["original_query"]],
            }]
        }

    sub_questions = []
    for sq in data.get("sub_questions", []):
        sub_questions.append(SubQuestion(
            question=sq["question"],
            priority=sq.get("priority", 1),
            search_queries=sq.get("search_queries", [sq["question"]]),
        ))

    return {"sub_questions": sub_questions}
