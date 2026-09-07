# Tasks: Attack Chain Counterfactual Re-analysis

**Input**: [spec.md](spec.md), [plan.md](plan.md), [tests.md](tests.md)
**Budget**: 3 to 4 hours. Estimates below sum to about 3h 50m. Cut lines are marked.

Task format: `[ID] [P?] [Story] Description`. `[P]` means it can run in parallel with the
task above it. Story tags: US1 see the chain, US2 evidence, US3 intervene, US4 diff.
Foundation tasks carry no story tag.

---

## Phase 1: Setup (20 min)

- [ ] T001 Remove the Spring Boot scaffold: `pom.xml`, `mvnw`, `mvnw.cmd`, `.mvn/`, `src/main`,
      `src/test`, `Dockerfile`, `.dockerignore`, `target/`. Rewrite `README.md` for the new stack.
      Replace `.github/workflows/ci.yml` with vitest + pytest + vite build.
- [ ] T002 Scaffold Vite + React + TypeScript at the repo root. Add `reactflow`, `dagre`,
      `zod` as dependencies and `vitest`, `@types/dagre` as dev dependencies. Add `vite.config.ts`
      with a `/api` proxy to `localhost:8000` and a `prebuild` script `scripts/copy_scenarios.mjs`.
- [ ] T003 [P] Scaffold the Python API: `requirements.txt` (`fastapi`, `anthropic`, `pydantic`,
      `pytest`, `httpx2`), `api/index.py` with `/api/health`, `vercel.json` per plan, `.env.example`.
- [ ] T004 [P] Update `.gitignore`: drop Maven entries, add `node_modules/`, `dist/`,
      `public/scenarios/`, `__pycache__/`, `.venv/`, `.vercel/`.
- [ ] T005 Write `src/types.ts` with Event, AnswerKey, Chain, ChainNode, ChainEdge,
      ValidatedEdge, DiffedEdge, Intervention. Write the matching zod schemas in `src/lib/schema.ts`.

**Checkpoint**: `npm run dev` serves a blank page; `uvicorn api.index:app` answers `/api/health`.

---

## Phase 2: Scenario data (35 min)

- [ ] T006 Write `scripts/gen_noise.py`: seeded generator for about 475 benign events across
      the asset list in plan.md, four event types, realistic details, timestamps in the
      scenario window. Pure function of the seed.
- [ ] T007 [P] Write `.claude/skills/generate-scenario/SKILL.md` and its reference file
      `narratives/s001.md` with the ten-step attack narrative from plan.md.
- [ ] T008 Write `scripts/build_scenario.py`: read `attack.json`, merge with noise, sort by
      timestamp, assign ids `e0001..`, write `events.json` and `answer_key.json` with the story.
- [ ] T009 Run the skill to author `data/scenarios/s001/attack.json` (about 25 events),
      then run the builder. Review the attack events by hand for realism. Commit both outputs.
- [ ] T010 Write `tests/scenario.test.ts` per tests.md and make it pass against the built files.

**Checkpoint**: `events.json` has roughly 500 events, the answer key lists roughly 25, tests pass.

---

## Phase 3: Analysis path (40 min)

- [ ] T011 Write `api/scenario.py`: load a scenario by id from `data/scenarios`, validate
      removed ids, dedupe, enforce `MAX_REMOVED`, return remaining events.
- [ ] T012 Write `api/analysis.py`: Pydantic `Chain` models, frozen `SYSTEM_PROMPT`,
      `render_events()`, `analyze(events) -> Chain` using `client.messages.parse` with
      `claude-sonnet-5`, adaptive thinking, `effort: medium`, cache_control on the system
      prompt, `timeout=50`, `max_retries=0`. Handle `stop_reason == "refusal"`.
- [ ] T013 Wire `POST /api/analyze` in `api/index.py` with the error shape from plan.md and the
      per-instance token bucket.
- [ ] T014 [P] Write `api/tests/test_scenario.py` and `api/tests/test_analyze.py` per tests.md
      with the Anthropic client mocked. Make them pass.
- [ ] T015 Write `scripts/analyze.py` that imports `api.analysis.analyze`, runs it on the full
      scenario, writes `data/scenarios/s001/analysis.json`. Run it once with a real key. Inspect
      the chain by hand: does it find the second foothold on `db-hr-02`? If not, tighten the
      prompt and rerun. Commit `analysis.json`.

**Checkpoint**: `curl -X POST localhost:8000/api/analyze` with two removed ids returns a chain.

---

## Phase 4: User Story 1 and 2, see the chain and its evidence (55 min)

- [ ] T016 [US1] Write `src/lib/validate.ts`: `validateChain(chain, events) -> ValidatedEdge[]`
      per the rules in plan.md. Write `tests/validate.test.ts` first; make it pass.
- [ ] T017 [US1] Write `src/lib/api.ts`: `loadScenario(id)` fetching the three static JSON files
      and parsing with zod; `analyze(id, removedIds)` posting to the API and parsing the response
      or the error shape.
- [ ] T018 [US1] Write `src/graph/layout.ts`: dagre LR layout returning React Flow nodes and
      edges from a validated chain. Deterministic node order by first citation timestamp.
- [ ] T019 [US1] Write `src/graph/ChainGraph.tsx` with custom node and edge components and the
      four edge styles from plan.md. Render the cached chain on load.
- [ ] T020 [US2] Write `src/graph/EvidencePanel.tsx`: header, one row per citation with both
      checks, unverified reason line. Wire edge click.
- [ ] T021 [US1] [P] Write `src/components/AnswerKey.tsx` slide-over with story steps and ids,
      marking ids cited by the current chain.
- [ ] T022 [US1] Write `src/App.tsx` layout: toolbar, graph, panel, legend. Health check on load
      sets the live status pill.

**Checkpoint**: Page loads the cached chain, edges are clickable, answer key opens. This is the
minimum demonstrable state. Stories 1 and 2 are done.

---

## Phase 5: User Story 3, intervene and re-analyze (35 min)

- [ ] T023 [US3] Write `src/lib/intervene.ts`: `eventsForNode(node, events)`,
      `eventsForEdge(edge)`, `unionRemoved(prev, next)`. Write `tests/intervene.test.ts` first.
- [ ] T024 [US3] Add Isolate on node hover and Block on edge hover. On click: compute removed
      ids, union with state, call `analyze`, show spinner, keep the previous graph until the
      response, validate the new chain, render. Banner on error keeps the previous chain.
- [ ] T025 [US3] Add Reset: clear removals, reload cached analysis.
- [ ] T026 [US3] Disable intervention buttons when health reports `live: false`, with a tooltip
      saying live re-analysis is unavailable.

**Checkpoint**: Isolate `fs-corp-01`, watch a live call, see the chain to `db-hr-02` survive.
This is the hero moment. Everything below this line is cuttable.

---

## Phase 6: User Story 4, see what changed (25 min) — CUT LINE 1

- [ ] T027 [US4] Write `src/lib/diff.ts`: `diffChains(prev, next) -> DiffedEdge[]` keyed by
      `source->target`. Write `tests/diff.test.ts` first.
- [ ] T028 [US4] Apply diff statuses to edge styles. Keep vanished edges in the layout, faded.
      Add `src/graph/Legend.tsx`.
- [ ] T029 [US4] Banner after re-analysis: "Removed N events. A vanished, B survived, C appeared."

---

## Phase 7: Ship (40 min)

- [ ] T030 Deploy to Vercel. Set `ANTHROPIC_API_KEY`. Verify `includeFiles` and `maxDuration`
      per plan.md. Run the hero loop on the deployed URL.
- [ ] T031 [P] Write the rationale doc from the talking points in spec.md. Fill in time spent.
- [ ] T032 Record the five minute video: novice story first, then isolate `fs-corp-01`, then
      the answer key, then one unverified edge if one exists.
- [ ] T033 Export Claude Code transcripts. Push. Submit links.

---

## Cut order if time runs out

1. Phase 6 entirely. Re-analysis still renders a fresh graph, just without diff colors.
2. `summary` field in the chain. Drop from the schema and the prompt.
3. Answer key marking of cited ids (keep the plain list).
4. Token bucket guard. Note the omission in the rationale.

Never cut: T016 validation, T024 live re-analysis, T030 deploy.

---

## Dependencies

- T001 before everything.
- T005 before T010, T016, T017, T023, T027.
- T009 before T010, T015, and all of Phase 4.
- T012 before T013, T014, T015.
- T015 before T019 (the cached chain must exist to render).
- T016 before T019.
- T023 before T024.
- T027 before T028.
- Phase 5 before Phase 6.
