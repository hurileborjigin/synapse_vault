"use client";

import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronRight, Search } from "lucide-react";
import type { SearchResult } from "@/lib/sample-data";

interface SearchResultsPanelProps {
  results: SearchResult[];
}

function RelevanceIndicator({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score >= 8) return "bg-emerald-500";
    if (score >= 6) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-2 w-2 rounded-full ${getColor(score)}`}
        title={`Relevance: ${score.toFixed(1)}/10`}
      />
      <span className="text-xs font-mono text-muted-foreground">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export function SearchResultsPanel({ results }: SearchResultsPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const displayResults = showAll ? results : results.slice(0, 5);
  const sortedResults = [...displayResults].sort(
    (a, b) => b.relevanceScore - a.relevanceScore
  );

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 border-b border-border pb-3"
      >
        <Search className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Search Results
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {results.length} sources
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          {sortedResults.map((result, i) => (
            <a
              key={i}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-border bg-card/50 p-3 transition-colors hover:bg-card hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-foreground line-clamp-1">
                  {result.title}
                </h4>
                <div className="flex items-center gap-2 shrink-0">
                  <RelevanceIndicator score={result.relevanceScore} />
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {result.snippet}
              </p>
              <p className="mt-1 text-xs text-primary/70 truncate">
                {result.url}
              </p>
            </a>
          ))}

          {results.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-center text-xs text-primary hover:underline py-2"
            >
              {showAll
                ? "Show less"
                : `Show ${results.length - 5} more results`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
