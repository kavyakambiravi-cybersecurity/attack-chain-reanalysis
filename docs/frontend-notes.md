# Frontend notes (branch `001-frontend`)

Tasks T003 to T027 of `specs/001-attack-chain-reanalysis/tasks.md`, built in the frontend
worktree against the frozen wire contract and a dev mock, with no Python, no key, and no
`analysis.json` present at the time of writing. Nothing under `api/**`, `scripts/analyze.py`,
`requirements.txt`, `vercel.json`, `.env.example`, or `data/scenarios/**` was touched.

## What was created

**Scaffold.** `package.json` (reactflow, dagre, zod; vitest, @types/dagre), `vite.config.ts`
with the `/api` to `localhost:8000` dev proxy and the Vitest config, `tsconfig*.json`,
`index.html`, and `scripts/copy_scenarios.mjs`, the `prebuild` step that copies
`data/scenarios` into the gitignored `public/scenarios`.

**Types and schemas.** `src/types.ts` carries the wire shapes verbatim in snake_case plus the
client-only validated and diffed shapes and `assetKind(name)`. `src/lib/schema.ts` mirrors them
in zod; objects strip unknown keys, so the server can add fields freely and no score field can
leak in.

**Logic.** `src/lib/validate.ts` (citation checking, banned-word flagging, `explainCheck`),
`src/lib/intervene.ts` (`eventsForNode`, `eventsForEdge`, `unionRemoved`), `src/lib/diff.ts`
(`diffChains`, `describeChange`), `src/lib/api.ts` and `src/lib/http.ts` (`loadScenario`,
`analyze`, `health`, `ApiError`), `src/lib/mock.ts` with `src/mock/analysis.attack-chain-01.json`.

**UI.** `src/graph/` — `layout.ts` (dagre LR, nodesep 40, ranksep 120), `ChainGraph.tsx`,
`EvidencePanel.tsx`, `Legend.tsx`, `AssetIcon.tsx`. `src/components/` — `Toolbar.tsx`,
`AnswerKey.tsx`. `src/App.tsx` wires load, health, intervention, reset, diff, and banners.
`src/styles.css`.

**Tests.** `tests/` — schema, scenario, validate, asset-kind, api, mock, cached-analysis,
intervene, diff, layout, render, plus `tests/fixtures/{mini,chains}.ts` and `tests/contract.ts`.
The test file was written before the module for validate, intervene, diff, and schema.

## Decisions worth knowing

- **Asset names are matched exactly; nothing is normalised.** A node or edge is dropped only
  when its name matches nothing in the events, *including the unlabelled form of a labelled
  asset*. So a model that writes `151.101.1.140` for `151.101.1.140 (fastly-cdn)` gets an
  unverified edge with a reason rather than a silently vanished one, while an invented name
  like `GHOST-99` is dropped with a warning. This reconciles two rows of `tests.md` that
  disagreed under a single exact-match rule.
- **The mock is verified absent from production, both ways.** A normal build emits no mock
  chunk and no file in `dist/` contains `mock/analysis` or a marker phrase from the mock chain;
  a `VITE_MOCK_API=1` build emits `assets/mock-*.js` containing both. The marker is a phrase
  from the mock data, not an unused exported constant, so tree-shaking cannot make the check
  pass falsely.
- **One intervention mechanism.** Isolate and Block both build an `Intervention` and differ
  only in which event ids they name. A citation the model invented is passed through untouched
  so the server can reject it and the UI can show that.
- **The first render is entirely `survived`**, never `appeared`: with nothing to compare
  against, nothing is new.
- **No score, no verdict.** The post-analysis banner reads
  `Removed N events. A vanished, B survived, C appeared.` The words "secure", "safe", and
  "contained" appear in the source only as `BANNED_WORDS` in the validator.

## Running it

```bash
npm ci
VITE_MOCK_API=1 npm run dev   # no Python and no key needed
npx vitest run
npm run build                 # prebuild copies data/scenarios to public/scenarios
```

`?mockError=<code>` on the page URL arms the next `analyze()` to fail with that error code.

## State at the time of writing

`npx vitest run` — 108 passed, 2 skipped, 11 files. `npm run build` clean. The two skips are
`tests/cached-analysis.test.ts`, which prints its reason to stderr and activates as soon as
`data/scenarios/attack-chain-01/analysis.json` lands from backend task T012.

## Merge notes

- **`vercel.json` is deliberately absent here.** The backend already committed it on
  `001-backend`, byte-identical to the plan and including the
  `"/api/(.*)" -> "/api/index"` rewrite this side depends on. A duplicate would buy nothing and
  risk an add/add conflict, so this branch leaves it to them.
- The backend's committed `analysis.json` was checked against the `cached-analysis` assertions
  before merging: it passes all of them, citing 16 of 16 attack events with zero unverified
  edges and zero validation warnings.
- Its `prompt_version` is `2026-09-07.2` where the contract example says `2026-09-07.1`. Not
  drift: the client schema only requires a non-empty string, and the backend's own pytest pins
  it to their constant.
- The backend's edit to `plan.md` adds three lines to `SYSTEM_PROMPT`, inside "Analysis design
  (server)" rather than the frozen wire contract, so the freeze holds.

## Added after the merge (T029 and the graph clean-up)

- **Scenario dropdown.** `src/lib/scenarios.ts` lists the two bundled scenarios by id and
  answer-key name; `tests/scenarios.test.ts` keeps that list equal to `data/scenarios/` and
  requires an `analysis.json` for each. The toolbar's select swaps `scenarioId` state in
  `App.tsx`; switching clears removals, selection, banners, and the graph, then reloads.
  `loadScenario` and `analyze` already took the id, so nothing on the wire changed. The mock
  serves an empty chain for any scenario but `attack-chain-01`.
- **No-chain state.** A chain with no nodes and no edges (the benign scenario, or an attack
  scenario cut down to nothing) renders a plain statement that nothing was drawn, plus the
  model's summary, instead of an empty canvas.
- **Edge labels no longer collide.** The first layout placed each label at the midpoint of a
  React Flow bezier, so labels on short or parallel edges landed under the node boxes, and
  two steps between the same assets (there are two `jsmith -> WKSTN-042` and two
  `administrator -> FILESRV-01` steps in the cached chain) shared one React Flow id and one
  position. Now `layout.ts` hands every label to dagre as a box (`LABEL_WIDTH` 150, height
  estimated from the text), so dagre reserves a column for labels between ranks and stacks
  parallel ones; edges are drawn along dagre's route points with a Catmull-Rom curve
  (`smoothPath`) and the label sits on that curve where dagre placed it. Node ids are
  unchanged; edge ids come from `uniqueEdgeIds` (`edgeKey`, then `edgeKey#2`), while
  interventions and diffs still key on `edgeKey`. Nodes are no longer draggable, since a
  dragged node would leave its routed edges behind. `tests/layout.test.ts` checks, on the
  committed chain, that no label overlaps a node or another label.

## Noted steps and data out (after the switcher)

- **Two lists from the model, one list on screen.** `Chain.notable` (steps the model set
  aside) is validated by the same code as `edges` and merged into `ValidatedChain.edges` with
  `role: "chain" | "notable"`. Diff, layout, evidence, and interventions did not change; the
  diff key carries the role, so a step that moves between the chain and the set-aside list
  shows as one vanished and one appeared. Noted steps draw dotted with a "noted" tag, and the
  evidence panel says the step was set aside and that its description is the reason.
- **Red means data left the network, in both scenarios.** `edgeKind` in `validate.ts` marks a
  step `data_out` when its target is an outside address and a cited connection event records
  a size in MB, GB, or TB. Code decides this from the events, never the model, so the same
  red appears on the attack's 480MB transfer and on the benign backup's 512GB upload; the
  "noted" tag and the label text carry the difference. Vanished steps moved from red to grey
  to free the colour.
- **The no-chain state draws the graph anyway.** When the chain is empty but noted steps
  exist, the canvas renders them under a short overlay ("No attack chain was drawn ...").
  Only a chain with nothing in either list falls back to the plain placeholder.
- **Answer key.** Lookalikes cited by a noted step are marked "Noted and set aside by the
  model"; any drawn into the chain would be marked in red, which is the failure case to watch.

## Staged changes, one analysis

Isolate and Block no longer run an analysis each. They stage a change: the asset or step is
outlined amber, its button flips to "Undo isolate" or "Undo block", and a banner lists what is
staged and how many more events it removes. A "Re-analyse (N changes, M events)" button in
the toolbar sends everything staged as one `POST /api/analyze`, whose `removed_event_ids` was
always an array. `toggleStaged`, `stagedRemoved`, and `describeStaged` in `intervene.ts` hold
the logic and are unit-tested; the app keeps `staged: Intervention[]` next to the committed
`removedIds`. A failed call keeps the staged list so it can be sent again; success, Reset,
and a scenario switch clear it. Clear in the banner drops the staged changes without running.
