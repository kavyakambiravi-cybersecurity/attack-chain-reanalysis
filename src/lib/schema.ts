// zod schemas for everything that crosses a boundary: the static scenario files
// and the two API endpoints. Objects strip unknown keys rather than rejecting
// them, so the server may add fields without breaking the client, and no score
// field can leak in (constitution IV).
import { z } from "zod";

export const EventTypeSchema = z.enum([
  "process_start",
  "network_connection",
  "authentication",
  "file_access",
]);

export const EventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: EventTypeSchema,
  detail: z.string(),
});

export const EventsSchema = z.array(EventSchema);

export const LookalikeSchema = z.object({
  id: z.string().min(1),
  why_benign: z.string().min(1),
});

export const AnswerKeySchema = z.object({
  scenario_id: z.string().min(1),
  scenario_name: z.string().min(1),
  scenario_type: z.enum(["attack", "benign"]),
  correct_answer: z.string(),
  total_events: z.number(),
  attack_event_ids: z.array(z.string()),
  assets_involved: z.array(z.string()).optional(),
  chain_summary: z.array(z.string()).optional(),
  lookalike_event_ids: z.array(z.string()).optional(),
  lookalikes: z.array(LookalikeSchema).optional(),
  note: z.string(),
});

export const ChainNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
});

export const ChainEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  action: z.string(),
  description: z.string(),
  citations: z.array(z.string()),
});

export const ChainOutputSchema = z.object({
  nodes: z.array(ChainNodeSchema),
  edges: z.array(ChainEdgeSchema),
  notable: z.array(ChainEdgeSchema).default([]),
  summary: z.string(),
});

/** AnalyzeResponse. Alias Chain on the client. */
export const ChainSchema = ChainOutputSchema.extend({
  scenario_id: z.string().min(1),
  removed_event_ids: z.array(z.string()),
  prompt_version: z.string().min(1),
});

export const AnalyzeRequestSchema = z.object({
  scenario_id: z.string().min(1),
  removed_event_ids: z.array(z.string()),
});

export const ErrorCodeSchema = z.enum([
  "unknown_scenario",
  "unknown_event_ids",
  "too_many_removed",
  "bad_request",
  "rate_limited",
  "not_configured",
  "model_refused",
  "model_error",
  "internal",
]);

export const ErrorResponseSchema = z.object({
  error: ErrorCodeSchema,
  detail: z.string(),
  ids: z.array(z.string()).optional(),
});

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  live: z.boolean(),
  model: z.string(),
});
