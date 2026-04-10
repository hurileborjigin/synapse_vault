/**
 * Context management utilities to prevent LLM context overflow.
 * Provides token estimation, content summarization, and smart truncation.
 */

import type { SearchResult } from "../types";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate token count using ~4 chars/token heuristic.
 * CJK characters are roughly 1 token each.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkCount = (
    text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) ||
    []
  ).length;
  const nonCjk = text.length - cjkCount;
  return cjkCount + Math.ceil(nonCjk / 4);
}

// ---------------------------------------------------------------------------
// Token budget allocation
// ---------------------------------------------------------------------------

export interface TokenBudget {
  systemPrompt: number;
  sources: number;
  kgContext: number;
  subQuestions: number;
  existingDraft: number; // for revision mode
  outputReserve: number; // tokens reserved for the model's response
  total: number;
}

export function computeBudget(modelMaxTokens: number): TokenBudget {
  const outputReserve = 8192;
  const available = modelMaxTokens - outputReserve;

  return {
    systemPrompt: Math.min(2000, Math.floor(available * 0.1)),
    sources: Math.floor(available * 0.55),
    kgContext: Math.floor(available * 0.1),
    subQuestions: Math.floor(available * 0.05),
    existingDraft: Math.floor(available * 0.2),
    outputReserve,
    total: modelMaxTokens,
  };
}

// ---------------------------------------------------------------------------
// Content summarization (extractive)
// ---------------------------------------------------------------------------

/**
 * Summarize content to fit within a token budget.
 * Uses extractive summarization: score paragraphs by keyword overlap,
 * keep the highest-scoring ones.
 */
export function summarizeContent(
  content: string,
  maxTokens: number,
  query?: string
): string {
  if (!content) return "";
  const currentTokens = estimateTokens(content);
  if (currentTokens <= maxTokens) return content;

  // Level 1: Smart truncation — keep intro + conclusion
  const charLimit = maxTokens * 4;
  if (currentTokens <= maxTokens * 2) {
    const intro = content.slice(0, Math.floor(charLimit * 0.6));
    const conclusion = content.slice(-Math.floor(charLimit * 0.4));
    return intro + "\n\n[...]\n\n" + conclusion;
  }

  // Level 2: Extractive — split into paragraphs, score by keyword density
  return extractiveSummarize(content, maxTokens, query);
}

function extractiveSummarize(
  content: string,
  maxTokens: number,
  query?: string
): string {
  const paragraphs = content
    .split(/\n\n+/)
    .filter((p) => p.trim().length > 50);

  if (paragraphs.length === 0) {
    return content.slice(0, maxTokens * 4);
  }

  // Score paragraphs by keyword overlap with query
  const queryWords = new Set(
    (query || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const scored = paragraphs.map((p) => {
    const words = p.toLowerCase().split(/\s+/);
    const overlap = queryWords.size > 0
      ? words.filter((w) => queryWords.has(w)).length
      : 0;
    // Base score: keyword overlap + position bonus (earlier paragraphs slightly preferred)
    return { text: p, score: overlap / Math.max(words.length, 1) };
  });

  // Keep paragraphs in original order after scoring
  const indexed = scored.map((s, i) => ({ ...s, idx: i }));
  indexed.sort((a, b) => b.score - a.score);

  // Select top paragraphs within budget
  const selected: Array<{ text: string; idx: number }> = [];
  let tokens = 0;
  for (const item of indexed) {
    const t = estimateTokens(item.text);
    if (tokens + t > maxTokens) break;
    selected.push(item);
    tokens += t;
  }

  // Restore original order
  selected.sort((a, b) => a.idx - b.idx);
  return selected.map((s) => s.text).join("\n\n");
}

// ---------------------------------------------------------------------------
// Source compaction with rank-weighted allocation
// ---------------------------------------------------------------------------

/**
 * Compact a list of search results to fit within a total token budget.
 * Strategy:
 * 1. Sort by relevance score (highest first)
 * 2. Allocate tokens per source based on rank (higher-ranked sources get more)
 * 3. Summarize/truncate each source to its allocation
 */
export function compactSources(
  sources: SearchResult[],
  maxTotalTokens: number,
  query?: string
): string {
  if (sources.length === 0) return "";

  const sorted = [...sources].sort(
    (a, b) => b.relevanceScore - a.relevanceScore
  );
  const n = Math.min(sorted.length, 30); // Cap at 30 sources
  const selected = sorted.slice(0, n);

  // Diminishing allocation: top source gets more weight
  const totalWeight = selected.reduce((sum, _, i) => sum + (n - i), 0);

  const blocks: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const r = selected[i];
    const weight = (n - i) / totalWeight;
    const tokenBudget = Math.max(Math.floor(maxTotalTokens * weight), 100);

    const content = r.content || r.snippet;
    const summarized = summarizeContent(content, tokenBudget - 50, query);

    blocks.push(
      `[Source ${i + 1}]\nURL: ${r.url}\nTitle: ${r.title}\nContent: ${summarized}`
    );
  }

  return blocks.join("\n\n---\n\n");
}

/**
 * Extract improvement-relevant sections from an article for revision context.
 * Instead of sending the full article, send intro + sections mentioned in feedback + conclusion.
 */
export function extractRevisionContext(
  article: string,
  feedback: string,
  maxTokens: number
): string {
  if (estimateTokens(article) <= maxTokens) return article;

  const sections = article.split(/\n(?=##\s)/);
  const feedbackLower = feedback.toLowerCase();

  const relevant = sections.filter((section) => {
    const titleLine = section.split("\n")[0]?.toLowerCase() || "";
    return (
      titleLine.includes("introduction") ||
      titleLine.includes("conclusion") ||
      titleLine.includes("reference") ||
      // Check if the section title is mentioned in the feedback
      feedbackLower.includes(
        titleLine.replace(/^#+\s*/, "").trim().slice(0, 30)
      )
    );
  });

  if (relevant.length > 0) {
    const result = relevant.join("\n\n");
    if (estimateTokens(result) <= maxTokens) return result;
  }

  // Fallback: truncate with intro + conclusion
  const charLimit = maxTokens * 4;
  const intro = article.slice(0, Math.floor(charLimit * 0.6));
  const conclusion = article.slice(-Math.floor(charLimit * 0.4));
  return intro + "\n\n[...middle truncated for revision...]\n\n" + conclusion;
}
