"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, Network, ArrowRight, Minimize2, Search, Crosshair } from "lucide-react";
import type { KGEntity, KGRelation } from "@/lib/sample-data";

const ForceGraph = dynamic(() => import("./force-graph"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border border-border bg-card/30 p-8">
      <div className="text-sm text-muted-foreground">Loading graph...</div>
    </div>
  ),
});

interface KnowledgeGraphPanelProps {
  entities: KGEntity[];
  relations: KGRelation[];
}

const entityTypeColors: Record<string, string> = {
  Technology: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Field: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Algorithm: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Organization: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Method: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  Default: "bg-muted text-muted-foreground border-border",
};

type GraphSize = "md" | "full";
const sizeHeights: Record<Exclude<GraphSize, "full">, number> = { md: 600 };

const sizeLabels: { key: GraphSize; label: string }[] = [
  { key: "md", label: "M" },
  { key: "full", label: "FS" },
];

export function KnowledgeGraphPanel({ entities, relations }: KnowledgeGraphPanelProps) {
  const [showEntities, setShowEntities] = useState(false);
  const [showRelations, setShowRelations] = useState(false);
  const [graphSize, setGraphSize] = useState<GraphSize>("md");
  const [fullScreenHeight, setFullScreenHeight] = useState(600);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    if (graphSize !== "full") return;

    setFullScreenHeight(Math.max(window.innerHeight - 120, 400));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGraphSize("md");
      }
    };

    const handleResize = () => {
      setFullScreenHeight(Math.max(window.innerHeight - 120, 400));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [graphSize]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Network className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Knowledge Graph
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {entities.length} entities, {relations.length} relations
        </span>
      </div>

      {entities.length > 0 && (
        <>
          <div className="flex items-center gap-1">
            {sizeLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setGraphSize(key)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  graphSize === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                // Find the ForceGraph container and call its fitView method
                const container = document.querySelector("[data-graph-container]");
                if (container) {
                  const fitView = (container as unknown as Record<string, unknown>).__fitView;
                  if (typeof fitView === "function") fitView();
                }
              }}
              className="rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors flex items-center gap-1"
              title="Reset zoom to fit all nodes"
            >
              <Crosshair className="h-3 w-3" />
              Fit
            </button>
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter nodes..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-6 w-32 rounded border border-border bg-muted/50 pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {graphSize === "full" ? (
            <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Knowledge Graph</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Filter nodes..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="h-7 w-40 rounded border border-border bg-muted/50 pl-6 pr-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setGraphSize("md")}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Minimize2 className="h-4 w-4" />
                    <span>Exit full screen</span>
                    <kbd className="ml-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">Esc</kbd>
                  </button>
                </div>
              </div>
              <div className="flex-1 p-4">
                <ForceGraph entities={entities} relations={relations} height={fullScreenHeight} filter={searchFilter} />
              </div>
            </div>
          ) : (
            <div style={{ height: sizeHeights[graphSize] }} className="overflow-hidden">
              <ForceGraph entities={entities} relations={relations} height={sizeHeights[graphSize]} filter={searchFilter} />
            </div>
          )}
        </>
      )}

      {/* PLACEHOLDER_ENTITIES_RELATIONS */}

      {/* Entities Section */}
      <div>
        <button
          onClick={() => setShowEntities(!showEntities)}
          className="flex w-full items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {showEntities ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Entities
          <span className="text-xs text-muted-foreground">({entities.length})</span>
        </button>
        {showEntities && (
          <div className="mt-2 space-y-2">
            {entities.map((entity, i) => (
              <div key={i} className="rounded-lg border border-border bg-card/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">{entity.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${entityTypeColors[entity.entityType] || entityTypeColors.Default}`}>
                    {entity.entityType}
                  </span>
                </div>
                {entity.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{entity.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Relations Section */}
      <div>
        <button
          onClick={() => setShowRelations(!showRelations)}
          className="flex w-full items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {showRelations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Relations
          <span className="text-xs text-muted-foreground">({relations.length})</span>
        </button>
        {showRelations && (
          <div className="mt-2 space-y-2">
            {relations.map((relation, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-3">
                <span className="text-sm font-medium text-foreground">{relation.source}</span>
                <div className="flex items-center gap-1 text-primary">
                  <div className="h-px w-4 bg-primary/50" />
                  <span className="text-xs italic">{relation.relation}</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
                <span className="text-sm font-medium text-foreground">{relation.target}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
