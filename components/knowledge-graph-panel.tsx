"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Network, ArrowRight } from "lucide-react";
import type { KGEntity, KGRelation } from "@/lib/sample-data";

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

export function KnowledgeGraphPanel({
  entities,
  relations,
}: KnowledgeGraphPanelProps) {
  const [showEntities, setShowEntities] = useState(true);
  const [showRelations, setShowRelations] = useState(true);

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

      {/* Entities Section */}
      <div>
        <button
          onClick={() => setShowEntities(!showEntities)}
          className="flex w-full items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {showEntities ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Entities
          <span className="text-xs text-muted-foreground">({entities.length})</span>
        </button>
        {showEntities && (
          <div className="mt-2 space-y-2">
            {entities.map((entity, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {entity.name}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      entityTypeColors[entity.entityType] ||
                      entityTypeColors.Default
                    }`}
                  >
                    {entity.entityType}
                  </span>
                </div>
                {entity.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entity.description}
                  </p>
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
          {showRelations ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Relations
          <span className="text-xs text-muted-foreground">({relations.length})</span>
        </button>
        {showRelations && (
          <div className="mt-2 space-y-2">
            {relations.map((relation, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-border bg-card/50 p-3"
              >
                <span className="text-sm font-medium text-foreground">
                  {relation.source}
                </span>
                <div className="flex items-center gap-1 text-primary">
                  <div className="h-px w-4 bg-primary/50" />
                  <span className="text-xs italic">{relation.relation}</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {relation.target}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
