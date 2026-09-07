# Tasks: Attack Chain Counterfactual Re-analysis

**Input**: [spec.md](spec.md), [plan.md](plan.md), [tests.md](tests.md)
**Budget**: 3 to 4 hours. Estimates below sum to about 3h 30m before optional work.
Cut lines are marked.

Task format: `[ID] [P?] [Story] Description`. `[P]` means it can run in parallel with the
task above it. Story tags: US1 see the chain, US2 evidence, US3 intervene, US4 diff.
Foundation tasks carry no story tag.

The scenario generator skill and both generated scenarios already exist. Phase 2 moves them
and tests them; it does not create them.

---

## Phase 1: Setup (25 min)

- [ ] T001 Remove the Spring Boot scaffold: `pom.xml`, `mvnw`, `mvnw.cmd`, `.mvn/`, `src/main/java`,
      `src/test/java`, `src/main/resources/application*.yml`, `Dockerfile`, `.dockerignore`,
      `target/`. Rewrite `README.md` for the new stack. Replace `.github/workflows/ci.yml` with
      vitest + pytest + vite build.
- [ ] T002 Move scenario data: `git mv src/main/resources/scenarios data/scenarios`. Change the
      default output path in `.claude/skills/generate-scenario/generate.py` (line near 305) to
      `data/scenarios`, update the run section of `SKILL.md`, re-run both scenarios, and confirm
      `git diff` on the JSON is empty. Commit the skill and the data.
- [ ] T003 Scaffold Vite + React + TypeScript at the repo root. Add `reactflow`, `dagre`,
      `zod` as dependencies and `vitest`, `@types/dagre` as dev dependencies. Add `vite.config.ts`
      with a `/api` proxy to `localhost:8000` and a `prebuild` script `scripts/copy_scenarios.mjs`.
- [ ] T004 [P] Scaffold the Python API: `requirements.txt` (`fastapi`, `anthropic`, `pydantic`,
      `pytest`, `httpx2`), `api/index.py` with `/api/health`, `vercel.json` per plan, `.env.example`.
- [ ] T005 [P] Update `.gitignore`: drop Maven entries, add `node_modules/`, `dist/`,
      `public/scenarios/`, `__pycache__/`, `.venv/`, `.vercel/`.
- [ ] T006 Write `src/types.ts` with Event, AnswerKey, Chain, ChainNode, ChainEdge,
      ValidatedEdge, DiffedEdge, Intervention, and `assetKind(name)`. Write the matching zod
      schemas in `src/lib/schema.ts`.

**Checkpoint**: `npm run dev` serves a blank page; `uvicorn api.index:app` answers `/api/health`;
`data/scenarios/attack-chain-01/events.json` exists.

---

## Phase 2: Scenario tests (10 min)

- [ ] T007 Write `tests/scenario.test.ts` per tests.md against both generated scenarios.
      Make it pass without touching the generator. If a test fails, the test is wrong, not the
      data, unless the generator's own asserts disagree.

**Checkpoint**: scenario tests green for `attack-chain-01` and `benign-lookalike-02`.

---

## Phase 3: Analysis path (40 min)

- [ ] T008 Write `api/scenario.py`: load a scenario by id from `data/scenarios`, validate
      removed ids, dedupe, enforce `MAX_REMOVED`, return remaining events.
- [ ] T009 Write `api/analysis.py`: Pydantic `Chain` models, frozen `SYSTEM_PROMPT`,
      `render_events()`, `analyze(events) -> Chain` using `client.messages.parse` with
      `claude-sonnet-5`, adaptive thinking, `effort: medium`, cache_control on the system
      prompt, `timeout=50`, `max_retries=0`. Handle `stop_reason == "refusal"`. The prompt must
      say: users are assets; copy asset names verbatim including parenthesised labels; an
      edge's endpoints must equal the cited events' source and target.
- [ ] T010 Wire `POST /api/analyze` in `api/index.py` with the error shape from plan.md and the
      per-instance token bucket.
- [ ] T011 [P] Write `api/tests/test_scenario.py` and `api/tests/test_analyze.py` per tests.md
      with the Anthropic client faked. Make them pass.
- [ ] T012 Write `scripts/analyze.py <scenario-id>` that imports `api.analysis.analyze`, runs it
      on the full scenario, writes `analysis.json`. Run it on `attack-chain-01` with a real key.
      Inspect the chain by hand against the table in plan.md: does it reach `DC-01` and
      `198.51.100.22`, and are the endpoints user-accurate? If not, tighten the prompt and rerun.
      Commit `analysis.json`.

**Checkpoint**: `curl -X POST localhost:8000/api/analyze` with two removed ids returns a chain.

---

## Phase 4: User Story 1 and 2, see the chain and its evidence (55 min)

- [ ] T013 [US1] Write `src/lib/validate.ts`: `validateChain(chain, events) -> ValidatedEdge[]`
      per the rules in plan.md. Write `tests/validate.test.ts` first; make it pass.
- [ ] T014 [US1] Write `tests/cached-analysis.test.ts` per tests.md. It must pass against the
      committed `analysis.json`. If it does not, go back to T012.
- [ ] T015 [US1] Write `src/lib/api.ts`: `loadScenario(id)` fetching the three static JSON files
      and parsing with zod; `analyze(id, removedIds)` posting to the API and parsing the response
      or the error shape.
- [ ] T016 [US1] Write `src/graph/layout.ts`: dagre LR layout returning React Flow nodes and
      edges from a validated chain. Deterministic node order by first citation timestamp.
- [ ] T017 [US1] Write `src/graph/ChainGraph.tsx` with custom node and edge components, node
      icon by `assetKind`, and the four edge styles from plan.md. Render the cached chain on load.
- [ ] T018 [US2] Write `src/graph/EvidencePanel.tsx`: header, one row per citation with both
      checks, unverified reason line. Wire edge click.
- [ ] T019 [US1] [P] Write `src/components/AnswerKey.tsx` slide-over with `chain_summary` and
      `attack_event_ids`, marking ids cited by the current chain. For the benign key, show
      `lookalikes` with `why_benign`.
- [ ] T020 [US1] Write `src/App.tsx` layout: toolbar, graph, panel, legend. Health check on load
      sets the live status pill.

**Checkpoint**: Page loads the cached chain, edges are clickable, answer key opens. This is the
minimum demonstrable state. Stories 1 and 2 are done.

---

## Phase 5: User Story 3, intervene and re-analyze (35 min)

- [ ] T021 [US3] Write `src/lib/intervene.ts`: `eventsForNode(node, events)`,
      `eventsForEdge(edge)`, `unionRemoved(prev, next)`. Write `tests/intervene.test.ts` first.
- [ ] T022 [US3] Add Isolate on node hover and Block on edge hover. On click: compute removed
      ids, union with state, call `analyze`, show spinner, keep the previous graph until the
      response, validate the new chain, render. Banner on error keeps the previous chain.
- [ ] T023 [US3] Add Reset: clear removals, reload cached analysis.
- [ ] T024 [US3] Disable intervention buttons when health reports `live: false`, with a tooltip
      saying live re-analysis is unavailable.

**Checkpoint**: Isolate `FILESRV-01`, watch a live call, see `203.0.113.47 -> WKSTN-042 -> DC-01`
survive. This is the hero moment. Everything below this line is cuttable.

---

## Phase 6: User Story 4, see what changed (25 min) — CUT LINE 1

- [ ] T025 [US4] Write `src/lib/diff.ts`: `diffChains(prev, next) -> DiffedEdge[]` keyed by
      `source->target`. Write `tests/diff.test.ts` first.
- [ ] T026 [US4] Apply diff statuses to edge styles. Keep vanished edges in the layout, faded.
      Add `src/graph/Legend.tsx`.
- [ ] T027 [US4] Banner after re-analysis: "Removed N events. A vanished, B survived, C appeared."

---

## Phase 6b: Optional, benign scenario switcher (15 min) — CUT LINE 2

Only if Phase 6 is done and time remains. The data already exists, so this is cheap, and it
gives the reviewer the moment where the model correctly draws no chain.

- [ ] T028 Run `scripts/analyze.py benign-lookalike-02` and commit its `analysis.json`. Confirm
      it has zero or only unverified edges. If it draws a confident chain, do not ship the
      switcher; note it in the rationale as a finding.
- [ ] T029 Add a scenario dropdown in the toolbar. Switching resets removals and reloads.

---

## Phase 7: Ship (40 min)

- [ ] T030 Deploy to Vercel. Set `ANTHROPIC_API_KEY`. Verify `includeFiles` and `maxDuration`
      per plan.md. Run the hero loop on the deployed URL.
- [ ] T031 [P] Write the rationale doc from the talking points in spec.md. Fill in time spent.
- [ ] T032 Record the five minute video: novice story first, then isolate `FILESRV-01`, then
      the answer key, then one unverified edge if one exists.
- [ ] T033 Export Claude Code transcripts. Push. Submit links.

---

## Cut order if time runs out

1. Phase 6b, then Phase 6. Re-analysis still renders a fresh graph, just without diff colors.
2. `summary` field in the chain. Drop from the schema and the prompt.
3. Answer key marking of cited ids (keep the plain list).
4. Token bucket guard. Note the omission in the rationale.

Never cut: T013 validation, T014 cached-analysis trust test, T022 live re-analysis, T030 deploy.

---

## Dependencies

- T001 and T002 before everything else.
- T006 before T007, T013, T015, T021, T025.
- T009 before T010, T011, T012.
- T012 before T014 and T017 (the cached chain must exist to test and render).
- T013 before T014 and T017.
- T021 before T022.
- T025 before T026.
- Phase 5 before Phase 6. Phase 6 before Phase 6b.
