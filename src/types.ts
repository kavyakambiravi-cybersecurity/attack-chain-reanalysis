// Types for the frozen wire contract and the client-only derived shapes.
// Field names are snake_case on the wire and in TypeScript. Nothing is renamed
// at the boundary. See specs/001-attack-chain-reanalysis/plan.md.

// ---------------------------------------------------------------- scenario data

export type EventType =
  | "process_start"
  | "network_connection"
  | "authentication"
  | "file_access";

export interface Event {
  id: string; // "E-0001" .. "E-0500", assigned in timestamp order, unique
  timestamp: string; // ISO 8601 UTC, events sorted ascending
  source: string; // asset name: a user, a host, or an external address
  target: string; // asset name
  type: EventType;
  detail: string;
}

export interface Lookalike {
  id: string;
  why_benign: string;
}

export interface AnswerKey {
  scenario_id: string;
  scenario_name: string;
  scenario_type: "attack" | "benign";
  correct_answer: string;
  total_events: number;
  attack_event_ids: string[];
  assets_involved?: string[];
  chain_summary?: string[];
  lookalike_event_ids?: string[];
  lookalikes?: Lookalike[];
  note: string;
}

// ---------------------------------------------------------------- wire shapes

export interface ChainNode {
  id: string; // the asset name, verbatim
  label: string;
}

export interface ChainEdge {
  source: string;
  target: string;
  action: string; // 3 to 6 words
  description: string; // one plain-English sentence
  citations: string[]; // event ids
}

export interface ChainOutput {
  nodes: ChainNode[];
  /** The attack chain. Empty when the events show no connected attack. */
  edges: ChainEdge[];
  /**
   * Steps the model looked at and set aside: they resemble attacker actions
   * on their own but join no chain. Same shape, same citation checks.
   */
  notable: ChainEdge[];
  summary: string;
}

export interface AnalyzeResponse extends ChainOutput {
  scenario_id: string;
  removed_event_ids: string[];
  prompt_version: string;
}

/** The only chain shape that crosses the wire or is written to analysis.json. */
export type Chain = AnalyzeResponse;

export interface AnalyzeRequest {
  scenario_id: string;
  removed_event_ids: string[];
}

export type ErrorCode =
  | "unknown_scenario"
  | "unknown_event_ids"
  | "too_many_removed"
  | "bad_request"
  | "rate_limited"
  | "not_configured"
  | "model_refused"
  | "model_error"
  | "internal";

export interface ErrorResponse {
  error: ErrorCode;
  detail: string; // one plain-English sentence for the banner
  ids?: string[]; // only for unknown_event_ids
}

export interface HealthResponse {
  ok: true;
  live: boolean; // false when the server has no model key
  model: string;
}

// ------------------------------------------------------- validated and diffed

export interface CitationCheck {
  id: string;
  exists: boolean;
  involvesBothEndpoints: boolean;
}

/** Where a drawn step came from: the attack chain, or the model's set-aside list. */
export type EdgeRole = "chain" | "notable";

/**
 * What a step does, as far as code can tell from the cited events. "data_out"
 * means a transfer of megabytes or more to an outside address, in either role.
 */
export type EdgeKind = "action" | "data_out";

export interface ValidatedEdge extends ChainEdge {
  role: EdgeRole;
  kind: EdgeKind;
  verified: boolean; // citations.length > 0 && every check passes
  checks: CitationCheck[];
  bannedWords: string[];
}

export interface ValidatedChain {
  scenario_id: string;
  removed_event_ids: string[];
  prompt_version: string;
  nodes: ChainNode[];
  edges: ValidatedEdge[];
  summary: string;
  warnings: string[];
}

export type DiffStatus = "survived" | "vanished" | "appeared";

export interface DiffedEdge extends ValidatedEdge {
  status: DiffStatus;
}

export interface DiffedNode extends ChainNode {
  status: DiffStatus;
}

export interface DiffedChain {
  nodes: DiffedNode[];
  edges: DiffedEdge[];
  summary: string;
  counts: { vanished: number; survived: number; appeared: number };
}

// ------------------------------------------------------------- interventions

export type InterventionKind = "isolate" | "block";

/** One user action, expressed the only way the system allows: removed event ids. */
export interface Intervention {
  kind: InterventionKind;
  /** What the user acted on: an asset name, or "source->target" for an edge. */
  subject: string;
  removed_event_ids: string[];
}

// ------------------------------------------------------------------ asset kind

export type AssetKind = "host" | "user" | "external";

const EXTERNAL = /^\d/;
const HOST = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * Asset kind is derived from the name by regex. The model never classifies names.
 *   external: starts with a digit          203.0.113.47, 151.101.1.140 (fastly-cdn)
 *   host:     uppercase with a hyphenated number   WKSTN-042, FILESRV-01, DC-01
 *   user:     anything else                jsmith, administrator, svc_backup
 */
export function assetKind(name: string): AssetKind {
  if (EXTERNAL.test(name)) return "external";
  if (HOST.test(name)) return "host";
  return "user";
}
