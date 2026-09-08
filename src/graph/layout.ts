// Dagre layout, left to right, so the chain reads like a story: first step on
// the left, last on the right. Constitution V.
//
// Every edge label is given to dagre as a box of its own, so dagre reserves
// room for it between the two ranks it joins and stacks parallel labels
// instead of piling them onto one point. Edges are then drawn along the route
// dagre returns, which starts and ends on the node borders and bends around
// whatever sits in between, and the label is placed where dagre put it.
import dagre from "dagre";
import { MarkerType, type Edge as RFEdge, type Node as RFNode } from "reactflow";
import { edgeKey, uniqueEdgeIds } from "../lib/validate";
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

/** Labels wrap inside this width. It is what dagre reserves between ranks. */
export const LABEL_WIDTH = 150;
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 12;
const LABEL_LINE_HEIGHT = 16;
/** Average glyph width at the label's 12px font, used only to guess line count. */
const CHAR_WIDTH = 6.4;
/** Width of an inline tag such as "unverified" or "gone". */
const TAG_WIDTH = 70;

const NODE_SEP = 36;
const RANK_SEP = 48;
const EDGE_SEP = 20;

export type LaidOutNode = ChainNode & { status?: DiffStatus };
export type LaidOutEdge = ValidatedEdge & { status?: DiffStatus };

export interface LayoutInput {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
}

export interface Point {
  x: number;
  y: number;
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** edgeKey(edge): the identity diffs and interventions use. Not unique. */
  key: string;
  /** The route from the source's border to the target's, in flow coordinates. */
  points: Point[];
  /** Centre and size of the space reserved for the label. */
  label: LabelBox;
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
 * How big the label pill will be once its text wraps at LABEL_WIDTH. An
 * estimate from character count, since nothing is measured before layout;
 * NODE_SEP gives it slack.
 */
export function labelSize(edge: LaidOutEdge): { width: number; height: number } {
  const status = edge.status ?? "survived";
  const tagged = !edge.verified || status !== "survived";
  const textWidth = edge.action.length * CHAR_WIDTH + (tagged ? TAG_WIDTH : 0);
  const inner = LABEL_WIDTH - 2 * LABEL_PADDING_X;
  const lines = Math.max(1, Math.ceil(textWidth / inner));
  return { width: LABEL_WIDTH, height: LABEL_PADDING_Y + lines * LABEL_LINE_HEIGHT };
}

const fixed = (value: number) => Number(value.toFixed(1));

/**
 * An SVG path through every point in order. Catmull-Rom converted to cubic
 * Beziers, so the curve passes through each of dagre's route points, the
 * label centre included, and stays smooth at each of them.
 */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  const [first] = points;
  let d = `M${fixed(first.x)},${fixed(first.y)}`;
  if (points.length === 1) return d;
  if (points.length === 2) {
    const [, last] = points;
    return `${d} L${fixed(last.x)},${fixed(last.y)}`;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${fixed(c1x)},${fixed(c1y)} ${fixed(c2x)},${fixed(c2y)} ${fixed(p2.x)},${fixed(p2.y)}`;
  }
  return d;
}

/**
 * Turn a validated or diffed chain into React Flow nodes and edges. Node order
 * is deterministic: earliest cited event first, then by name. Edge ids come
 * from uniqueEdgeIds, so a second step between the same assets is drawn too.
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
  const ids = uniqueEdgeIds(input.edges);

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: "LR", nodesep: NODE_SEP, ranksep: RANK_SEP, edgesep: EDGE_SEP });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of ordered) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  input.edges.forEach((edge, index) => {
    graph.setEdge(edge.source, edge.target, { ...labelSize(edge), labelpos: "c" }, ids[index]);
  });
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

  const edges: RFEdge<ChainEdgeData>[] = input.edges.map((edge, index) => {
    const id = ids[index];
    const status = edge.status ?? "survived";
    const placed = graph.edge(edge.source, edge.target, id) as
      | (dagre.GraphEdge & { x?: number; y?: number })
      | undefined;
    const points = (placed?.points ?? []).map((point) => ({ x: point.x, y: point.y }));
    return {
      id,
      source: edge.source,
      target: edge.target,
      type: "chainEdge",
      label: edge.action,
      markerEnd: { type: MarkerType.ArrowClosed, color: arrowColour(status, edge.verified) },
      data: {
        edge,
        status,
        key: edgeKey(edge),
        points,
        label: { x: placed?.x ?? 0, y: placed?.y ?? 0, ...labelSize(edge) },
      },
    };
  });

  return { nodes, edges };
}
