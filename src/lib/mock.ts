// Dev-only fake of the two endpoints, so the frontend is buildable and testable
// with no Python, no key, and no analysis.json. It is reached only through
// api.ts under VITE_MOCK_API=1 and is dead code in a normal build; a test
// asserts dist/ contains no trace of it.
import cachedAnalysis from "../mock/analysis.attack-chain-01.json";
import { ApiError, getJson } from "./http";
import { AnswerKeySchema, ChainSchema, EventsSchema } from "./schema";
import type { Chain, ErrorCode, HealthResponse } from "../types";
import type { LoadedScenario } from "./api";

/**
 * A phrase that exists only in the mock chain. The bundle test greps dist/ for
 * it, so if the mock ever ships, the suite says so.
 */
export const MOCK_MARKER = "gathered and hid files";

/** The delay a real analyse call would cost, so the spinner is real work to build against. */
export const MOCK_DELAY_MS = 1500;

const DETAIL_FOR_ERROR: Record<ErrorCode, string> = {
  bad_request: "Request body must have scenario_id and removed_event_ids.",
  unknown_scenario: "No scenario by that name.",
  unknown_event_ids: "Some event ids are not in this scenario.",
  too_many_removed: "At most 200 events can be removed.",
  rate_limited: "Too many analyses in the last minute. Try again shortly.",
  not_configured: "Live re-analysis is off: the server has no model key.",
  model_refused: "The model declined to analyse these events.",
  model_error: "The model call failed or timed out.",
  internal: "Something went wrong on the server.",
};

const ERROR_CODES = Object.keys(DETAIL_FOR_ERROR) as ErrorCode[];

let armedError: ErrorCode | null = null;

/** Arm the next analyze() to fail. Used by ?mockError=<code> and by the tests. */
export function setMockError(code: ErrorCode | null): void {
  armedError = code;
}

/** Read ?mockError=<code> off a page URL. Unknown codes are ignored. */
export function armMockErrorFromUrl(search: string): void {
  const code = new URLSearchParams(search).get("mockError");
  if (code && (ERROR_CODES as string[]).includes(code)) setMockError(code as ErrorCode);
}

if (typeof window !== "undefined") armMockErrorFromUrl(window.location.search);

/** The one scenario the mock has a hand-written chain for. */
export const MOCK_ATTACK_SCENARIO_ID = "attack-chain-01";

/** What the mock says for a scenario it has no chain for, benign or otherwise. */
export const MOCK_NO_CHAIN_SUMMARY = "The remaining events do not show a connected attack.";

const AZURE = "20.150.44.10 (blob.core.windows.net Azure)";

/**
 * The chain the mock serves as the cached first analysis: the hand-written
 * attack chain for attack-chain-01, and for anything else no chain at all but
 * one noted step, the nightly backup upload, which is the shape the real model
 * returns for the benign scenario.
 */
export function mockCachedChain(scenarioId: string): Chain {
  const chain = ChainSchema.parse(cachedAnalysis);
  if (scenarioId !== MOCK_ATTACK_SCENARIO_ID) {
    return {
      ...chain,
      nodes: [
        { id: "BACKUP-01", label: "backup server" },
        { id: AZURE, label: "company cloud storage" },
      ],
      edges: [],
      notable: [
        {
          source: "BACKUP-01",
          target: AZURE,
          action: "uploaded a large backup",
          description:
            "A scheduled 512GB backup went to the company's own cloud storage, with nothing before or after it that links to an intrusion.",
          citations: ["E-0192"],
        },
      ],
      summary: MOCK_NO_CHAIN_SUMMARY,
      scenario_id: scenarioId,
    };
  }
  return { ...chain, scenario_id: scenarioId };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockHealth(): Promise<HealthResponse> {
  return { ok: true, live: true, model: "claude-sonnet-5" };
}

/** Real static files for the events and the answer key; the mock chain for the analysis. */
export async function mockLoadScenario(scenarioId: string): Promise<LoadedScenario> {
  const base = `/scenarios/${scenarioId}`;
  const [events, answer_key] = await Promise.all([
    getJson(`${base}/events.json`, EventsSchema),
    getJson(`${base}/answer_key.json`, AnswerKeySchema),
  ]);
  return { scenario_id: scenarioId, events, answer_key, cached: mockCachedChain(scenarioId) };
}

/**
 * Stand-in for the model: drop every edge whose citations were all removed, then
 * every node left with no edges. Crude, but it moves the graph the way a real
 * re-analysis does, which is all the UI needs to be built against.
 */
export async function mockAnalyze(
  scenarioId: string,
  removedEventIds: string[],
  options: { delayMs?: number } = {},
): Promise<Chain> {
  await sleep(options.delayMs ?? MOCK_DELAY_MS);

  if (armedError) {
    const code = armedError;
    armedError = null;
    throw new ApiError(code, DETAIL_FOR_ERROR[code], {
      ids: code === "unknown_event_ids" ? removedEventIds.slice(0, 2) : undefined,
    });
  }

  const removed = new Set(removedEventIds);
  const base = mockCachedChain(scenarioId);
  const keep = (edge: Chain["edges"][number]) =>
    edge.citations.some((id) => !removed.has(id));
  const edges = base.edges.filter(keep);
  const notable = base.notable.filter(keep);
  const connected = new Set([...edges, ...notable].flatMap((edge) => [edge.source, edge.target]));
  const nodes = base.nodes.filter((node) => connected.has(node.id));

  return {
    ...base,
    nodes,
    edges,
    notable,
    removed_event_ids: [...removedEventIds],
    summary: edges.length === 0 ? MOCK_NO_CHAIN_SUMMARY : base.summary,
  };
}
