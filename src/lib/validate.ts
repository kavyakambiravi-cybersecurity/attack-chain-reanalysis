// Constitution I: evidence before conclusions. Code, not the model, checks that
// every cited event exists and involves the two assets its edge connects.
// Nothing here normalises an asset name: names are compared exactly.
import { assetKind } from "../types";
import type {
  Chain,
  ChainEdge,
  CitationCheck,
  EdgeKind,
  EdgeRole,
  Event,
  ValidatedChain,
  ValidatedEdge,
} from "../types";

/** Never rendered, never accepted from the model. Constitution IV. */
export const BANNED_WORDS = ["secure", "safe", "contained"] as const;

const BANNED_RE = new RegExp(`\\b(${BANNED_WORDS.join("|")})\\b`, "gi");

/**
 * Every asset name the events know about, plus the unlabelled form of any
 * labelled name ("151.101.1.140" for "151.101.1.140 (fastly-cdn)").
 *
 * A node or edge is only dropped when its name matches nothing here at all. A
 * near miss, such as the model dropping a parenthesised label, is kept and
 * surfaced as an unverified edge with a reason, which is the more useful
 * signal than making it disappear.
 */
export function knownAssets(events: Event[]): Set<string> {
  const known = new Set<string>();
  for (const event of events) {
    for (const name of [event.source, event.target]) {
      known.add(name);
      const base = name.split(" (")[0];
      if (base !== name) known.add(base);
    }
  }
  return known;
}

function checkCitation(edge: ChainEdge, id: string, byId: Map<string, Event>): CitationCheck {
  const event = byId.get(id);
  if (!event) return { id, exists: false, involvesBothEndpoints: false };
  const involvesBothEndpoints =
    (event.source === edge.source && event.target === edge.target) ||
    (event.source === edge.target && event.target === edge.source);
  return { id, exists: true, involvesBothEndpoints };
}

/** A transfer size big enough to call data movement: megabytes or more. */
export const DATA_SIZE_RE = /\b\d+(?:\.\d+)?\s?(?:MB|GB|TB)\b/i;

/**
 * The cited event, if any, that shows data leaving the network: a connection to
 * an outside address whose detail records a transfer of megabytes or more.
 * Code decides this from the events, never the model, so a red step is a fact
 * about the evidence and not a judgement about intent.
 */
export function dataOutEvent(edge: ChainEdge, byId: Map<string, Event>): Event | null {
  if (assetKind(edge.target) !== "external") return null;
  for (const id of edge.citations) {
    const event = byId.get(id);
    if (!event || event.type !== "network_connection") continue;
    if (event.target !== edge.target) continue;
    if (DATA_SIZE_RE.test(event.detail)) return event;
  }
  return null;
}

export function edgeKind(edge: ChainEdge, byId: Map<string, Event>): EdgeKind {
  return dataOutEvent(edge, byId) ? "data_out" : "action";
}

function bannedWordsIn(edge: ChainEdge): string[] {
  const found = `${edge.action} ${edge.description}`.match(BANNED_RE) ?? [];
  const lowered = new Set(found.map((word) => word.toLowerCase()));
  return BANNED_WORDS.filter((word) => lowered.has(word));
}

/**
 * Validate a chain against the events it was drawn from. Pure: the input is
 * never mutated and the same input always gives a deep-equal result.
 */
export function validateChain(chain: Chain, events: Event[]): ValidatedChain {
  const byId = new Map(events.map((event) => [event.id, event]));
  const known = knownAssets(events);
  const warnings: string[] = [];

  const nodes = chain.nodes
    .filter((node) => {
      if (known.has(node.id)) return true;
      warnings.push(`Dropped node ${node.id}: that name appears in no event.`);
      return false;
    })
    .map((node) => ({ ...node }));

  const edges: ValidatedEdge[] = [];
  const lists: [EdgeRole, ChainEdge[]][] = [
    ["chain", chain.edges],
    ["notable", chain.notable ?? []],
  ];
  for (const [role, list] of lists) {
    for (const edge of list) {
      const unknown = [edge.source, edge.target].filter((name) => !known.has(name));
      if (unknown.length > 0) {
        const what = role === "chain" ? "edge" : "notable step";
        warnings.push(
          `Dropped ${what} ${edge.source} -> ${edge.target}: ${unknown.join(" and ")} appears in no event.`,
        );
        continue;
      }
      const checks = edge.citations.map((id) => checkCitation(edge, id, byId));
      edges.push({
        ...edge,
        citations: [...edge.citations],
        role,
        kind: edgeKind(edge, byId),
        checks,
        verified:
          checks.length > 0 && checks.every((c) => c.exists && c.involvesBothEndpoints),
        bannedWords: bannedWordsIn(edge),
      });
    }
  }

  return {
    scenario_id: chain.scenario_id,
    removed_event_ids: [...chain.removed_event_ids],
    prompt_version: chain.prompt_version,
    nodes,
    edges,
    summary: chain.summary,
    warnings,
  };
}

/**
 * One plain-English line saying why a citation failed, for the evidence panel.
 * Returns null when the check passed.
 */
export function explainCheck(
  edge: ChainEdge,
  check: CitationCheck,
  events: Event[],
): string | null {
  if (check.exists && check.involvesBothEndpoints) return null;
  const event = events.find((e) => e.id === check.id);
  if (!event) return `Event ${check.id} is not in this scenario.`;

  const eventNames = [event.source, event.target];
  const missing = [edge.source, edge.target].filter((name) => !eventNames.includes(name));
  const offending = eventNames.filter((name) => name !== edge.source && name !== edge.target);
  return `Event ${check.id} names ${offending.join(" and ")}, not ${missing.join(" and ")}.`;
}

/** Edge identity used everywhere: endpoints only, never the wording. */
export function edgeKey(edge: { source: string; target: string }): string {
  return `${edge.source}->${edge.target}`;
}

/**
 * One line for the evidence panel saying which cited event shows data leaving
 * and how much. Null when the step is not a data movement.
 */
export function describeDataOut(edge: ChainEdge, events: Event[]): string | null {
  const event = dataOutEvent(edge, new Map(events.map((e) => [e.id, e])));
  if (!event) return null;
  const size = event.detail.match(DATA_SIZE_RE)?.[0] ?? "a large amount of data";
  return `Event ${event.id} records ${size} sent to ${event.target}.`;
}

/**
 * One id per edge for rendering and selection. Two steps between the same two
 * assets share an edgeKey, which is right for diffing and interventions, but a
 * drawn edge needs its own id: the second such step gets "#2", the third "#3".
 */
export function uniqueEdgeIds(edges: { source: string; target: string }[]): string[] {
  const seen = new Map<string, number>();
  return edges.map((edge) => {
    const key = edgeKey(edge);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}#${count}`;
  });
}
