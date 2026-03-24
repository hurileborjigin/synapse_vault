"use client";

import { useState, useCallback } from "react";
import { Brain, Zap, FileText } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { QualityScoresDisplay } from "@/components/quality-scores";
import { PipelineStages, type PipelineStage } from "@/components/pipeline-stages";
import { KnowledgeGraphPanel } from "@/components/knowledge-graph-panel";
import { SearchResultsPanel } from "@/components/search-results-panel";
import { CitationsPanel } from "@/components/citations-panel";
import { SubQuestionsPanel } from "@/components/sub-questions-panel";
import { QueryInput } from "@/components/query-input";
import { ResearchHeader } from "@/components/research-header";
import { sampleResearchResult, type Citation, type ResearchResult } from "@/lib/sample-data";

type ViewTab = "article" | "knowledge" | "sources";

export default function HomePage() {
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<PipelineStage>("idle");
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("article");

  const handleCitationClick = useCallback((citation: Citation) => {
    setActiveCitation(citation);
    setActiveTab("sources");
    // Scroll to the citation in the panel
    setTimeout(() => {
      const element = document.getElementById(`citation-${citation.index}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);

  const simulateResearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setResult(null);
    setActiveCitation(null);

    const stages: PipelineStage[] = [
      "analyzing",
      "searching",
      "ranking",
      "knowledge_graph",
      "synthesizing",
      "quality_check",
      "complete",
    ];

    for (const stage of stages) {
      setCurrentStage(stage);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    // Use the sample data with the user's query
    setResult({
      ...sampleResearchResult,
      query,
    });
    setIsLoading(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Synapse Vault</h1>
                <p className="text-xs text-muted-foreground">Deep Research Agent</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4 text-primary" />
              <span>PhD-level research at your fingertips</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!result && !isLoading ? (
          // Initial state - show query input prominently
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-full max-w-2xl space-y-8">
              <div className="text-center space-y-4">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Brain className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">
                  Start Your Research
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Enter a complex research question and let the AI agent conduct comprehensive, 
                  PhD-level research with verifiable citations.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-6">
                <QueryInput onSubmit={simulateResearch} isLoading={isLoading} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    icon: FileText,
                    title: "Structured Articles",
                    desc: "3000-6000 word research papers",
                  },
                  {
                    icon: Zap,
                    title: "Verified Citations",
                    desc: "20-40 unique sources per article",
                  },
                  {
                    icon: Brain,
                    title: "Quality Assured",
                    desc: "RACE-aligned evaluation",
                  },
                ].map((feature, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card/50 p-4 text-center"
                  >
                    <feature.icon className="mx-auto h-6 w-6 text-primary mb-2" />
                    <h3 className="font-medium text-foreground text-sm">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Loading or results state
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left sidebar - Pipeline and metadata */}
            <aside className="lg:col-span-3 space-y-6">
              <div className="sticky top-24 space-y-6">
                {/* New query input */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <QueryInput
                    onSubmit={simulateResearch}
                    isLoading={isLoading}
                    initialQuery={result?.query}
                  />
                </div>

                {/* Pipeline stages */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <PipelineStages
                    currentStage={currentStage}
                    searchIteration={result?.searchIterations || 0}
                    maxIterations={3}
                  />
                </div>

                {/* Quality scores */}
                {result && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <QualityScoresDisplay scores={result.qualityScores} />
                  </div>
                )}
              </div>
            </aside>

            {/* Main content area */}
            <div className="lg:col-span-6">
              {isLoading && !result ? (
                <div className="rounded-xl border border-border bg-card p-8">
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-4" />
                    <h3 className="text-lg font-semibold text-foreground">
                      Conducting Research
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      Analyzing query, searching sources, and synthesizing findings...
                    </p>
                  </div>
                </div>
              ) : result ? (
                <div className="rounded-xl border border-border bg-card">
                  {/* Tabs for different views on mobile */}
                  <div className="lg:hidden border-b border-border">
                    <div className="flex">
                      {[
                        { id: "article", label: "Article" },
                        { id: "knowledge", label: "Knowledge" },
                        { id: "sources", label: "Sources" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as ViewTab)}
                          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                            activeTab === tab.id
                              ? "border-b-2 border-primary text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Article content */}
                  <div className={`p-6 ${activeTab !== "article" ? "hidden lg:block" : ""}`}>
                    <ResearchHeader
                      query={result.query}
                      language={result.language}
                      searchIterations={result.searchIterations}
                      revisions={result.revisions}
                      articleLength={result.article.length}
                    />
                    <div className="mt-6">
                      <MarkdownRenderer
                        content={result.article}
                        citations={result.citations}
                        onCitationClick={handleCitationClick}
                      />
                    </div>
                  </div>

                  {/* Mobile: Knowledge Graph */}
                  <div className={`p-6 lg:hidden ${activeTab !== "knowledge" ? "hidden" : ""}`}>
                    <SubQuestionsPanel questions={result.subQuestions} />
                    <div className="mt-6">
                      <KnowledgeGraphPanel
                        entities={result.kgEntities}
                        relations={result.kgRelations}
                      />
                    </div>
                  </div>

                  {/* Mobile: Sources */}
                  <div className={`p-6 lg:hidden ${activeTab !== "sources" ? "hidden" : ""}`}>
                    <SearchResultsPanel results={result.searchResults} />
                    <div className="mt-6">
                      <CitationsPanel
                        citations={result.citations}
                        activeCitation={activeCitation}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right sidebar - Sources and citations */}
            <aside className="hidden lg:block lg:col-span-3 space-y-6">
              <div className="sticky top-24 space-y-6">
                {result && (
                  <>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <SubQuestionsPanel questions={result.subQuestions} />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <KnowledgeGraphPanel
                        entities={result.kgEntities}
                        relations={result.kgRelations}
                      />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <SearchResultsPanel results={result.searchResults} />
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <CitationsPanel
                        citations={result.citations}
                        activeCitation={activeCitation}
                      />
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
