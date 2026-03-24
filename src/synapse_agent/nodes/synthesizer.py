"""Synthesizer — generate research article with inline citations."""

from __future__ import annotations

import asyncio

from langchain_core.messages import HumanMessage, SystemMessage

from synapse_agent.config import settings
from synapse_agent.state import ResearchState
from synapse_agent.utils.citations import CitationManager

SYSTEM_PROMPT_EN = """You are an expert research writer producing a comprehensive, PhD-level research article.

REQUIREMENTS:
1. Write a well-structured article with clear sections (use ## headings)
2. Cover ALL sub-questions thoroughly with deep analysis
3. Use inline citations in [N] format, where N is the reference number
4. EVERY factual claim must have a citation. Aim for 20-40 unique citations.
5. Include a "## References" section at the end with numbered references
6. Each reference must be formatted as: [N] Title. URL
7. ONLY use URLs from the provided source list — do NOT invent URLs
8. Provide multiple perspectives, data points, and expert opinions
9. Include analysis, not just facts — explain implications and connections
10. Write 3000-6000 words for comprehensive coverage

STRUCTURE:
- Introduction (context, scope, significance)
- Multiple body sections addressing each sub-question
- Analysis/Discussion section connecting findings
- Conclusion with key takeaways
- References

CITATION RULES:
- Use [N] inline immediately after the claim it supports
- Multiple citations for well-supported claims: [1][2]
- Every section should have multiple citations
- Reference list at end: [N] Title. URL"""

SYSTEM_PROMPT_ZH = """你是一位专业的研究报告撰写者，负责撰写全面、博士级别的研究文章。

要求：
1. 撰写结构清晰的文章，使用 ## 标题分节
2. 深入全面地覆盖所有子问题
3. 使用 [N] 格式的内联引用，N 为参考文献编号
4. 每个事实性陈述都必须有引用。目标：20-40个独立引用
5. 在文末包含"## 参考文献"部分，列出编号参考文献
6. 每条参考文献格式：[N] 标题. URL
7. 只使用提供的来源列表中的URL——不要编造URL
8. 提供多角度分析、数据支持和专家观点
9. 不仅陈述事实，还要分析其含义和关联
10. 撰写3000-6000字以确保全面覆盖

结构：
- 引言（背景、范围、重要性）
- 多个正文部分，分别回答各子问题
- 分析/讨论部分，连接各项发现
- 结论与关键要点
- 参考文献

引用规则：
- 在支持的陈述后立即使用 [N]
- 充分支持的论点可使用多个引用：[1][2]
- 每个部分都应有多个引用
- 文末参考文献列表：[N] 标题. URL"""

REVISION_PROMPT = """Revise the article based on this feedback:

{feedback}

Maintain all existing citations and add new ones where needed. Keep the [N] citation format and the References section."""


async def synthesizer(state: ResearchState) -> dict:
    """Generate or revise the research article with inline citations."""
    llm = settings.get_llm("synthesizer")
    search_results = state.get("search_results", [])
    threshold = settings.relevance_threshold

    # Build citation manager from search results
    cm = CitationManager(search_results)

    # Select system prompt based on language
    sys_prompt = SYSTEM_PROMPT_ZH if state["language"] == "zh" else SYSTEM_PROMPT_EN

    # Build source material
    relevant = sorted(
        [r for r in search_results if r.relevance_score >= threshold],
        key=lambda r: r.relevance_score,
        reverse=True,
    )
    if len(relevant) < 10:
        relevant = sorted(search_results, key=lambda r: r.relevance_score, reverse=True)[:30]

    source_blocks = []
    for i, r in enumerate(relevant[:40], 1):
        content_preview = r.content[:2000] if r.content else r.snippet
        source_blocks.append(
            f"[Source {i}]\nURL: {r.url}\nTitle: {r.title}\nContent: {content_preview}"
        )

    sources_text = "\n\n---\n\n".join(source_blocks)

    # Sub-questions context
    sub_q_text = "\n".join(f"- {sq.question}" for sq in state.get("sub_questions", []))

    # KG context
    kg_context = ""
    if state.get("kg_entities"):
        entities = state["kg_entities"][:20]
        kg_context = "\nKey entities identified:\n" + "\n".join(
            f"- {e.name} ({e.entity_type}): {e.description}" for e in entities
        )
    if state.get("kg_relations"):
        relations = state["kg_relations"][:15]
        kg_context += "\nKey relationships:\n" + "\n".join(
            f"- {r.source} → {r.relation} → {r.target}" for r in relations
        )

    if state.get("article_draft") and state.get("quality_feedback"):
        # Revision mode
        user_prompt = (
            f"Original query: {state['original_query']}\n\n"
            f"Current draft:\n{state['article_draft']}\n\n"
            f"Feedback for revision:\n{state['quality_feedback']}\n\n"
            f"Available sources:\n{sources_text}"
        )
        revision_note = REVISION_PROMPT.format(feedback=state["quality_feedback"])
        messages = [
            SystemMessage(content=sys_prompt + "\n\n" + revision_note),
            HumanMessage(content=user_prompt),
        ]
    else:
        # Initial generation
        user_prompt = (
            f"Research query: {state['original_query']}\n\n"
            f"Sub-questions to address:\n{sub_q_text}\n"
            f"{kg_context}\n\n"
            f"Available sources (use these URLs for citations):\n{sources_text}"
        )
        messages = [
            SystemMessage(content=sys_prompt),
            HumanMessage(content=user_prompt),
        ]

    response = await asyncio.wait_for(llm.ainvoke(messages), timeout=300)
    article = response.content

    # Extract citations from the generated article
    import re
    cited_indices = set(int(m) for m in re.findall(r'\[(\d+)\]', article))

    # Build citation objects from the article's reference list
    citations = []
    for r in relevant[:40]:
        c = cm.get_or_create(r.url)
        if c:
            citations.append(c)

    return {
        "article_draft": article,
        "citations": citations,
    }
