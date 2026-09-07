// Constitution I: evidence before conclusions. Code, not the model, checks that
// every cited event exists and involves the two assets its edge connects.
// Nothing here normalises an asset name: names are compared exactly.
import type {
  Chain,
  ChainEdge,
  CitationCheck,
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
  for (const edge of chain.edges) {
    const unknown = [edge.source, edge.target].filter((name) => !known.has(name));
    if (unknown.length > 0) {
      warnings.push(
        `Dropped edge ${edge.source} -> ${edge.target}: ${unknown.join(" and ")} appears in no event.`,
      );
      continue;
    }
    const checks = edge.citations.map((id) => checkCitation(edge, id, byId));
    edges.push({
      ...edge,
      citations: [...edge.citations],
      checks,
      verified:
        checks.length > 0 && checks.every((c) => c.exists && c.involvesBothEndpoints),
      bannedWords: bannedWordsIn(edge),
    });
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
