# Test Plan: Attack Chain Counterfactual Re-analysis

**Frameworks**: Vitest for TypeScript, pytest for the Python API.
**Principle**: every deterministic rule in the constitution has a test. The model is never
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
| unknown node in edge | an edge whose source appears in no event is dropped and reported in a `warnings` array |
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
| counts helper | `summarize(diff)` returns `{vanished, survived, appeared}` totals matching the array |

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

### `tests/schema.test.ts` — API contract on the client

| Test | Expectation |
|---|---|
| valid chain parses | a well-formed chain object passes the zod Chain schema |
| missing citations field fails | an edge without `citations` is rejected |
| extra fields are stripped | an edge with `confidence: 0.9` parses and the output has no `confidence` key (constitution IV: no score can leak in through the schema) |
| error shape parses | `{error: "unknown_event_ids", detail: "E-9999"}` parses with the error schema |
| both answer key shapes parse | the attack key and the benign key both pass the zod AnswerKey schema |

### `tests/cached-analysis.test.ts` — the committed first analysis is trustworthy

Runs against `data/scenarios/attack-chain-01/analysis.json`.

| Test | Expectation |
|---|---|
| cached chain validates | `validateChain` against `events.json` yields zero unverified edges. If this fails, regenerate the analysis or fix the prompt before shipping |
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

### `test_scenario.py`

| Test | Expectation |
|---|---|
| load known scenario | `load("attack-chain-01")` returns 500 events |
| unknown scenario | `load("nope")` raises `UnknownScenario` |
| subtract removes exactly the ids | `subtract(events, ["E-0001","E-0002"])` returns length minus two and neither id present |
| unknown ids rejected | `subtract(events, ["E-9999"])` raises `UnknownEventIds` with `["E-9999"]` in the message |
| duplicates deduped | `subtract(events, ["E-0001","E-0001"])` removes one event |
| too many rejected | 201 ids raises `TooManyRemoved` |

### `test_analyze.py`

| Test | Expectation |
|---|---|
| happy path | with the client faked to return a parsed `Chain`, `POST /api/analyze` returns 200, echoes deduped `removed_event_ids`, and the body parses as `Chain` |
| refusal | client fake returns `stop_reason == "refusal"`; endpoint returns 502 with `error: model_refused` |
| SDK error | client fake raises `anthropic.APIStatusError`; endpoint returns 502 with `error: model_error` |
| unknown ids | request with `["E-9999"]` returns 400 `unknown_event_ids` and the client fake is never called |
| health without key | with `ANTHROPIC_API_KEY` unset, `/api/health` returns `live: false` |
| render_events is stable | `render_events(events)` returns identical text on two calls with the same input (prompt cache hygiene) |
| render_events keeps labels | the rendered line for an event targeting `151.101.1.140 (fastly-cdn)` contains the label verbatim |

---

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

No secrets are needed. The model is never called in CI.
