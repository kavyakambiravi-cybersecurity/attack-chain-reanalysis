// Constitution II: isolating an asset and cutting a step are the same
// operation. Both produce a set of event ids to remove, and that set is the
// only thing that ever reaches the server.
import { edgeKey } from "./validate";
import type { ChainEdge, Event, Intervention } from "../types";

/** Every event this asset took part in, in the order the events happened. */
export function eventsForNode(asset: string, events: Event[]): string[] {
  return events
    .filter((event) => event.source === asset || event.target === asset)
    .map((event) => event.id);
}

/**
 * The events a step is built on. An id the model made up is returned as it is:
 * the server will reject it and the UI has to show that, rather than hiding
 * the model's mistake by filtering it out here.
 */
export function eventsForEdge(edge: ChainEdge): string[] {
  return [...edge.citations];
}

/** Set union, first-seen order, neither input touched. */
export function unionRemoved(previous: string[], next: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...previous, ...next]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function interventionForNode(asset: string, events: Event[]): Intervention {
  return { kind: "isolate", subject: asset, removed_event_ids: eventsForNode(asset, events) };
}

export function interventionForEdge(edge: ChainEdge): Intervention {
  return { kind: "block", subject: edgeKey(edge), removed_event_ids: eventsForEdge(edge) };
}
