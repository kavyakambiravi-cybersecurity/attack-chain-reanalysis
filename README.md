# Attack Chain Reanalysis

A security incident produces hundreds of telemetry events. This tool has Claude assemble them into
an attack chain drawn as a graph, shows the raw events behind every edge, and lets you intervene
on the graph (isolate a host, cut a connection) and see the chain re-analyzed from the evidence
that remains.

Every intervention is one operation: subtract a set of events and re-run the analysis. If you
remove the events behind an edge and the edge disappears, the model was grounded. If you isolate
the file server and the chain survives through stolen credentials, you have learned what an
expert would know.

Built for the Anthropic SWE take-home (Theme 1: Exploration & Understanding). The full rationale
is in [docs/Statement_of_Purpose.md](docs/Statement_of_Purpose.md), and the spec, plan, and
tasks live under [specs/001-attack-chain-reanalysis/](specs/001-attack-chain-reanalysis/).

## How it works

1. A bundled scenario (`data/scenarios/<id>/events.json`) is loaded in the browser along with a
   cached first analysis, so the first graph renders without any API call.
2. Clicking an edge opens a panel listing the exact events, quoted verbatim with their IDs,
   that justify it. An edge whose citations do not check out is drawn dashed and labeled
   unverified.
3. Isolating a node or cutting an edge sends the IDs of the affected events to
   `POST /api/analyze`. The server subtracts them and asks Claude for a fresh chain.
4. The new chain is diffed against the old one and the change is highlighted on the graph.

Two scenarios ship: `attack-chain-01` (a real intrusion) and `benign-lookalike-02` (noise that
looks like an attack but is not).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Flow, dagre, zod, Vite, TypeScript |
| Backend | FastAPI, Pydantic, Anthropic SDK (`claude-sonnet-5`) |
| Tests | Vitest (client), pytest (API) |
| Deploy | Vercel (static build plus a Python serverless function) |

## Running locally

Requires Node 18+ and Python 3.12.

**Backend**

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # add your ANTHROPIC_API_KEY
.venv/bin/python -m uvicorn api.index:app --port 8000
```

Without a key the server still starts. `GET /api/health` reports `live: false` and
`POST /api/analyze` returns `503 not_configured`, so the cached first graph still works.

**Frontend**

```sh
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to port 8000. Set
`VITE_MOCK_API=1` to run the client against a built-in mock with no backend at all.

## Tests

```sh
npm test                          # Vitest, client logic and render smoke tests
.venv/bin/python -m pytest api/tests   # pytest, API contract and scenario handling
npm run typecheck
```

## Regenerating a cached analysis

The cached `analysis.json` for each scenario is produced by the same function the live
endpoint runs, so the first screen and a live re-analysis cannot drift:

```sh
ANTHROPIC_API_KEY=... .venv/bin/python scripts/analyze.py attack-chain-01
```

This is the only step in the project that calls the model from the command line. If the
system prompt in `api/analysis.py` changes, bump `PROMPT_VERSION` and rerun this for every
committed scenario.

## Layout

```
api/            FastAPI app, analysis prompt and shapes, scenario loading, pytest suite
src/            React client: graph, evidence panel, toolbar, validation, diff, intervention
data/scenarios/ Bundled events, answer keys, and cached analyses
scripts/        analyze.py (model run) and copy_scenarios.mjs (prebuild copy to public/)
tests/          Vitest suite
specs/          Feature spec, plan, tasks, and the frozen wire contract
docs/           Statement of purpose and branch notes
```
