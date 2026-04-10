"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Brain, Zap, FileText, Settings, XCircle, ChevronDown, ChevronRight, CheckCircle2, Loader2, PanelLeftOpen, PanelRightOpen, PanelLeftClose, PanelRightClose, History, Clock, Network } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { QualityScoresDisplay } from "@/components/quality-scores";
import { PipelineStages, type PipelineStage } from "@/components/pipeline-stages";
import { KnowledgeGraphPanel } from "@/components/knowledge-graph-panel";
import { SearchResultsPanel } from "@/components/search-results-panel";
import { CitationsPanel } from "@/components/citations-panel";
import { SubQuestionsPanel } from "@/components/sub-questions-panel";
import { QueryInput } from "@/components/query-input";
import { ResearchHeader } from "@/components/research-header";
import { SettingsModal } from "@/components/settings-modal";
import { SessionHistoryPanel } from "@/components/session-history-panel";
import { startResearch, resumeResearch, type TopicProposal } from "@/lib/research-api";
import { getSessions, saveSession, deleteSession, clearSessions, type SavedSession } from "@/lib/session-history";
import type { Citation, ResearchResult, SubQuestion } from "@/lib/sample-data";
import { TopicApprovalPanel } from "@/components/topic-approval-panel";

type ViewTab = "article" | "knowledge" | "sources";

const stageOrder = ["analyzing", "awaiting_approval", "searching", "ranking", "knowledge_graph", "synthesizing", "quality_check", "complete"];

function stageIsActive(stage: string, currentStage: PipelineStage) {
  return stage === currentStage;
}

function stageIsDone(stage: string, currentStage: PipelineStage) {
  const si = stageOrder.indexOf(stage);
  const ci = stageOrder.indexOf(currentStage);
  return ci > si;
}

function IntermediateSection({
  title, stage, currentStage, ready, badge, children,
}: {
  title: string;
  stage: string;
  currentStage: PipelineStage;
  ready: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const active = stageIsActive(stage, currentStage);
  const done = stageIsDone(stage, currentStage);
  const [open, setOpen] = useState(true);

  if (!ready && !active) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        {active && !done ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        ) : done || ready ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : null}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {badge && <span className="text-xs text-muted-foreground">{badge}</span>}
        <span className="ml-auto">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </span>
      </button>
      {open && (ready || active) && (
        <div className="space-y-2 px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [partialResult, setPartialResult] = useState<Partial<ResearchResult>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<PipelineStage>("idle");
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>("article");
  const [centerView, setCenterView] = useState<"article" | "knowledge">("article");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Human-in-the-loop state
  const [pendingApproval, setPendingApproval] = useState<TopicProposal | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  // Collapsible sidebars
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Session history
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refreshSessions = useCallback(async () => {
    setSessions(await getSessions());
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  // Column span classes (statically analyzable for Tailwind)
  const mainSpanClass: Record<number, string> = { 6: "lg:col-span-6", 8: "lg:col-span-8", 10: "lg:col-span-10" };
  const leftSpan = leftCollapsed ? 1 : 3;
  const rightSpan = rightCollapsed ? 1 : 3;
  const mainSpan = 12 - leftSpan - rightSpan;
  const leftSpanClass = leftCollapsed ? "lg:col-span-1" : "lg:col-span-3";
  const rightSpanClass = rightCollapsed ? "lg:col-span-1" : "lg:col-span-3";

  const handleCitationClick = useCallback((citation: Citation) => {
    setActiveCitation(citation);
    setActiveTab("sources");
    // Scroll to the citation in the panel
    setTimeout(() => {
      const element = document.getElementById(`citation-${citation.index}`);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setPendingApproval(null);
    setThreadId(null);
    setCurrentStage("idle");
  }, []);

  // Handle topic approval from TopicApprovalPanel
  const handleTopicApproval = useCallback(async (approvedQuestions: SubQuestion[]) => {
    if (!threadId) return;

    setPendingApproval(null);
    setCurrentStage("searching" as PipelineStage);

    const controller = new AbortController();
    abortRef.current = controller;

    let searchIterations = 0;
    let revisionCount = 0;

    await resumeResearch(threadId, { subQuestions: approvedQuestions }, {
      onStageChange: (stage) => {
        console.log(`[PAGE] resume stageChange → ${stage}`);
        setCurrentStage(stage as PipelineStage);
      },
      onSubQuestions: (subQuestions) => {
        setPartialResult((prev) => ({ ...prev, subQuestions }));
      },
      onSearchResults: (searchResults, iteration) => {
        searchIterations = iteration;
        setPartialResult((prev) => ({
          ...prev,
          searchResults: [...(prev.searchResults ?? []), ...searchResults],
          searchIterations: iteration,
        }));
      },
      onRanking: (searchResults) => {
        setPartialResult((prev) => ({ ...prev, searchResults }));
      },
      onKnowledgeGraph: (kgEntities, kgRelations) => {
        setPartialResult((prev) => ({ ...prev, kgEntities, kgRelations }));
      },
      onSynthesis: (article, citations) => {
        setPartialResult((prev) => ({ ...prev, article, citations }));
      },
      onQuality: (qualityScores, _passed, revisions) => {
        revisionCount = revisions;
        setPartialResult((prev) => ({ ...prev, qualityScores }));
      },
      onComplete: (completedResult) => {
        setPartialResult((prev) => {
          const final: ResearchResult = completedResult ?? {
            query: prev.query ?? "",
            language: prev.language ?? "en",
            subQuestions: prev.subQuestions ?? [],
            searchResults: prev.searchResults ?? [],
            kgEntities: prev.kgEntities ?? [],
            kgRelations: prev.kgRelations ?? [],
            article: prev.article ?? "",
            citations: prev.citations ?? [],
            qualityScores: prev.qualityScores ?? {
              comprehensiveness: 0, insight: 0, instruction_following: 0, readability: 0,
            },
            searchIterations,
            revisions: revisionCount,
          };
          setResult(final);
          saveSession(final);
          void refreshSessions();
          return prev;
        });
        setIsLoading(false);
        setThreadId(null);
      },
      onError: (message) => {
        console.error("[PAGE] resume error:", message);
        setIsLoading(false);
        setThreadId(null);
      },
    }, controller.signal).catch((err) => {
      console.error("[PAGE] resumeResearch threw:", err);
    });
  }, [threadId, refreshSessions]);

  const handleResearch = useCallback(async (query: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setResult(null);
    setPartialResult({ query, language: "en" });
    setActiveCitation(null);
    setCurrentStage("analyzing");

    let searchIterations = 0;
    let revisionCount = 0;

    await startResearch(query, "en", {
      onStageChange: (stage) => {
        console.log(`[PAGE] stageChange → ${stage}`);
        setCurrentStage(stage as PipelineStage);
      },
      onSubQuestions: (subQuestions) => {
        console.log(`[PAGE] subQuestions: ${subQuestions.length}`);
        setPartialResult((prev) => ({ ...prev, subQuestions }));
      },
      onSearchResults: (searchResults, iteration) => {
        console.log(`[PAGE] searchResults: ${searchResults.length}, iteration=${iteration}`);
        searchIterations = iteration;
        setPartialResult((prev) => ({
          ...prev,
          searchResults: [...(prev.searchResults ?? []), ...searchResults],
          searchIterations: iteration,
        }));
      },
      onRanking: (searchResults) => {
        console.log(`[PAGE] ranking: ${searchResults.length} results`);
        setPartialResult((prev) => ({ ...prev, searchResults }));
      },
      onKnowledgeGraph: (kgEntities, kgRelations) => {
        console.log(`[PAGE] knowledgeGraph: ${kgEntities.length} entities, ${kgRelations.length} relations`);
        setPartialResult((prev) => ({ ...prev, kgEntities, kgRelations }));
      },
      onSynthesis: (article, citations) => {
        console.log(`[PAGE] synthesis: article=${article?.length ?? 0} chars, citations=${citations?.length ?? 0}`);
        setPartialResult((prev) => ({ ...prev, article, citations }));
      },
      onQuality: (qualityScores, _passed, revisions) => {
        console.log(`[PAGE] quality: passed=${_passed}, revision=${revisions}`, qualityScores);
        revisionCount = revisions;
        setPartialResult((prev) => ({ ...prev, qualityScores }));
      },
      onComplete: (completedResult) => {
        console.log(`[PAGE] complete: hasResult=${!!completedResult}, articleLen=${completedResult?.article?.length ?? 0}, citations=${completedResult?.citations?.length ?? 0}`);
        setPartialResult((prev) => {
          const final: ResearchResult = completedResult ?? {
            query,
            language: prev.language ?? "en",
            subQuestions: prev.subQuestions ?? [],
            searchResults: prev.searchResults ?? [],
            kgEntities: prev.kgEntities ?? [],
            kgRelations: prev.kgRelations ?? [],
            article: prev.article ?? "",
            citations: prev.citations ?? [],
            qualityScores: prev.qualityScores ?? {
              comprehensiveness: 0, insight: 0, instruction_following: 0, readability: 0,
            },
            searchIterations,
            revisions: revisionCount,
          };
          console.log(`[PAGE] setting final result: article=${final.article.length} chars, citations=${final.citations.length}`);
          setResult(final);
          saveSession(final);
          void refreshSessions();
          return prev;
        });
        setIsLoading(false);
      },
      onError: (message) => {
        console.error("[PAGE] error:", message);
        setIsLoading(false);
      },
      onApprovalNeeded: (proposal) => {
        console.log("[PAGE] approvalNeeded:", proposal.subQuestions.length, "topics");
        setThreadId(proposal.threadId);
        setPendingApproval(proposal);
        // Also set sub-questions in partialResult so the section renders
        setPartialResult((prev) => ({ ...prev, subQuestions: proposal.subQuestions }));
        setCurrentStage("awaiting_approval" as PipelineStage);
      },
    }, controller.signal).catch((err) => {
      console.error("[PAGE] startResearch threw:", err);
    });
  }, []);

  const handleLoadSession = useCallback((session: SavedSession) => {
    setResult(session.result);
    setPartialResult({});
    setIsLoading(false);
    setCurrentStage("complete");
    setHistoryOpen(false);
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    void deleteSession(id).then(refreshSessions);
  }, [refreshSessions]);

  const handleClearSessions = useCallback(() => {
    void clearSessions().then(refreshSessions);
  }, [refreshSessions]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <button
              onClick={() => {
                abortRef.current?.abort();
                abortRef.current = null;
                setResult(null);
                setPartialResult({});
                setIsLoading(false);
                setCurrentStage("idle");
                setActiveCitation(null);
                setActiveTab("article");
              }}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="text-left">
                <h1 className="text-lg font-semibold text-foreground">Synapse Vault</h1>
                <p className="text-xs text-muted-foreground">Deep Research Agent</p>
              </div>
            </button>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="relative">
                <button
                  onClick={() => setHistoryOpen(!historyOpen)}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  <History className="h-4 w-4" />
                  <span>History</span>
                  {sessions.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs text-primary">{sessions.length}</span>
                  )}
                </button>
                {historyOpen && (
                  <SessionHistoryPanel
                    sessions={sessions}
                    onLoad={handleLoadSession}
                    onDelete={handleDeleteSession}
                    onClearAll={handleClearSessions}
                    onClose={() => setHistoryOpen(false)}
                  />
                )}
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span>PhD-level research at your fingertips</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto px-4 py-8 sm:px-6 lg:px-8">
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
                <QueryInput onSubmit={handleResearch} isLoading={isLoading} />
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

              {sessions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Recent Research
                  </h3>
                  <div className="space-y-2">
                    {sessions.slice(0, 5).map((session) => (
                      <button
                        key={session.id}
                        onClick={() => handleLoadSession(session)}
                        className="w-full rounded-lg border border-border bg-card/50 p-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <p className="text-sm text-foreground truncate">{session.query}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(session.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Loading or results state
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left sidebar - Pipeline and metadata */}
            <aside className={`${leftSpanClass} space-y-6`}>
              <div className="sticky top-24 space-y-6">
                {/* Collapse toggle - desktop only */}
                <button
                  onClick={() => setLeftCollapsed(!leftCollapsed)}
                  className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {leftCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  {!leftCollapsed && <span>Collapse</span>}
                </button>

                {!leftCollapsed && (
                  <>
                    {/* New query input */}
                    <div className="rounded-xl border border-border bg-card p-4">
                      <QueryInput
                        onSubmit={handleResearch}
                        isLoading={isLoading}
                        initialQuery={result?.query}
                      />
                    </div>

                    {/* Pipeline stages */}
                    <div className="rounded-xl border border-border bg-card p-4">
                      <PipelineStages
                        currentStage={currentStage}
                        searchIteration={result?.searchIterations || partialResult.searchIterations || 0}
                        maxIterations={3}
                      />
                    </div>

                    {/* Quality scores */}
                    {(result?.qualityScores || partialResult.qualityScores) && (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <QualityScoresDisplay scores={(result?.qualityScores || partialResult.qualityScores)!} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>

            {/* Main content area */}
            <div className={mainSpanClass[mainSpan] || "lg:col-span-6"}>
              {isLoading && !result ? (
                <div className="space-y-4">
                  {/* Cancel bar */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-sm font-medium text-foreground">Researching...</span>
                    </div>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>

                  <IntermediateSection title="Query Analysis" stage="analyzing" currentStage={
                    /* Treat awaiting_approval as still in analyzing stage for this section */
                    currentStage === "awaiting_approval" ? ("analyzing" as PipelineStage) : currentStage
                  }
                    ready={!!partialResult.subQuestions?.length || !!pendingApproval}>
                    {pendingApproval ? (
                      <TopicApprovalPanel
                        proposal={pendingApproval}
                        onApprove={handleTopicApproval}
                        onCancel={handleCancel}
                      />
                    ) : (
                      partialResult.subQuestions?.map((q, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-border bg-card/50 p-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {q.priority}
                          </span>
                          <div>
                            <p className="text-sm text-foreground">{q.question}</p>
                            {q.searchQueries.length > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Queries: {q.searchQueries.join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </IntermediateSection>

                  <IntermediateSection title="Search Results" stage="searching" currentStage={currentStage}
                    ready={!!partialResult.searchResults?.length}
                    badge={partialResult.searchResults?.length ? `${partialResult.searchResults.length} results` : undefined}>
                    {partialResult.searchResults?.slice(0, 10).map((r, i) => (
                      <div key={i} className="rounded-lg border border-border bg-card/50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline line-clamp-1">{r.title}</a>
                          {r.relevanceScore > 0 && (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {r.relevanceScore.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.snippet}</p>
                      </div>
                    ))}
                    {(partialResult.searchResults?.length ?? 0) > 10 && (
                      <p className="text-xs text-muted-foreground text-center">
                        + {partialResult.searchResults!.length - 10} more results
                      </p>
                    )}
                  </IntermediateSection>

                  <IntermediateSection title="Knowledge Graph" stage="knowledge_graph" currentStage={currentStage}
                    ready={!!partialResult.kgEntities?.length}>
                    <KnowledgeGraphPanel
                      entities={partialResult.kgEntities ?? []}
                      relations={partialResult.kgRelations ?? []}
                    />
                  </IntermediateSection>

                  <IntermediateSection title="Article Draft" stage="synthesizing" currentStage={currentStage}
                    ready={!!partialResult.article}>
                    {partialResult.article && (
                      <MarkdownRenderer
                        content={partialResult.article}
                        citations={partialResult.citations ?? []}
                        onCitationClick={handleCitationClick}
                      />
                    )}
                  </IntermediateSection>

                  <IntermediateSection title="Quality Assessment" stage="quality_check" currentStage={currentStage}
                    ready={!!partialResult.qualityScores}>
                    {partialResult.qualityScores && (
                      <QualityScoresDisplay scores={partialResult.qualityScores} />
                    )}
                  </IntermediateSection>
                </div>
              ) : result ? (
                <div className="rounded-xl border border-border bg-card">
                  {/* Desktop: Article / Knowledge Graph toggle */}
                  <div className="hidden lg:flex border-b border-border">
                    <button
                      onClick={() => setCenterView("article")}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                        centerView === "article"
                          ? "border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      Article
                    </button>
                    <button
                      onClick={() => setCenterView("knowledge")}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                        centerView === "knowledge"
                          ? "border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Network className="h-4 w-4" />
                      Knowledge Graph
                    </button>
                  </div>

                  {/* Mobile tabs */}
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

                  {/* Desktop: Article content (hidden when KG selected) */}
                  <div className={`p-6 ${centerView !== "article" ? "hidden" : ""} ${activeTab !== "article" ? "hidden lg:block" : ""}`}>
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

                  {/* Desktop: Center Knowledge Graph view */}
                  <div className={`p-6 ${centerView !== "knowledge" ? "hidden" : ""} hidden lg:block`}>
                    <KnowledgeGraphPanel
                      entities={result.kgEntities}
                      relations={result.kgRelations}
                    />
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
            <aside className={`hidden lg:block ${rightSpanClass} space-y-6`}>
              <div className="sticky top-24 space-y-6">
                {/* Collapse toggle */}
                <button
                  onClick={() => setRightCollapsed(!rightCollapsed)}
                  className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                >
                  {!rightCollapsed && <span>Collapse</span>}
                  {rightCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
                </button>

                {!rightCollapsed && (result || isLoading) && (
                  <>
                    {(result?.subQuestions || partialResult.subQuestions)?.length ? (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <SubQuestionsPanel questions={(result?.subQuestions || partialResult.subQuestions)!} />
                      </div>
                    ) : null}
                    {(result?.kgEntities || partialResult.kgEntities)?.length ? (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <KnowledgeGraphPanel
                          entities={(result?.kgEntities || partialResult.kgEntities)!}
                          relations={(result?.kgRelations || partialResult.kgRelations) ?? []}
                        />
                      </div>
                    ) : null}
                    {(result?.searchResults || partialResult.searchResults)?.length ? (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <SearchResultsPanel results={(result?.searchResults || partialResult.searchResults)!} />
                      </div>
                    ) : null}
                    {(result?.citations || partialResult.citations)?.length ? (
                      <div className="rounded-xl border border-border bg-card p-4">
                        <CitationsPanel
                          citations={(result?.citations || partialResult.citations)!}
                          activeCitation={activeCitation}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
