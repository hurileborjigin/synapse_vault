"use client";

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from "react-force-graph-2d";
import { forceCollide } from "d3-force";
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
    const nodes: GraphNode[] = entities.map((e) => ({
      id: e.name,
      label: e.name,
      type: e.entityType,
      description: e.description,
      color: entityTypeFills[e.entityType] || entityTypeFills.Default,
      neighbors: [],
      links: [],
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

  // Apply filter
  useEffect(() => {
    const term = filter?.trim().toLowerCase();
    for (const node of graphData.nodes) {
      node.__filtered = term ? !node.label.toLowerCase().includes(term) : false;
    }
  }, [filter, graphData]);

  // Configure d3-force simulation for better spacing
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-200);
    fg.d3Force("link")?.distance(100);
    fg.d3Force("collide", forceCollide(20));
  }, []);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
          setTooltip({ text: node.description, x: node.x ?? 0, y: node.y ?? 0 });
        }
      } else {
        updateHighlight(null, focusedNode);
        setTooltip(null);
      }
    },
    [focusedNode, updateHighlight],
  );

  // Once the simulation settles, set a comfortable zoom and snapshot it
  const handleEngineStop = useCallback(() => {
    const fg = fgRef.current;
    if (!fg || restingView.current) return;
    fg.zoomToFit(400, 60);
    // Snapshot after the animated zoomToFit completes
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
      fg?.zoomToFit(400, 60);
    }
  }, []);

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
      const somethingHighlighted = highlightNodes.size > 0;
      const isFiltered = node.__filtered;
      let alpha = 1;
      if (isFiltered) alpha = 0.08;
      else if (somethingHighlighted && !isHighlighted) alpha = 0.15;

      const radius = isHighlighted ? 7 : 5;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Glow ring for highlighted nodes
      if (isHighlighted && !isFiltered) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = alpha * 0.25;
        ctx.fill();
        ctx.globalAlpha = alpha;
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Label
      const fontSize = isHighlighted ? 13 / globalScale : 11 / globalScale;
      ctx.font = `${isHighlighted ? "bold " : ""}${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2.5 / globalScale;
      ctx.strokeText(node.label, x, y + radius + 2);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(node.label, x, y + radius + 2);

      ctx.restore();
    },
    [highlightNodes],
  );
  return (
    <div ref={containerRef} className="relative w-full rounded-lg bg-card/30 border border-border" style={{ height }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={containerWidth}
        height={height}
        nodeCanvasObject={nodeCanvasObject}
        nodeCanvasObjectMode={() => "replace"}
        linkWidth={(link: GraphLink) => (highlightLinks.has(link) ? 2.5 : 1)}
        linkColor={(link: GraphLink) => (highlightLinks.has(link) ? "#818cf8" : "#475569")}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onEngineStop={handleEngineStop}
        autoPauseRedraw={false}
        backgroundColor="transparent"
        cooldownTicks={200}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
          style={{
            left: "50%",
            top: 8,
            transform: "translateX(-50%)",
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
