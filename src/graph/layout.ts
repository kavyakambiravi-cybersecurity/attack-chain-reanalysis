// Dagre layout, left to right, so the chain reads like a story: first step on
// the left, last on the right. Constitution V.
import dagre from "dagre";
import { MarkerType, type Edge as RFEdge, type Node as RFNode } from "reactflow";
import { edgeKey } from "../lib/validate";
import { assetKind } from "../types";
import type {
  AssetKind,
  ChainNode,
  DiffStatus,
  Event,
  ValidatedEdge,
} from "../types";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 64;

export type LaidOutNode = ChainNode & { status?: DiffStatus };
export type LaidOutEdge = ValidatedEdge & { status?: DiffStatus };

export interface LayoutInput {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

export interface ChainNodeData {
  asset: string;
  label: string;
  kind: AssetKind;
  status: DiffStatus;
}

export interface ChainEdgeData {
  edge: LaidOutEdge;
  status: DiffStatus;
}

/**
 * The earliest timestamp of any event cited by an edge that touches this asset.
 * Used only to give the layout a stable, story-ordered starting point.
 */
function firstSeen(asset: string, input: LayoutInput, byId: Map<string, Event>): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const edge of input.edges) {
    if (edge.source !== asset && edge.target !== asset) continue;
    for (const id of edge.citations) {
      const event = byId.get(id);
      if (!event) continue;
      earliest = Math.min(earliest, Date.parse(event.timestamp));
    }
  }
  return earliest;
}

/** Arrowhead colour follows the same four states as the edge line itself. */
function arrowColour(status: DiffStatus, verified: boolean): string {
  if (status === "vanished") return "#e5534b";
  if (status === "appeared") return "#3fb950";
  return verified ? "#cdd9e5" : "#98a2b3";
}

/** Every asset the chain draws, including any that only an edge mentions. */
function allNodes(input: LayoutInput): LaidOutNode[] {
  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  for (const edge of input.edges) {
    for (const asset of [edge.source, edge.target]) {
      if (!byId.has(asset)) byId.set(asset, { id: asset, label: "" });
    }
  }
  return [...byId.values()];
}

/**
 * Turn a validated or diffed chain into React Flow nodes and edges. Node order
 * is deterministic: earliest cited event first, then by name.
 */
export function layoutChain(input: LayoutInput, events: Event[]): {
  nodes: RFNode<ChainNodeData>[];
  edges: RFEdge<ChainEdgeData>[];
} {
  const byId = new Map(events.map((event) => [event.id, event]));
  const ordered = allNodes(input).sort((a, b) => {
    const delta = firstSeen(a.id, input, byId) - firstSeen(b.id, input, byId);
    if (Number.isNaN(delta) || delta === 0) return a.id.localeCompare(b.id);
    return delta === Number.POSITIVE_INFINITY || delta === Number.NEGATIVE_INFINITY
      ? a.id.localeCompare(b.id)
      : delta;
  });

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 120 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of ordered) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of input.edges) {
    graph.setEdge(edge.source, edge.target, {}, edgeKey(edge));
  }
  dagre.layout(graph);

  const nodes: RFNode<ChainNodeData>[] = ordered.map((node) => {
    const placed = graph.node(node.id);
    return {
      id: node.id,
      type: "chainNode",
      position: {
        x: (placed?.x ?? 0) - NODE_WIDTH / 2,
        y: (placed?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        asset: node.id,
        label: node.label,
        kind: assetKind(node.id),
        status: node.status ?? "survived",
      },
    };
  });

  const edges: RFEdge<ChainEdgeData>[] = input.edges.map((edge) => {
    const status = edge.status ?? "survived";
    return {
      id: edgeKey(edge),
      source: edge.source,
      target: edge.target,
      type: "chainEdge",
      label: edge.action,
      markerEnd: { type: MarkerType.ArrowClosed, color: arrowColour(status, edge.verified) },
      data: { edge, status },
    };
  });

  return { nodes, edges };
}
