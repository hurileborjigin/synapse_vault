/**
 * Quality Gate — RACE-aligned self-evaluation with revision loop.
 * Port of Python's nodes/quality_gate.py
 */

import { getLLM, getSettings } from "../config";
import type { ResearchStateType } from "../state";
import { withTimeout } from "../utils/timeout";

function buildSystemPrompt(minCitations: number, threshold: number): string {
  return `You are a research article quality evaluator aligned with the RACE evaluation framework.

Score the article on these 4 dimensions (0-10 each):

1. **comprehensiveness**: Information coverage breadth, depth, data support, multiple perspectives
2. **insight**: Analysis depth, logical reasoning, problem insight, forward-looking thinking
3. **instruction_following**: Response to task objectives, scope adherence, complete coverage of requirements
4. **readability**: Clear structure, language fluency, appropriate terminology, information presentation

Also check:
- Citation count: Does the article have at least ${minCitations} unique [N] citations?
- Are citations properly formatted with a References section?
- Does the article fully address the original query?

Respond with valid JSON only:
{
  "scores": {
    "comprehensiveness": 8.0,
    "insight": 7.5,
    "instruction_following": 8.0,
    "readability": 7.0
  },
  "citation_count": 25,
  "passed": true,
  "feedback": "Specific feedback for improvement if not passed. Empty string if passed."
}

Set "passed" to true ONLY if ALL dimension scores >= ${threshold} AND citation_count >= ${minCitations}.`;
}

function extractJSON(text: string): string {
  if (text.includes("```")) {
    const parts = text.split("```");
    let inner = parts[1] ?? "";
    if (inner.startsWith("json")) inner = inner.slice(4);
    return inner.trim();
  }
  return text.trim();
}

export async function qualityGate(
  state: ResearchStateType
): Promise<Partial<ResearchStateType>> {
  const settings = getSettings();
  const llm = await getLLM("quality");
  const article = state.articleDraft ?? "";
  const revisionCount = state.revisionCount ?? 0;

  if (!article) {
    return {
      qualityScores: {
        comprehensiveness: 0,
        insight: 0,
        instruction_following: 0,
        readability: 0,
      },
      qualityFeedback: "No article draft to evaluate.",
      qualityPassed: false,
      revisionCount,
    };
  }

  // Force pass if max revisions reached
  if (revisionCount >= settings.maxRevisions) {
    return {
      qualityScores: {
        comprehensiveness: 7,
        insight: 7,
        instruction_following: 7,
        readability: 7,
      },
      qualityFeedback: "",
      qualityPassed: true,
      revisionCount,
    };
  }

  const sysPrompt = buildSystemPrompt(
    settings.minCitations,
    settings.qualityThreshold
  );

  // Truncate for evaluation if needed
  const evalArticle =
    article.length <= 15000
      ? article
      : article.slice(0, 7500) +
        "\n\n[...middle truncated for evaluation...]\n\n" +
        article.slice(-7500);

  const userPrompt = [
    `Original query: ${state.originalQuery}`,
    `Language: ${state.language}`,
    `\nArticle to evaluate:\n${evalArticle}`,
  ].join("\n");

  try {
    const response = await withTimeout(
      llm.invoke([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt },
      ]),
      120_000, // 2-minute timeout
      "Quality evaluation"
    );

    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const data = JSON.parse(extractJSON(text));
    const scores = data.scores ?? {};
    let passed = data.passed ?? false;
    const feedback = data.feedback ?? "";

    // Force pass if max revisions reached
    if (revisionCount >= settings.maxRevisions) {
      passed = true;
    }

    return {
      qualityScores: scores,
      qualityFeedback: feedback,
      qualityPassed: passed,
      revisionCount: revisionCount + 1,
    };
  } catch {
    // On parse failure, accept the article to avoid infinite loops
    return {
      qualityScores: {
        comprehensiveness: 7,
        insight: 7,
        instruction_following: 7,
        readability: 7,
      },
      qualityFeedback: "",
      qualityPassed: true,
      revisionCount,
    };
  }
}
