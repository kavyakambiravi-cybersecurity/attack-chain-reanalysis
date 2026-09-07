# Test Plan: Attack Chain Counterfactual Re-analysis

**Frameworks**: Vitest for TypeScript, pytest for the Python API.
**Principle**: every deterministic rule in the constitution has a test, and every shape in the
plan's "Wire contract (frozen)" section has a test on both sides of the wire. The model is never
called in tests. Fixtures are small hand-written event sets, not the bundled scenarios, except
for the scenario and cached-analysis tests which run against the real generated files.

---

## Fixtures

`tests/fixtures/mini.ts` exports a six-event scenario in the generator's schema:

| id | source | target | type | detail |
|---|---|---|---|---|
| E-0001 | 203.0.113.47 | WKSTN-042 | authentication | External RDP logon for jsmith |
| E-0002 | jsmith | WKSTN-042 | process_start | powershell.exe -enc spawned by OUTLOOK.EXE |
| E-0003 | WKSTN-042 | 203.0.113.47 | network_connection | Outbound HTTPS beacon |
| E-0004 | WKSTN-042 | FILESRV-01 | authentication | Network logon as administrator |
| E-0005 | FILESRV-01 | 198.51.100.22 | network_connection | Outbound TLS, 480MB |
| E-0006 | apatel | WKSTN-017 | authentication | Interactive logon succeeded |

`tests/fixtures/chains.ts` exports:
- `goodChain`: edges `203.0.113.47->WKSTN-042 [E-0001]`, `jsmith->WKSTN-042 [E-0002]`,
  `WKSTN-042->203.0.113.47 [E-0003]`, `WKSTN-042->FILESRV-01 [E-0004]`,
  `FILESRV-01->198.51.100.22 [E-0005]`.
- `badCitationChain`: same but `WKSTN-042->FILESRV-01` cites `E-9999` (does not exist).
- `wrongEndpointChain`: same but `WKSTN-042->FILESRV-01` cites `E-0006` (exists, wrong assets).
- `userCollapsedChain`: same but `WKSTN-042->FILESRV-01` cites `E-0002` (a user-sourced event
  that involves only one of the two endpoints).
- `emptyCitationChain`: same but `WKSTN-042->FILESRV-01` has `citations: []`.
- `labelDroppedChain`: an edge `WKSTN-017->151.101.1.140 [E-0007]` where the event's target is
  `151.101.1.140 (fastly-cdn)`; add `E-0007` to the fixture for this test.

---

## Vitest

### `tests/validate.test.ts` — Constitution I

| Test | Expectation |
|---|---|
| all citations valid | every edge in `goodChain` is `verified: true`, each check has both booleans true |
| unknown event id | the `WKSTN-042->FILESRV-01` edge of `badCitationChain` is `verified: false`; its check for `E-9999` has `exists: false` |
| event exists but wrong endpoints | `wrongEndpointChain` edge is `verified: false`; check for `E-0006` has `exists: true`, `involvesBothEndpoints: false` |
| user collapsed into host | `userCollapsedChain` edge is `verified: false` (the citation names `jsmith`, not `FILESRV-01`) |
| empty citations | `emptyCitationChain` edge is `verified: false` with `checks: []` |
| label dropped from external name | `labelDroppedChain` edge is `verified: false`; asset names are matched exactly, no normalisation |
| endpoint order does not matter | an edge `WKSTN-042->203.0.113.47 [E-0001]` is `verified: true` (direction is the model's call, involvement is what is checked) |
| unknown node in edge | an edge whose source appears in no event is dropped; `ValidatedChain.warnings` has one line naming it |
| unknown node in nodes | a node whose id appears in no event is dropped from `nodes` with a warning; other nodes untouched |
| banned words | an edge whose description contains "Contained the threat" has `bannedWords: ["contained"]`; a clean edge has `[]` |
| output shape | `validateChain` returns a `ValidatedChain` carrying `scenario_id`, `removed_event_ids`, `prompt_version`, and `summary` unchanged from the input |
| validation is pure | calling twice with the same input returns deep-equal output and does not mutate the input |

### `tests/asset-kind.test.ts` — node kinds

| Input | Expected kind |
|---|---|
| `203.0.113.47` | external |
| `151.101.1.140 (fastly-cdn)` | external |
| `WKSTN-042`, `FILESRV-01`, `DC-01`, `MAIL-01` | host |
| `jsmith`, `administrator`, `svc_backup` | user |

### `tests/intervene.test.ts` — Constitution II

| Test | Expectation |
|---|---|
| isolate a host removes every event touching it | `eventsForNode("WKSTN-042", mini)` returns `["E-0001","E-0002","E-0003","E-0004"]` |
| isolate a user removes their events | `eventsForNode("jsmith", mini)` returns `["E-0002"]` |
| isolate an unknown asset | `eventsForNode("zz", mini)` returns `[]` |
| block an edge removes its citations | `eventsForEdge(goodChain.edges[3])` returns `["E-0004"]` |
| block an edge with an invalid citation still returns the id | `eventsForEdge` on the `badCitationChain` edge returns `["E-9999"]`; the server will reject it and the UI must surface that |
| union is set semantics | `unionRemoved(["E-0001","E-0002"], ["E-0002","E-0003"])` returns `["E-0001","E-0002","E-0003"]` in stable order |
| union does not mutate inputs | both input arrays are unchanged |

### `tests/diff.test.ts` — Story 4

| Test | Expectation |
|---|---|
| identical chains | every edge `survived` |
| edge removed | edge present in prev and absent in next is `vanished`, carried into the output with its previous citations |
| edge added | edge absent in prev and present in next is `appeared` |
| same endpoints, different action text | `survived` (identity is endpoints only) |
| reversed direction | `A->B` in prev and `B->A` in next produce one `vanished` and one `appeared` |
| empty next | every prev edge `vanished`, output length equals prev length |
| counts | `DiffedChain.counts` totals match the edges array; nodes are not counted |
| node survived | a node present in both chains is `survived` with the current label |
| node vanished | a node present only in prev is `vanished` and keeps its previous label |
| node appeared | a node present only in next is `appeared` |
| first render | `diffChains(null, next)` marks every node and edge `survived` and counts `{0, n, 0}` |
| vanished node keeps vanished edges | isolating `FILESRV-01` in the fixture leaves the node and its edges in the output as `vanished` |

### `tests/scenario.test.ts` — FR-001, FR-002, FR-003 (runs against both generated scenarios)

Parameterised over `attack-chain-01` and `benign-lookalike-02`.

| Test | Expectation |
|---|---|
| event count | `events.json` length is exactly `answer_key.total_events` and between 450 and 550 |
| ids unique and sequential | ids match `/^E-\d{4}$/`, are unique, and run `E-0001..E-0500` with no gaps |
| sorted by timestamp | `timestamp` is non-decreasing |
| schema | every event has exactly `id, timestamp, source, target, type, detail`, all non-empty; `type` is one of the four |
| no self-loops | no event has `source === target` |
| answer key ids exist | every id in `attack_event_ids` and `lookalike_event_ids` (when present) is in `events.json` |
| seeded events span two assets | every seeded event has `source !== target` |

Attack scenario only:

| Test | Expectation |
|---|---|
| attack ratio | attack ids are between 2 and 6 percent of events |
| attack spans time | first and last attack events are at least 20 minutes apart |
| attacker IPs only in attack events | `203.0.113.47` and `198.51.100.22` appear in no non-attack event |
| lateral path present | some attack event has target `DC-01` and some has target `FILESRV-01` |
| story present | `chain_summary` has between 4 and 8 non-empty steps |

Benign scenario only:

| Test | Expectation |
|---|---|
| no attack ids | `attack_event_ids` is empty and `scenario_type` is `benign` |
| attacker IPs absent | neither attacker IP appears in any event |
| lookalikes explained | every `lookalikes[]` entry has a non-empty `why_benign` and its `id` is in `lookalike_event_ids` |

### `tests/schema.test.ts` — wire contract on the client

Reads every file in `specs/001-attack-chain-reanalysis/contract/`.

| Test | Expectation |
|---|---|
| request example parses | `analyze_request.json` passes the zod `AnalyzeRequest` schema |
| response example parses | `analyze_response.json` passes the zod `Chain` schema and every field survives round-trip |
| response requires prompt_version | the example with `prompt_version` deleted is rejected |
| missing citations field fails | an edge without `citations` is rejected |
| extra fields are stripped | an edge with `confidence: 0.9` parses and the output has no `confidence` key (constitution IV: no score can leak in through the schema) |
| error with ids parses | `error_unknown_event_ids.json` passes the `ErrorResponse` schema with `ids` as a string array |
| error without ids parses | `error_not_configured.json` passes; `ids` is `undefined` |
| unknown error code rejected | `{error: "teapot", detail: "x"}` is rejected |
| health shapes parse | `health_live.json` and `health_offline.json` pass the `HealthResponse` schema; `ok` must be literally `true` |
| both answer key shapes parse | the attack key and the benign key both pass the zod `AnswerKey` schema, and `seed`, `generated_by`, `attack_event_count` are stripped |

### `tests/api.test.ts` — client error handling (fetch stubbed)

| Test | Expectation |
|---|---|
| 200 returns a Chain | stubbed 200 with `analyze_response.json` resolves to the parsed chain |
| non-2xx with contract body | stubbed 503 with `error_not_configured.json` rejects with an `ApiError` whose `code` is `not_configured` and `detail` matches |
| non-2xx with foreign body | stubbed 500 with `<html>oops</html>` rejects with `code: "internal"` and `detail: "Unexpected response from the server."` |
| request body shape | the stub records a body equal to `{scenario_id, removed_event_ids}` and nothing else |
| missing analysis is not fatal | `loadScenario` with a stubbed 404 for `analysis.json` resolves with `cached: null` |
| missing events is fatal | `loadScenario` with a stubbed 404 for `events.json` rejects |

### `tests/mock.test.ts` — the dev mock honours the contract

| Test | Expectation |
|---|---|
| mock cached chain parses | `src/mock/analysis.attack-chain-01.json` passes the `Chain` schema and validates against the real `events.json` with zero unverified edges |
| mock cached chain cites the answer key | every edge cites at least one `attack_event_ids` entry; all 7 answer-key assets appear as nodes |
| mock subtraction | `analyze("attack-chain-01", <all FILESRV-01 event ids>)` returns a chain with no `FILESRV-01` node and no edge touching it |
| mock full analysis | `analyze("attack-chain-01", [])` returns the cached chain unchanged |
| mock error mode | with `mockError=model_error` set, the next `analyze` rejects with `code: "model_error"`; the one after succeeds |
| mock is not in the bundle | after `vite build` without the flag, no file in `dist/` contains the string `mock/analysis` |

### `tests/cached-analysis.test.ts` — the committed first analysis is trustworthy

Runs against `data/scenarios/attack-chain-01/analysis.json`. The whole file is skipped with the
message "analysis.json not generated yet (backend task T012)" when the file is absent, so the
frontend suite is green before the backend has run the model. CI treats the skip as a warning
in the job summary, never as a pass, until T012 lands.

| Test | Expectation |
|---|---|
| cached chain parses | the file passes the zod `Chain` schema, `scenario_id` is `attack-chain-01`, `removed_event_ids` is `[]` |
| cached chain validates | `validateChain` against `events.json` yields zero unverified edges and no warnings. If this fails, regenerate the analysis or fix the prompt before shipping |
| cached chain cites attack events | at least 10 of the 16 `attack_event_ids` are cited by some edge |
| cached chain reaches the domain controller | some edge has `DC-01` as an endpoint |
| cached chain reaches exfiltration | some edge has `198.51.100.22` as an endpoint |
| no noise-only edges | every edge cites at least one attack event id |
| banned words absent | no edge `action`, `description`, or the `summary` contains "secure", "safe", or "contained" (case-insensitive, whole word) |

If `data/scenarios/benign-lookalike-02/analysis.json` exists (Phase 6b):

| Test | Expectation |
|---|---|
| benign chain is empty or unverified | the number of verified edges is at most 1 |
| banned words absent | as above |

---

## pytest (`api/tests/`)

The Anthropic client is replaced with a fake via `monkeypatch` on `api.analysis.client`.
Endpoint tests use FastAPI's `TestClient`.

### `test_contract.py` — wire contract on the server

Reads every file in `specs/001-attack-chain-reanalysis/contract/`.

| Test | Expectation |
|---|---|
| request example validates | `AnalyzeRequest.model_validate` accepts `analyze_request.json` |
| response example validates | `AnalyzeResponse.model_validate` accepts `analyze_response.json`; `model_dump()` has exactly the example's top-level keys |
| error examples validate | both error files validate as `ErrorResponse`; the one without `ids` dumps without an `ids` key |
| health examples validate | both health files validate as `HealthResponse` |
| every error code has a status | `STATUS_FOR_ERROR` maps all nine `ErrorCode` values and nothing else |
| unknown request fields ignored | a request with an extra `foo` field is accepted |

### `test_scenario.py`

| Test | Expectation |
|---|---|
| load known scenario | `load("attack-chain-01")` returns 500 events |
| unknown scenario | `load("nope")` raises `UnknownScenario` |
| subtract removes exactly the ids | `subtract(events, ["E-0001","E-0002"])` returns length minus two and neither id present |
| unknown ids rejected | `subtract(events, ["E-9999"])` raises `UnknownEventIds` carrying `["E-9999"]` |
| duplicates deduped, order kept | `dedupe(["E-0002","E-0001","E-0002"])` returns `["E-0002","E-0001"]` |
| too many rejected | 201 distinct ids raises `TooManyRemoved`; 200 distinct ids does not |
| empty removal allowed | `subtract(events, [])` returns all 500 events |

### `test_analyze.py`

Every row also asserts that the response body validates as `AnalyzeResponse` (2xx) or
`ErrorResponse` (non-2xx) and that `Content-Type` is `application/json`.

| Test | HTTP | `error` | Expectation |
|---|---|---|---|
| happy path | 200 | | client fake returns a `ChainOutput`; body echoes deduped `removed_event_ids` in first-seen order and carries `prompt_version == PROMPT_VERSION` |
| empty removal | 200 | | `removed_event_ids: []` calls the model with all 500 events |
| malformed body | 400 | `bad_request` | `{"scenario": "x"}` never reaches the model; body is the contract shape, not FastAPI's default |
| non-JSON body | 400 | `bad_request` | raw text body |
| unknown scenario | 404 | `unknown_scenario` | |
| unknown ids | 400 | `unknown_event_ids` | `ids` lists exactly the bad ones; the client fake is never called |
| too many | 400 | `too_many_removed` | 201 ids |
| rate limited | 429 | `rate_limited` | eleventh call within a minute on one instance |
| no key | 503 | `not_configured` | `ANTHROPIC_API_KEY` unset; client fake never called |
| refusal | 502 | `model_refused` | fake returns `stop_reason == "refusal"` |
| SDK error | 502 | `model_error` | fake raises `anthropic.APIStatusError` |
| timeout | 502 | `model_error` | fake raises `anthropic.APITimeoutError` |
| unexpected exception | 500 | `internal` | fake raises `RuntimeError`; body is the contract shape |
| health with key | 200 | | `{"ok": true, "live": true, "model": "claude-sonnet-5"}` exactly |
| health without key | 200 | | `live: false`, and the model was never constructed or called |
| render_events is stable | | | identical text on two calls with the same input (prompt cache hygiene) |
| render_events keeps labels | | | the rendered line for an event targeting `151.101.1.140 (fastly-cdn)` contains the label verbatim |
| render_events never mentions removals | | | output for 486 events contains none of the removed ids and not the words "removed" or "re-analy" |

### `test_cached.py`

Skipped when `data/scenarios/attack-chain-01/analysis.json` is absent.

| Test | Expectation |
|---|---|
| cached file is an AnalyzeResponse | validates; `scenario_id` is `attack-chain-01`; `removed_event_ids` is `[]` |
| prompt version matches | `prompt_version == api.analysis.PROMPT_VERSION`; failure means rerun `scripts/analyze.py` |

## Manual checks before submission

These are not automated. Run them on the deployed URL and tick them in the rationale.

- [ ] Page loads the cached chain in under two seconds with no console errors.
- [ ] Click every edge. Each evidence panel lists at least one event and no cross marks.
- [ ] Isolate `FILESRV-01`. The live call completes. `203.0.113.47 -> WKSTN-042 -> DC-01` survives.
- [ ] Isolate `WKSTN-042`. Initial access, beacon, and both lateral logons vanish.
- [ ] Block a single edge. Only that edge's events are removed; the banner count matches.
- [ ] Reset returns to the cached chain.
- [ ] Open the answer key. Attack ids cited by the chain are marked.
- [ ] Disconnect the key in Vercel, redeploy. Buttons disable and the pill says live is off.
      Reconnect.
- [ ] Search the rendered page for "secure", "safe", "contained". None present.
- [ ] If the switcher shipped: select the benign scenario and confirm no connected chain is drawn.

---

## CI

`.github/workflows/ci.yml` runs on push and pull request:

1. `npm ci && npm run build && npx vitest run`
2. `pip install -r requirements.txt && pytest api/tests`

No secrets are needed. The model is never called in CI. The Vitest step prints skipped files;
a skipped `cached-analysis.test.ts` is expected until backend task T012 lands and is called out
in the job summary.
