"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type { Citation } from "@/lib/sample-data";

interface CitationsPanelProps {
  citations: Citation[];
  activeCitation?: Citation | null;
}

export function CitationsPanel({ citations, activeCitation }: CitationsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 border-b border-border pb-3"
      >
        <BookOpen className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          References
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {citations.length} citations
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {citations.map((citation) => (
            <a
              key={citation.index}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              id={`citation-${citation.index}`}
              className={`block rounded-lg border p-3 transition-all ${
                activeCitation?.index === citation.index
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/50 hover:bg-card hover:border-primary/30"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/20 text-xs font-semibold text-primary">
                  {citation.index}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground line-clamp-2">
                    {citation.title}
                  </h4>
                  <p className="mt-1 text-xs text-primary/70 truncate">
                    {citation.url}
                  </p>
                </div>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
