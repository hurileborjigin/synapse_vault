/**
 * Query Analyzer — decompose query, do light preliminary research,
 * refine topics, then interrupt for user approval.
 */

import { interrupt } from "@langchain/langgraph";
import { getLLM } from "../config";
import { cascadingSearch } from "../tools";
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

const REFINE_PROMPT = `You are a research topic refiner. Given the original query, proposed sub-questions, and preliminary search results showing what's actually available, refine the topics.

Based on the search results:
- Remove topics where no useful information was found
- Narrow broad topics based on what specific information is available
- Add new topics if the search results reveal important angles not originally considered
- Adjust priorities based on how much quality information is available

Respond with valid JSON only:
{
  "sub_questions": [
    {
      "question": "refined question text",
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

/**
 * Quick searches per topic for landscape understanding.
 * Runs searches in PARALLEL with tight timeouts. Only top 3 topics, 3 results each.
 */
async function performLightSearch(
  subQuestions: SubQuestion[]
): Promise<
  Array<{
    query: string;
    topResults: Array<{ title: string; snippet: string; url: string }>;
  }>
> {
  const topQuestions = [...subQuestions]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);

  // Run all searches in parallel (not sequentially)
  const promises = topQuestions.map(async (sq) => {
    const searchQuery = sq.searchQueries[0] || sq.question;
    try {
      const searchResults = await cascadingSearch(searchQuery, 3);
      return {
        query: sq.question,
        topResults: searchResults.map((r) => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        })),
      };
    } catch {
      return { query: sq.question, topResults: [] };
    }
  });

  return Promise.all(promises);
}

export async function queryAnalyzer(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  // Guard: if topics already approved (resume path), skip everything
  if (state.topicsApproved) {
    console.log("[queryAnalyzer] topics already approved, skipping");
    return {};
  }

  console.log("[queryAnalyzer] starting decomposition...");
  const llm = await getLLM("analyzer");
  const language = state.language || detectLanguage(state.originalQuery);

  // --- Step 1: Decompose query into sub-questions ---
  console.log("[queryAnalyzer] step 1: LLM decomposition");
  const prompt = `Research query: ${state.originalQuery}\nLanguage: ${language}\nDomain: ${state.domain || "general"}`;

  let rawData: Record<string, unknown>;
  try {
    const response = await llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    rawData = JSON.parse(extractJSON(text));
  } catch {
    rawData = {
      sub_questions: [
        {
          question: state.originalQuery,
          priority: 1,
          search_queries: [state.originalQuery],
        },
      ],
    };
  }

  const rawQuestions = (rawData.sub_questions ?? []) as Array<
    Record<string, unknown>
  >;
  let subQuestions: SubQuestion[] = rawQuestions.map((sq) => ({
    question: (sq.question as string) ?? "",
    priority: (sq.priority as number) ?? 1,
    answered: false,
    searchQueries: (sq.search_queries as string[]) ?? [sq.question as string],
  }));

  // --- Step 2: Light search for landscape understanding ---
  console.log("[queryAnalyzer] step 2: light search (parallel)...");
  const lightSearchResults = await performLightSearch(subQuestions);
  console.log("[queryAnalyzer] light search done:", lightSearchResults.map(r => `${r.query}: ${r.topResults.length} results`));

  // --- Step 3: Refine topics based on what's available ---
  console.log("[queryAnalyzer] step 3: refine topics...");
  try {
    const searchSummary = lightSearchResults
      .map(
        (lr) =>
          `Topic: ${lr.query}\nAvailable sources:\n${lr.topResults.map((r) => `  - ${r.title}: ${r.snippet}`).join("\n")}`
      )
      .join("\n\n");

    const refineResponse = await llm.invoke([
      { role: "system", content: REFINE_PROMPT },
      {
        role: "user",
        content: `Original query: ${state.originalQuery}\n\nProposed topics:\n${subQuestions.map((sq) => `- [P${sq.priority}] ${sq.question}`).join("\n")}\n\nPreliminary search results:\n${searchSummary}`,
      },
    ]);

    const refineText =
      typeof refineResponse.content === "string"
        ? refineResponse.content
        : JSON.stringify(refineResponse.content);
    const refined = JSON.parse(extractJSON(refineText));
    const refinedRaw = (refined.sub_questions ?? []) as Array<
      Record<string, unknown>
    >;

    if (refinedRaw.length > 0) {
      subQuestions = refinedRaw.map((sq) => ({
        question: (sq.question as string) ?? "",
        priority: (sq.priority as number) ?? 1,
        answered: false,
        searchQueries: (sq.search_queries as string[]) ?? [
          sq.question as string,
        ],
      }));
    }
  } catch {
    // Keep original sub-questions if refinement fails
  }

  // --- Step 4: INTERRUPT — present proposal to user ---
  console.log("[queryAnalyzer] step 4: calling interrupt() with", subQuestions.length, "topics");
  const userResponse = interrupt({
    type: "topic_approval",
    subQuestions,
    lightSearchResults,
    domain: state.domain || "general",
    language,
  });

  // --- After resume: userResponse contains the user's approved topics ---
  const approved = (userResponse as Record<string, unknown>)
    .subQuestions as SubQuestion[];

  return {
    subQuestions: approved ?? subQuestions,
    language,
    topicsApproved: true,
    lightSearchResults,
  };
}
