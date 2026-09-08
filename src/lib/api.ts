// The only place the client talks to the outside world. With VITE_MOCK_API=1
// every call is delegated to the dev mock, which is dead code in a normal build.
import { ChainSchema, EventsSchema, AnswerKeySchema, HealthResponseSchema } from "./schema";
import { ApiError, errorFrom, getJson, getOptionalJson } from "./http";
import type { AnswerKey, Chain, Event, HealthResponse } from "../types";

export { ApiError } from "./http";

const USE_MOCK = import.meta.env.VITE_MOCK_API === "1";

export interface LoadedScenario {
  scenario_id: string;
  events: Event[];
  answer_key: AnswerKey;
  /** Null when analysis.json has not been generated yet. Not fatal. */
  cached: Chain | null;
}

/**
 * Fetch a scenario's static files. Events and the answer key are fatal if
 * missing; the cached analysis is not.
 */
export async function loadScenario(scenarioId: string): Promise<LoadedScenario> {
  if (USE_MOCK) {
    const mock = await import("./mock");
    return mock.mockLoadScenario(scenarioId);
  }
  const base = `/scenarios/${scenarioId}`;
  const [events, answer_key] = await Promise.all([
    getJson(`${base}/events.json`, EventsSchema),
    getJson(`${base}/answer_key.json`, AnswerKeySchema),
  ]);
  const cached = await getOptionalJson(`${base}/analysis.json`, ChainSchema);
  return { scenario_id: scenarioId, events, answer_key, cached };
}

/**
 * Re-analyse the scenario with these events removed. Constitution II: this is
 * the only intervention mechanism, and constitution III: it is a live call.
 */
export async function analyze(
  scenarioId: string,
  removedEventIds: string[],
): Promise<Chain> {
  if (USE_MOCK) {
    const mock = await import("./mock");
    return mock.mockAnalyze(scenarioId, removedEventIds);
  }
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario_id: scenarioId,
      removed_event_ids: removedEventIds,
    }),
  });
  if (!response.ok) throw await errorFrom(response);
  const parsed = ChainSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError("internal", "The server returned a chain this app cannot read.");
  }
  return parsed.data;
}

/** Asked once on page load. Never calls the model. */
export async function health(): Promise<HealthResponse> {
  if (USE_MOCK) {
    const mock = await import("./mock");
    return mock.mockHealth();
  }
  return getJson("/api/health", HealthResponseSchema);
}
