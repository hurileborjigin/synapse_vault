/**
 * Configuration management — replaces Python's pydantic-settings.
 * Loads from process.env (Next.js auto-loads .env.local).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const LLMProviderEnum = z.enum([
  "anthropic",
  "openai",
  "azure_openai",
  "compatible",
]);
export type LLMProvider = z.infer<typeof LLMProviderEnum>;

export type NodeName =
  | "analyzer"
  | "searcher"
  | "synthesizer"
  | "quality"
  | "default";

const SettingsSchema = z.object({
  // LLM
  llmProvider: LLMProviderEnum.default("anthropic"),
  llmModel: z.string().default("claude-sonnet-4-20250514"),
  llmTemperature: z.number().min(0).max(2).default(0.3),

  // Per-node model overrides (fall back to llmModel)
  analyzerModel: z.string().optional(),
  searcherModel: z.string().optional(),
  synthesizerModel: z.string().optional(),
  qualityModel: z.string().optional(),

  // Provider keys
  anthropicApiKey: z.string().default(""),
  openaiApiKey: z.string().default(""),
  azureOpenaiApiKey: z.string().default(""),
  azureOpenaiEndpoint: z.string().default(""),
  azureOpenaiApiVersion: z.string().default("2024-06-01"),
  compatibleApiKey: z.string().default(""),
  compatibleBaseUrl: z.string().default(""),

  // Search API keys
  jinaApiKey: z.string().default(""),
  braveApiKey: z.string().default(""),
  tavilyApiKey: z.string().default(""),

  // Workflow
  maxSearchIterations: z.number().int().default(1),
  maxRevisions: z.number().int().default(2),
  searchResultsPerQuery: z.number().int().default(10),
  relevanceThreshold: z.number().default(6.0),
  minCitations: z.number().int().default(10),
  qualityThreshold: z.number().default(7.0),
  maxConcurrentSearches: z.number().int().default(5),
});

export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------------------
// Environment → Settings loader
// ---------------------------------------------------------------------------

function loadSettingsFromEnv(): Settings {
  const env = process.env;

  return SettingsSchema.parse({
    llmProvider: env.SYNAPSE_LLM_PROVIDER || undefined,
    llmModel: env.SYNAPSE_LLM_MODEL || undefined,
    llmTemperature: env.SYNAPSE_LLM_TEMPERATURE
      ? parseFloat(env.SYNAPSE_LLM_TEMPERATURE)
      : undefined,

    analyzerModel: env.SYNAPSE_ANALYZER_MODEL || undefined,
    searcherModel: env.SYNAPSE_SEARCHER_MODEL || undefined,
    synthesizerModel: env.SYNAPSE_SYNTHESIZER_MODEL || undefined,
    qualityModel: env.SYNAPSE_QUALITY_MODEL || undefined,

    anthropicApiKey: env.ANTHROPIC_API_KEY || "",
    openaiApiKey: env.OPENAI_API_KEY || "",
    azureOpenaiApiKey: env.AZURE_OPENAI_API_KEY || "",
    azureOpenaiEndpoint: env.AZURE_OPENAI_ENDPOINT || "",
    azureOpenaiApiVersion: env.AZURE_OPENAI_API_VERSION || undefined,
    compatibleApiKey: env.COMPATIBLE_API_KEY || "",
    compatibleBaseUrl: env.COMPATIBLE_BASE_URL || "",

    jinaApiKey: env.JINA_API_KEY || "",
    braveApiKey: env.BRAVE_API_KEY || "",
    tavilyApiKey: env.TAVILY_API_KEY || "",

    maxSearchIterations: env.SYNAPSE_MAX_SEARCH_ITERATIONS
      ? parseInt(env.SYNAPSE_MAX_SEARCH_ITERATIONS)
      : undefined,
    maxRevisions: env.SYNAPSE_MAX_REVISIONS
      ? parseInt(env.SYNAPSE_MAX_REVISIONS)
      : undefined,
    searchResultsPerQuery: env.SYNAPSE_SEARCH_RESULTS_PER_QUERY
      ? parseInt(env.SYNAPSE_SEARCH_RESULTS_PER_QUERY)
      : undefined,
    relevanceThreshold: env.SYNAPSE_RELEVANCE_THRESHOLD
      ? parseFloat(env.SYNAPSE_RELEVANCE_THRESHOLD)
      : undefined,
    minCitations: env.SYNAPSE_MIN_CITATIONS
      ? parseInt(env.SYNAPSE_MIN_CITATIONS)
      : undefined,
    qualityThreshold: env.SYNAPSE_QUALITY_THRESHOLD
      ? parseFloat(env.SYNAPSE_QUALITY_THRESHOLD)
      : undefined,
    maxConcurrentSearches: env.SYNAPSE_MAX_CONCURRENT_SEARCHES
      ? parseInt(env.SYNAPSE_MAX_CONCURRENT_SEARCHES)
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _settings: Settings | null = null;

export function getSettings(): Settings {
  if (!_settings) _settings = loadSettingsFromEnv();
  return _settings;
}

export function updateSettings(partial: Partial<Settings>): Settings {
  _settings = SettingsSchema.parse({ ...getSettings(), ...partial });
  return _settings;
}

export function resetSettings(): void {
  _settings = null;
}

// ---------------------------------------------------------------------------
// Per-node model resolution
// ---------------------------------------------------------------------------

export function getModelName(node: NodeName): string {
  const s = getSettings();
  const overrides: Partial<Record<NodeName, string | undefined>> = {
    analyzer: s.analyzerModel,
    searcher: s.searcherModel,
    synthesizer: s.synthesizerModel,
    quality: s.qualityModel,
  };
  return overrides[node] ?? s.llmModel;
}

// ---------------------------------------------------------------------------
// LLM factory
// ---------------------------------------------------------------------------

export async function getLLM(node: NodeName = "default") {
  const s = getSettings();
  const model = getModelName(node);

  switch (s.llmProvider) {
    case "anthropic": {
      const { ChatAnthropic } = await import("@langchain/anthropic");
      return new ChatAnthropic({
        model,
        apiKey: s.anthropicApiKey,
        temperature: s.llmTemperature,
        maxTokens: 8192,
      });
    }
    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model,
        apiKey: s.openaiApiKey,
        temperature: s.llmTemperature,
      });
    }
    case "azure_openai": {
      const { AzureChatOpenAI } = await import("@langchain/openai");
      return new AzureChatOpenAI({
        azureOpenAIApiDeploymentName: model,
        azureOpenAIApiKey: s.azureOpenaiApiKey,
        azureOpenAIEndpoint: s.azureOpenaiEndpoint,
        azureOpenAIApiVersion: s.azureOpenaiApiVersion,
        temperature: s.llmTemperature,
      });
    }
    case "compatible": {
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model,
        apiKey: s.compatibleApiKey,
        configuration: { baseURL: s.compatibleBaseUrl },
        temperature: s.llmTemperature,
      });
    }
  }
}
