# Test Plan: Attack Chain Counterfactual Re-analysis

**Frameworks**: Vitest for TypeScript, pytest for the Python API.
**Principle**: every deterministic rule in the constitution has a test. The model is never
called in tests. Fixtures are small hand-written event sets, not the bundled scenario, except
for the scenario schema tests which run against the real built files.

---

## Fixtures

`tests/fixtures/mini.ts` exports a six-event, three-asset scenario used by most tests:

| id | source | target | type | user | detail |
|---|---|---|---|---|---|
| e1 | ws-a | ws-a | process_start | j.doe | WINWORD spawns powershell |
| e2 | ws-a | ext-1.1.1.1 | network_connection | j.doe | outbound 443 |
| e3 | ws-a | fs-b | authentication | svc | logon from ws-a |
| e4 | fs-b | fs-b | file_access | svc | bulk read /finance |
| e5 | fs-b | ext-2.2.2.2 | network_connection | svc | outbound 443 large |
| e6 | ws-c | dc-d | authentication | k.lee | interactive logon |

`tests/fixtures/chains.ts` exports:
- `goodChain`: edges `ws-a->ext-1.1.1.1 [e2]`, `ws-a->fs-b [e3]`, `fs-b->ext-2.2.2.2 [e5]`.
- `badCitationChain`: same but `ws-a->fs-b` cites `e9` (does not exist).
- `wrongEndpointChain`: same but `ws-a->fs-b` cites `e6` (exists, wrong assets).
- `emptyCitationChain`: same but `ws-a->fs-b` has `citations: []`.
- `selfLoopChain`: adds `ws-a->ws-a [e1]`.

---

## Vitest

### `tests/validate.test.ts` — Constitution I

| Test | Expectation |
|---|---|
| all citations valid | every edge in `goodChain` is `verified: true`, each check has both booleans true |
| unknown event id | the `ws-a->fs-b` edge of `badCitationChain` is `verified: false`; its check for `e9` has `exists: false` |
| event exists but wrong endpoints | `wrongEndpointChain` edge is `verified: false`; check for `e6` has `exists: true`, `involvesBothEndpoints: false` |
| empty citations | `emptyCitationChain` edge is `verified: false` with `checks: []` |
| self-loop event on self-loop edge | in `selfLoopChain`, `ws-a->ws-a [e1]` is `verified: true` |
| self-loop event on non-loop edge | an edge `ws-a->fs-b [e1]` is `verified: false` |
| endpoint order does not matter | an edge `fs-b->ws-a [e3]` is `verified: true` (direction is the model's call, involvement is what is checked) |
| unknown node in edge | an edge whose source appears in no event is dropped and reported in a `warnings` array |
| validation is pure | calling twice with the same input returns deep-equal output and does not mutate the input |

### `tests/intervene.test.ts` — Constitution II

| Test | Expectation |
|---|---|
| isolate a node removes every event touching it | `eventsForNode("fs-b", mini)` returns `["e3", "e4", "e5"]` |
| isolate a node with no events | `eventsForNode("zz", mini)` returns `[]` |
| block an edge removes its citations | `eventsForEdge(goodChain.edges[1])` returns `["e3"]` |
| block an edge with an invalid citation still returns the id | `eventsForEdge` on the `badCitationChain` edge returns `["e9"]`; the server will reject it and the UI must surface that |
| union is set semantics | `unionRemoved(["e1","e2"], ["e2","e3"])` returns `["e1","e2","e3"]` in stable order |
| union does not mutate inputs | both input arrays are unchanged |

### `tests/diff.test.ts` — Story 4

| Test | Expectation |
|---|---|
| identical chains | every edge `survived` |
| edge removed | edge present in prev and absent in next is `vanished`, carried into the output with its previous citations |
| edge added | edge absent in prev and present in next is `appeared` |
| same endpoints, different action text | `survived` (identity is endpoints only) |
| reversed direction | `ws-a->fs-b` in prev and `fs-b->ws-a` in next produce one `vanished` and one `appeared` |
| empty next | every prev edge `vanished`, output length equals prev length |
| counts helper | `summarize(diff)` returns `{vanished, survived, appeared}` totals matching the array |

### `tests/scenario.test.ts` — FR-001, FR-002, FR-003 (runs against built files)

| Test | Expectation |
|---|---|
| event count | `events.json` length is between 450 and 550 |
| ids unique and sequential | ids are `e0001..eNNNN` with no gaps |
| sorted by timestamp | `ts` is non-decreasing |
| schema | every event parses with the zod Event schema; `type` is one of the four |
| asset naming | every source and target matches `/^(ws|fs|db|dc)-/` or `/^ext-/` |
| answer key ids exist | every id in `attack_event_ids` is in `events.json` |
| attack ratio | attack ids are between 3 and 8 percent of events |
| attack spans the window | first and last attack events are at least 30 minutes apart |
| second foothold present | at least one attack event has target `db-hr-02` |
| story present | `story` has between 5 and 8 non-empty steps |

### `tests/schema.test.ts` — API contract on the client

| Test | Expectation |
|---|---|
| valid chain parses | a well-formed chain object passes the zod Chain schema |
| missing citations field fails | an edge without `citations` is rejected |
| extra fields are stripped | an edge with `confidence: 0.9` parses and the output has no `confidence` key (constitution IV: no score can leak in through the schema) |
| error shape parses | `{error: "unknown_event_ids", detail: "e9999"}` parses with the error schema |

### `tests/cached-analysis.test.ts` — the committed first analysis is trustworthy

| Test | Expectation |
|---|---|
| cached chain validates | running `validateChain` on `analysis.json` against `events.json` yields zero unverified edges. If this fails, the cached analysis must be regenerated or the prompt fixed before shipping |
| cached chain cites attack events | at least 60 percent of `attack_event_ids` are cited by some edge |
| cached chain reaches the second foothold | some edge has `db-hr-02` as an endpoint |
| banned words absent | no edge `action`, `description`, or the `summary` contains "secure", "safe", or "contained" (case-insensitive, whole word) |

---

## pytest (`api/tests/`)

The Anthropic client is replaced with a fake via `monkeypatch` on `api.analysis.client`.

### `test_scenario.py`

| Test | Expectation |
|---|---|
| load known scenario | `load("s001")` returns roughly 500 events |
| unknown scenario | `load("nope")` raises `UnknownScenario` |
| subtract removes exactly the ids | `subtract(events, ["e0001","e0002"])` returns length minus two and neither id present |
| unknown ids rejected | `subtract(events, ["e9999"])` raises `UnknownEventIds` with `["e9999"]` in the message |
| duplicates deduped | `subtract(events, ["e0001","e0001"])` removes one event |
| too many rejected | 201 ids raises `TooManyRemoved` |

### `test_analyze.py`

| Test | Expectation |
|---|---|
| happy path | with the client faked to return a parsed `Chain`, `POST /api/analyze` returns 200, echoes deduped `removed_event_ids`, and the body parses as `Chain` |
| refusal | client fake returns `stop_reason == "refusal"`; endpoint returns 502 with `error: model_refused` |
| SDK error | client fake raises `anthropic.APIStatusError`; endpoint returns 502 with `error: model_error` |
| unknown ids | request with `["e9999"]` returns 400 `unknown_event_ids` and the client fake is never called |
| health without key | with `ANTHROPIC_API_KEY` unset, `/api/health` returns `live: false` |
| render_events is stable | `render_events(events)` returns identical text on two calls with the same input (prompt cache hygiene) |

---

## Manual checks before submission

These are not automated. Run them on the deployed URL and tick them in the rationale.

- [ ] Page loads the cached chain in under two seconds with no console errors.
- [ ] Click every edge. Each evidence panel lists at least one event and no cross marks.
- [ ] Isolate `fs-corp-01`. The live call completes. The `db-hr-02` path survives.
- [ ] Isolate `ws-finance-07`. The chain collapses or shrinks materially.
- [ ] Block a single edge. Only that edge's events are removed; the banner count matches.
- [ ] Reset returns to the cached chain.
- [ ] Open the answer key. Attack ids cited by the chain are marked.
- [ ] Disconnect the key in Vercel, redeploy. Buttons disable and the pill says live is off.
      Reconnect.
- [ ] Search the rendered page for "secure", "safe", "contained". None present.

---

## CI

`.github/workflows/ci.yml` runs on push and pull request:

1. `npm ci && npm run build && npx vitest run`
2. `pip install -r requirements.txt && pytest api/tests`

No secrets are needed. The model is never called in CI.
