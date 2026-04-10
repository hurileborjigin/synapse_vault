/**
 * Query Analyzer — decompose query into sub-questions and detect domain.
 * Port of Python's nodes/query_analyzer.py
 */

import { getLLM } from "../config";
import type { ResearchStateType } from "../state";
import type { SubQuestion } from "../types";

const SYSTEM_PROMPT = `You are a research query analyzer. Given a research query, you must:
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
}`;

function extractJSON(text: string): string {
  if (text.includes("```")) {
    const parts = text.split("```");
    let inner = parts[1] ?? "";
    if (inner.startsWith("json")) inner = inner.slice(4);
    return inner.trim();
  }
  return text.trim();
}

function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  return "en";
}

export async function queryAnalyzer(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  const llm = await getLLM("analyzer");

  const language = state.language || detectLanguage(state.originalQuery);
  const prompt = `Research query: ${state.originalQuery}\nLanguage: ${language}\nDomain: ${state.domain || "general"}`;

  const response = await llm.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);

  let data: Record<string, unknown>;
  try {
    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    data = JSON.parse(extractJSON(text));
  } catch {
    // Fallback: single sub-question from original query
    data = {
      sub_questions: [
        {
          question: state.originalQuery,
          priority: 1,
          search_queries: [state.originalQuery],
        },
      ],
    };
  }

  const rawQuestions = (data.sub_questions ?? []) as Array<Record<string, unknown>>;
  const subQuestions: SubQuestion[] = rawQuestions.map((sq) => ({
    question: (sq.question as string) ?? "",
    priority: (sq.priority as number) ?? 1,
    answered: false,
    searchQueries: (sq.search_queries as string[]) ?? [sq.question as string],
  }));

  return { subQuestions, language };
}
