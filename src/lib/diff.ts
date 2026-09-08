// What changed after a re-analysis. The model never sees the previous chain;
// this is computed here, from two chains, so the comparison is the user's, not
// the model's.
import { edgeKey } from "./validate";
import type { DiffedChain, DiffedEdge, DiffedNode, ValidatedChain } from "../types";

/**
 * Identity for diffing: endpoints, plus the role. A step that moves from the
 * chain to the set-aside list, or back, has changed in the way that matters
 * most, so it is shown as one step vanished and another appeared.
 */
function diffKey(edge: { source: string; target: string; role: string }): string {
  return edge.role === "notable" ? `notable:${edgeKey(edge)}` : edgeKey(edge);
}

/**
 * Overlay the previous chain on the current one. Identity is endpoints and role
 * for an edge and the asset name for a node, never the wording, so a re-phrased
 * step counts as the same step. Anything that is gone stays in the output,
 * carrying the evidence it had, so the user can see what their change took away.
 */
export function diffChains(previous: ValidatedChain | null, next: ValidatedChain): DiffedChain {
  // The very first render has nothing to compare against, so nothing is new:
  // everything is simply what the evidence shows.
  const first = previous === null;
  const previousEdges = new Map((previous?.edges ?? []).map((edge) => [diffKey(edge), edge]));
  const previousNodes = new Map((previous?.nodes ?? []).map((node) => [node.id, node]));

  const edges: DiffedEdge[] = next.edges.map((edge) => ({
    ...edge,
    citations: [...edge.citations],
    checks: edge.checks.map((check) => ({ ...check })),
    bannedWords: [...edge.bannedWords],
    status: first || previousEdges.has(diffKey(edge)) ? "survived" : "appeared",
  }));

  const nextEdgeKeys = new Set(next.edges.map(diffKey));
  for (const [key, edge] of previousEdges) {
    if (nextEdgeKeys.has(key)) continue;
    edges.push({
      ...edge,
      citations: [...edge.citations],
      checks: edge.checks.map((check) => ({ ...check })),
      bannedWords: [...edge.bannedWords],
      status: "vanished",
    });
  }

  const nodes: DiffedNode[] = next.nodes.map((node) => ({
    ...node,
    status: first || previousNodes.has(node.id) ? "survived" : "appeared",
  }));

  const nextNodeIds = new Set(next.nodes.map((node) => node.id));
  for (const [id, node] of previousNodes) {
    if (nextNodeIds.has(id)) continue;
    nodes.push({ ...node, status: "vanished" });
  }

  return {
    nodes,
    edges,
    summary: next.summary,
    counts: {
      vanished: edges.filter((edge) => edge.status === "vanished").length,
      survived: edges.filter((edge) => edge.status === "survived").length,
      appeared: edges.filter((edge) => edge.status === "appeared").length,
    },
  };
}

/**
 * The one line shown after a re-analysis. Counts, never adjectives: the tool
 * says what changed, not whether anything is better. Constitution IV.
 */
export function describeChange(removedCount: number, diffed: DiffedChain): string {
  const { vanished, survived, appeared } = diffed.counts;
  const events = `Removed ${removedCount} ${removedCount === 1 ? "event" : "events"}.`;
  return `${events} ${vanished} vanished, ${survived} survived, ${appeared} appeared.`;
}
