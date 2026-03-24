"use client";

import { Clock, RefreshCw, Globe, FileText } from "lucide-react";

interface ResearchHeaderProps {
  query: string;
  language: string;
  searchIterations: number;
  revisions: number;
  articleLength?: number;
}

export function ResearchHeader({
  query,
  language,
  searchIterations,
  revisions,
  articleLength = 0,
}: ResearchHeaderProps) {
  return (
    <div className="space-y-4 border-b border-border pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground leading-tight text-balance">
            {query}
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Globe className="h-4 w-4" />
          <span>{language === "zh" ? "Chinese" : "English"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          <span>{searchIterations} search iterations</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-4 w-4" />
          <span>{revisions} revisions</span>
        </div>
        {articleLength > 0 && (
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            <span>{(articleLength / 1000).toFixed(1)}k characters</span>
          </div>
        )}
      </div>
    </div>
  );
}
