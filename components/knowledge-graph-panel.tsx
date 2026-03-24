"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

const entityTypeFills: Record<string, string> = {
  Technology: "#3b82f6",
  Field: "#a855f7",
  Algorithm: "#f59e0b",
  Organization: "#10b981",
  Method: "#ec4899",
  Default: "#6b7280",
};

interface NodePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
  name: string;
  type: string;
}

function ForceGraph({ entities, relations }: KnowledgeGraphPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<NodePos[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<NodePos[]>([]);

  useEffect(() => {
    if (entities.length === 0) return;
    const W = 400, H = 300;
    const initial: NodePos[] = entities.map((e, i) => {
      const angle = (2 * Math.PI * i) / entities.length;
      const r = Math.min(W, H) * 0.3;
      return {
        x: W / 2 + r * Math.cos(angle),
        y: H / 2 + r * Math.sin(angle),
        vx: 0, vy: 0,
        name: e.name,
        type: e.entityType,
      };
    });
    nodesRef.current = initial;
    setNodes([...initial]);

    const nameToIdx = new Map(entities.map((e, i) => [e.name, i]));
    const edges = relations
      .map((r) => ({ s: nameToIdx.get(r.source) ?? -1, t: nameToIdx.get(r.target) ?? -1 }))
      .filter((e) => e.s >= 0 && e.t >= 0);

    let frame = 0;
    const maxFrames = 120;
    const tick = () => {
      const ns = nodesRef.current;
      const alpha = 1 - frame / maxFrames;
      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          let dx = ns[j].x - ns[i].x;
          let dy = ns[j].y - ns[i].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (800 * alpha) / (dist * dist);
          dx = (dx / dist) * force;
          dy = (dy / dist) * force;
          ns[i].vx -= dx; ns[i].vy -= dy;
          ns[j].vx += dx; ns[j].vy += dy;
        }
      }
      // Attraction along edges
      for (const { s, t } of edges) {
        let dx = ns[t].x - ns[s].x;
        let dy = ns[t].y - ns[s].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 80) * 0.02 * alpha;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        ns[s].vx += dx; ns[s].vy += dy;
        ns[t].vx -= dx; ns[t].vy -= dy;
      }
      // Center gravity
      for (const n of ns) {
        n.vx += (200 - n.x) * 0.005 * alpha;
        n.vy += (150 - n.y) * 0.005 * alpha;
      }
      // Apply velocity with damping and clamp
      for (const n of ns) {
        n.vx *= 0.6; n.vy *= 0.6;
        n.x = Math.max(30, Math.min(370, n.x + n.vx));
        n.y = Math.max(30, Math.min(270, n.y + n.vy));
      }
      setNodes([...ns]);
    };
    animRef.current = requestAnimationFrame(function loop() {
      if (frame < maxFrames) { tick(); frame++; animRef.current = requestAnimationFrame(loop); }
    });
    return () => cancelAnimationFrame(animRef.current);
  }, [entities, relations]);

  const nameToIdx = new Map(entities.map((e, i) => [e.name, i]));
  const edgesForRender = relations
    .map((r) => ({ s: nameToIdx.get(r.source) ?? -1, t: nameToIdx.get(r.target) ?? -1, label: r.relation }))
    .filter((e) => e.s >= 0 && e.t >= 0);

  if (nodes.length === 0) return null;

  return (
    <svg ref={svgRef} viewBox="0 0 400 300" className="w-full rounded-lg bg-card/30 border border-border">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="currentColor" className="text-muted-foreground/50" />
        </marker>
      </defs>
      {edgesForRender.map((e, i) => {
        const src = nodes[e.s];
        const tgt = nodes[e.t];
        if (!src || !tgt) return null;
        const mx = (src.x + tgt.x) / 2;
        const my = (src.y + tgt.y) / 2;
        return (
          <g key={`edge-${i}`}>
            <line x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
              stroke="currentColor" className="text-muted-foreground/30" strokeWidth={1}
              markerEnd="url(#arrowhead)" />
            <text x={mx} y={my - 4} textAnchor="middle" fontSize={7}
              fill="currentColor" className="text-muted-foreground/60">{e.label}</text>
          </g>
        );
      })}
      {nodes.map((n, i) => {
        const fill = entityTypeFills[n.type] || entityTypeFills.Default;
        const isHovered = hoveredNode === n.name;
        return (
          <g key={`node-${i}`}
            onMouseEnter={() => setHoveredNode(n.name)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: "pointer" }}>
            <circle cx={n.x} cy={n.y} r={isHovered ? 14 : 10}
              fill={fill} opacity={isHovered ? 0.9 : 0.7}
              stroke={fill} strokeWidth={isHovered ? 2 : 0} />
            <text x={n.x} y={n.y + (isHovered ? 22 : 18)} textAnchor="middle"
              fontSize={isHovered ? 9 : 7} fontWeight={isHovered ? 600 : 400}
              fill="currentColor" className="text-foreground">{n.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function KnowledgeGraphPanel({ entities, relations }: KnowledgeGraphPanelProps) {
  const [showEntities, setShowEntities] = useState(false);
  const [showRelations, setShowRelations] = useState(false);

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

      {entities.length > 0 && <ForceGraph entities={entities} relations={relations} />}

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
