"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";
import { forceCollide, forceManyBody, forceLink } from "d3-force";
import type { KGEntity, KGRelation } from "@/lib/sample-data";

const entityTypeFills: Record<string, string> = {
  Technology: "#3b82f6",
  Field: "#a855f7",
  Algorithm: "#f59e0b",
  Organization: "#10b981",
  Method: "#ec4899",
  Default: "#6b7280",
};

interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  color: string;
  neighbors: GraphNode[];
  links: GraphLink[];
  degree: number;
  __filtered?: boolean;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
}

interface ForceGraphProps {
  entities: KGEntity[];
  relations: KGRelation[];
  height: number;
  filter?: string;
  onFitView?: () => void;
}

export default function ForceGraph({ entities, relations, height, filter }: ForceGraphProps) {
  const fgRef = useRef<ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightNodes, setHighlightNodes] = useState<Set<GraphNode>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<GraphLink>>(new Set());
  const [focusedNode, setFocusedNode] = useState<GraphNode | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const restingView = useRef<{ x: number; y: number; zoom: number } | null>(null);

  const graphData = useMemo(() => {
    const entityNames = new Set(entities.map((e) => e.name));
    const degreeCounts = new Map<string, number>();

    // Count degrees first
    for (const r of relations) {
      if (entityNames.has(r.source) && entityNames.has(r.target)) {
        degreeCounts.set(r.source, (degreeCounts.get(r.source) ?? 0) + 1);
        degreeCounts.set(r.target, (degreeCounts.get(r.target) ?? 0) + 1);
      }
    }

    const nodes: GraphNode[] = entities.map((e) => ({
      id: e.name,
      label: e.name,
      type: e.entityType,
      description: e.description,
      color: entityTypeFills[e.entityType] || entityTypeFills.Default,
      neighbors: [],
      links: [],
      degree: degreeCounts.get(e.name) ?? 0,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const links: GraphLink[] = relations
      .filter((r) => entityNames.has(r.source) && entityNames.has(r.target))
      .map((r) => {
        const link: GraphLink = { source: r.source, target: r.target, label: r.relation };
        const srcNode = nodeMap.get(r.source);
        const tgtNode = nodeMap.get(r.target);
        if (srcNode && tgtNode) {
          srcNode.neighbors.push(tgtNode);
          tgtNode.neighbors.push(srcNode);
          srcNode.links.push(link);
          tgtNode.links.push(link);
        }
        return link;
      });

    return { nodes, links };
  }, [entities, relations]);

  const nodeCount = graphData.nodes.length;
  const isLargeGraph = nodeCount > 20;

  // Apply filter
  useEffect(() => {
    const term = filter?.trim().toLowerCase();
    for (const node of graphData.nodes) {
      node.__filtered = term ? !node.label.toLowerCase().includes(term) : false;
    }
  }, [filter, graphData]);

  // Configure d3-force: scale parameters by graph density
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const n = nodeCount;

    // Stronger repulsion for denser graphs, prevent collapse
    const chargeStrength = -Math.min(150 + n * 10, 1500);
    fg.d3Force("charge", forceManyBody().strength(chargeStrength));

    // Longer links for denser graphs
    const linkDist = 80 + Math.min(n * 3, 150);
    fg.d3Force("link", forceLink().distance(linkDist));

    // Larger collision radius for denser graphs
    const collideRadius = 18 + Math.min(n * 0.6, 20);
    fg.d3Force("collide", forceCollide(collideRadius));

    fg.d3ReheatSimulation();
  }, [nodeCount]);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Prevent scroll-to-zoom hijacking — only allow pinch (ctrl+wheel)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      // Allow pinch zoom (ctrl+wheel or meta+wheel) but block normal scroll zoom
      if (!e.ctrlKey && !e.metaKey) {
        e.stopPropagation();
      }
    };

    // Capture phase to intercept before react-force-graph's handler
    el.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  // Reset resting view when data changes
  useEffect(() => {
    restingView.current = null;
  }, [graphData]);

  const updateHighlight = useCallback((node: GraphNode | null, focused: GraphNode | null) => {
    const activeNode = node || focused;
    const nextNodes = new Set<GraphNode>();
    const nextLinks = new Set<GraphLink>();
    if (activeNode) {
      nextNodes.add(activeNode);
      for (const neighbor of activeNode.neighbors) nextNodes.add(neighbor);
      for (const link of activeNode.links) nextLinks.add(link);
    }
    setHighlightNodes(nextNodes);
    setHighlightLinks(nextLinks);
  }, []);

  const handleNodeHover = useCallback(
    (node: GraphNode | null) => {
      if (node) {
        updateHighlight(node, focusedNode);
        if (node.description) {
          setTooltip({ text: `${node.label} (${node.type})\n${node.description}`, x: node.x ?? 0, y: node.y ?? 0 });
        }
      } else {
        updateHighlight(null, focusedNode);
        setTooltip(null);
      }
    },
    [focusedNode, updateHighlight],
  );

  // Capture resting view when simulation settles
  const handleEngineStop = useCallback(() => {
    const fg = fgRef.current;
    if (!fg || restingView.current) return;
    fg.zoomToFit(400, 80);
    setTimeout(() => {
      const center = fg.centerAt();
      const zoom = fg.zoom();
      if (center && zoom) {
        restingView.current = { x: center.x, y: center.y, zoom };
      }
    }, 450);
  }, []);

  const restoreRestingView = useCallback(() => {
    const fg = fgRef.current;
    const rv = restingView.current;
    if (fg && rv) {
      fg.centerAt(rv.x, rv.y, 400);
      fg.zoom(rv.zoom, 400);
    } else {
      fg?.zoomToFit(400, 80);
    }
  }, []);

  // Public method for external "Fit View" button
  const fitView = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    setFocusedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setTooltip(null);
    fg.zoomToFit(400, 80);
    setTimeout(() => {
      const center = fg.centerAt();
      const zoom = fg.zoom();
      if (center && zoom) {
        restingView.current = { x: center.x, y: center.y, zoom };
      }
    }, 450);
  }, []);

  // Expose fitView on the container's dataset for parent access
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      (el as unknown as Record<string, unknown>).__fitView = fitView;
    }
  }, [fitView]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (focusedNode && focusedNode.id === node.id) {
        setFocusedNode(null);
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
        restoreRestingView();
      } else {
        setFocusedNode(node);
        updateHighlight(node, node);
        fgRef.current?.centerAt(node.x, node.y, 400);
        fgRef.current?.zoom(3, 400);
      }
    },
    [focusedNode, updateHighlight, restoreRestingView],
  );

  const handleBackgroundClick = useCallback(() => {
    setFocusedNode(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setTooltip(null);
    restoreRestingView();
  }, [restoreRestingView]);

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isHighlighted = highlightNodes.has(node);
      const isFocused = focusedNode?.id === node.id;
      const somethingHighlighted = highlightNodes.size > 0;
      const isFiltered = node.__filtered;

      let alpha = 1;
      if (isFiltered) alpha = 0.06;
      else if (somethingHighlighted && !isHighlighted) alpha = 0.12;

      // Scale node size by degree (more connections = bigger)
      const baseRadius = isFocused ? 10 : isHighlighted ? 8 : 5 + Math.min(node.degree * 0.5, 3);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Shadow glow for highlighted nodes
      if ((isHighlighted || isFocused) && !isFiltered) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = isFocused ? 20 : 12;

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(x, y, baseRadius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = alpha * 0.15;
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 0;
      }

      // Main node circle
      ctx.beginPath();
      ctx.arc(x, y, baseRadius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Thin border for definition
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Label: always show
      const showLabel = !isFiltered;
      if (showLabel) {
        // Clamp font size: never below 10px screen pixels
        const rawFontSize = (isFocused ? 14 : isHighlighted ? 12 : 11) / globalScale;
        const minFontPx = 10 / globalScale;
        const fontSize = Math.max(rawFontSize, minFontPx);

        ctx.font = `${isFocused || isHighlighted ? "600 " : ""}${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        const labelY = y + baseRadius + 3;

        // Text outline for contrast
        ctx.strokeStyle = "rgba(10, 10, 10, 0.9)";
        ctx.lineWidth = 3 / globalScale;
        ctx.lineJoin = "round";
        ctx.strokeText(node.label, x, labelY);

        // Text fill
        ctx.fillStyle = isFocused ? "#ffffff" : isHighlighted ? "#f1f5f9" : "#cbd5e1";
        ctx.fillText(node.label, x, labelY);
      }

      ctx.restore();
    },
    [highlightNodes, focusedNode, isLargeGraph],
  );

  // Link canvas rendering for curved links with labels
  const linkCanvasObject = useCallback(
    (link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;
      if (!source.x || !target.x) return;

      const isHighlighted = highlightLinks.has(link);
      const somethingHighlighted = highlightNodes.size > 0;

      let alpha = 0.6;
      if (somethingHighlighted && !isHighlighted) alpha = 0.08;
      if (isHighlighted) alpha = 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Draw curved line
      const dx = target.x! - source.x!;
      const dy = target.y! - source.y!;
      const curvature = 0.15;
      const cx = (source.x! + target.x!) / 2 - dy * curvature;
      const cy = (source.y! + target.y!) / 2 + dx * curvature;

      ctx.beginPath();
      ctx.moveTo(source.x!, source.y!);
      ctx.quadraticCurveTo(cx, cy, target.x!, target.y!);
      ctx.strokeStyle = isHighlighted ? "#818cf8" : "#334155";
      ctx.lineWidth = isHighlighted ? 2 : 0.8;
      ctx.stroke();

      // Arrow at target
      const angle = Math.atan2(target.y! - cy, target.x! - cx);
      const arrowLen = isHighlighted ? 6 : 4;
      const targetRadius = 5 + Math.min((target as GraphNode).degree * 0.5, 3);
      const arrowX = target.x! - Math.cos(angle) * (targetRadius + 2);
      const arrowY = target.y! - Math.sin(angle) * (targetRadius + 2);

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        arrowX - arrowLen * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = isHighlighted ? "#818cf8" : "#334155";
      ctx.fill();

      // Show link label when highlighted
      if (isHighlighted && link.label) {
        const labelX = cx;
        const labelY = cy;
        const fontSize = Math.max(9 / globalScale, 8 / globalScale);
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Background pill
        const metrics = ctx.measureText(link.label);
        const padX = 4 / globalScale;
        const padY = 2 / globalScale;
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.beginPath();
        const rr = 3 / globalScale;
        ctx.roundRect(
          labelX - metrics.width / 2 - padX,
          labelY - fontSize / 2 - padY,
          metrics.width + padX * 2,
          fontSize + padY * 2,
          rr
        );
        ctx.fill();

        ctx.fillStyle = "#a5b4fc";
        ctx.fillText(link.label, labelX, labelY);
      }

      ctx.restore();
    },
    [highlightLinks, highlightNodes],
  );

  return (
    <div ref={containerRef} data-graph-container className="relative w-full rounded-lg bg-card/30 border border-border" style={{ height }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={containerWidth}
        height={height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace"}
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={() => "replace"}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={handleEngineStop}
        autoPauseRedraw={false}
        backgroundColor="transparent"
        cooldownTicks={200}
        minZoom={0.3}
        maxZoom={8}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-border bg-popover/95 backdrop-blur px-3 py-2 text-xs text-popover-foreground shadow-xl"
          style={{
            left: "50%",
            top: 8,
            transform: "translateX(-50%)",
          }}
        >
          <div className="whitespace-pre-line">{tooltip.text}</div>
        </div>
      )}
      {/* Fit view hint */}
      <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/40">
        Ctrl+scroll to zoom · Click node to focus
      </div>
    </div>
  );
}
