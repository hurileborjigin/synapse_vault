"use client";

import {
  Search,
  Brain,
  FileText,
  CheckCircle,
  Network,
  BarChart3,
  UserCheck,
} from "lucide-react";

export type PipelineStage =
  | "idle"
  | "analyzing"
  | "awaiting_approval"
  | "searching"
  | "ranking"
  | "knowledge_graph"
  | "synthesizing"
  | "quality_check"
  | "complete";

interface PipelineStagesProps {
  currentStage: PipelineStage;
  searchIteration?: number;
  maxIterations?: number;
}

const stages = [
  { id: "analyzing", label: "Query Analysis", icon: Brain },
  { id: "awaiting_approval", label: "Topic Review", icon: UserCheck },
  { id: "searching", label: "Web Search", icon: Search },
  { id: "ranking", label: "Relevance Ranking", icon: BarChart3 },
  { id: "knowledge_graph", label: "Knowledge Graph", icon: Network },
  { id: "synthesizing", label: "Synthesis", icon: FileText },
  { id: "quality_check", label: "Quality Gate", icon: CheckCircle },
] as const;

export function PipelineStages({
  currentStage,
  searchIteration = 0,
  maxIterations = 3,
}: PipelineStagesProps) {
  const getStageStatus = (stageId: string) => {
    if (currentStage === "idle") return "pending";
    if (currentStage === "complete") return "complete";

    const currentIndex = stages.findIndex((s) => s.id === currentStage);
    const stageIndex = stages.findIndex((s) => s.id === stageId);

    if (stageIndex < currentIndex) return "complete";
    if (stageIndex === currentIndex) return "active";
    return "pending";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Processing Pipeline
        </h3>
        {searchIteration > 0 && (
          <span className="text-xs text-muted-foreground">
            Iteration {searchIteration}/{maxIterations}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {stages.map((stage, index) => {
          const status = getStageStatus(stage.id);
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  status === "active"
                    ? "bg-primary text-primary-foreground pulse-active"
                    : status === "complete"
                    ? "bg-emerald-500/20 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-medium ${
                      status === "active"
                        ? "text-foreground"
                        : status === "complete"
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </span>
                  {status === "active" && (
                    <span className="text-xs text-primary animate-pulse">
                      {stage.id === "awaiting_approval" ? "Awaiting input..." : "Processing..."}
                    </span>
                  )}
                  {status === "complete" && (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                {index < stages.length - 1 && (
                  <div
                    className={`ml-4 mt-1 h-3 w-px ${
                      status === "complete" ? "bg-emerald-500/50" : "bg-border"
                    }`}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
