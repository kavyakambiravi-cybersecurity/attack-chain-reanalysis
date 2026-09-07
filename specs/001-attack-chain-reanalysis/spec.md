# Feature Specification: Attack Chain Counterfactual Re-analysis

**Feature Branch**: `001-attack-chain-reanalysis`
**Created**: 2026-09-07
**Status**: Draft
**Input**: Ideation session and Statement of Purpose (Anthropic SWE take-home, Theme 1: Exploration & Understanding)

---

## Purpose

A security incident produces hundreds of telemetry events. An expert analyst scrolls through
them, discards the noise, keeps the handful that matter, and builds a mental model of the attack
in their head. A new entrant cannot do this. The expert cannot do it fast under pressure, and
cannot show the mental model to anyone else.

AI can do the piecing together. But a decision maker will not act on a picture built entirely by
a model with no way to check it. The problem is not "build an attack graph with AI." It is
"build one that a novice can read and a CSO can trust."

This feature takes a raw stream of events, has Claude assemble them into an attack chain drawn
as a graph, and lets the user intervene on that graph and see the chain re-analyzed from the
remaining evidence.

**What is non-obvious**: acting on the graph and re-analyzing, not the graph itself. Every
intervention, whether isolating a host or cutting a connection, is one operation: subtract a set
of events and re-run. If the user removes the events behind an edge and the edge disappears,
the model was grounded. If they isolate the file server and the chain survives through stolen
credentials, they have learned what an expert would know and they would not.

**Delta from prior work, in one sentence**: I have built attack graphs that explain the past.
This one lets you act on the graph and see what the evidence still supports.

---

## User Scenarios & Testing

### User Story 1 - See the attack as one picture (Priority: P1)

A novice opens the tool and, instead of 500 rows of events, sees a graph with a handful of
nodes (hosts, users, external addresses) and edges (attacker actions between them).

**Why this priority**: Without this nothing else is possible. It is also the first thing a
reviewer sees.

**Independent Test**: Load the bundled scenario. A graph renders from the cached analysis
without any API call. The reviewer can count the nodes on one hand.

**Acceptance Scenarios**:

1. **Given** the bundled scenario, **When** the page loads, **Then** a graph renders within two
   seconds from the cached analysis.
2. **Given** the rendered graph, **When** the reviewer opens the answer key, **Then** every
   planted attack event is cited by at least one edge.

---

### User Story 2 - Check the evidence behind any edge (Priority: P1)

The user clicks an edge and sees the exact raw events, quoted verbatim with their IDs, that
justify it.

**Why this priority**: This is where trust comes from. An edge that cannot show its events is
not trustworthy.

**Independent Test**: Click any solid edge. A panel lists one or more events. Each listed event
ID exists in the input and mentions both endpoints of the edge.

**Acceptance Scenarios**:

1. **Given** a solid edge, **When** clicked, **Then** the panel shows every cited event verbatim.
2. **Given** an analysis whose edge cites an event ID not in the input, **When** rendered,
   **Then** that edge is dashed and labeled unverified.
3. **Given** an analysis whose edge cites events that do not involve both endpoints, **When**
   rendered, **Then** that edge is dashed and labeled unverified.

---

### User Story 3 - Intervene and re-analyze (Priority: P1)

The user removes a node (isolate the asset) or an edge (block the connection). The events
behind that node or edge are subtracted from the input, the remaining events are sent to Claude
live, and a new graph renders.

**Why this priority**: This is the idea. Stories 1 and 2 exist to make this one meaningful.

**Independent Test**: Remove the node the attack pivots through. A live analysis runs, a new
graph renders, and the removed node is absent. Remove a node with no attack events. The graph
is substantially unchanged.

**Acceptance Scenarios**:

1. **Given** the rendered graph, **When** the user removes a node, **Then** every event whose
   source or target is that node is removed from the input, and re-analysis runs on the rest.
2. **Given** the rendered graph, **When** the user removes an edge, **Then** the events cited by
   that edge are removed from the input, and re-analysis runs on the rest.
3. **Given** a re-analysis in flight, **When** the user waits, **Then** a visible progress state
   is shown and the previous graph remains on screen.
4. **Given** a re-analysis that fails, **When** the error returns, **Then** a clear message is
   shown and the previous graph is kept.
5. **Given** a completed re-analysis, **When** the new graph renders, **Then** it passes the
   same citation validation as the initial analysis.

---

### User Story 4 - See what changed (Priority: P2)

After re-analysis, the new graph is shown with the difference highlighted: edges that vanished,
edges that survived, edges that appeared.

**Why this priority**: Makes the consequence of the intervention legible at a glance. Cut this
before cutting live re-analysis if time runs out.

**Independent Test**: Remove a node. Vanished edges, surviving edges, and new edges are
visually distinct.

**Acceptance Scenarios**:

1. **Given** a before and after graph, **When** rendered, **Then** the three edge categories
   are visually distinguishable and a legend explains them.

---

### Edge Cases

- The model returns an edge with no citations at all. Rendered dashed, labeled unverified.
- The model returns a node that appears in no event. Node is dropped and logged.
- Removing a node leaves no attack events. Re-analysis should return an empty or near-empty
  chain, and the UI must render that state without error.
- The model returns a different but valid chain for the same input on a second run. Validation
  limits the damage. If distracting, lower temperature and tighten the schema.
- The input after subtraction exceeds the model's context window. Not expected at 500 events;
  guard with a hard cap and a clear error.

---

## Requirements

### Functional Requirements

- **FR-001**: The system MUST bundle one synthetic scenario of approximately 500 events with
  roughly 3 to 5 percent belonging to one planted attack.
- **FR-002**: Every event MUST have an ID, timestamp, source asset, target asset, type, and a
  short detail string. Event types are limited to process start, network connection,
  authentication, and file access.
- **FR-003**: The scenario MUST ship with an answer key listing the planted attack event IDs,
  and the answer key MUST be viewable in the UI.
- **FR-004**: The event generator MUST be implemented as a Claude Code skill checked into the
  repository so the scenario is reproducible.
- **FR-005**: The analysis MUST return a structured chain: nodes, edges, and for each edge the
  list of cited event IDs.
- **FR-006**: The system MUST validate every citation in code: the ID exists in the input and
  the event involves both endpoints of the edge. Failures render dashed and labeled unverified.
- **FR-007**: Clicking an edge MUST display its cited events verbatim.
- **FR-008**: Removing a node MUST subtract every event whose source or target is that node.
  Removing an edge MUST subtract the events it cites. Both MUST use the same re-analysis path.
- **FR-009**: The initial analysis MAY be served from a cached result. Re-analysis after an
  intervention MUST call the model live.
- **FR-010**: The API key MUST live server side. The reviewer MUST NOT need a key.
- **FR-011**: The UI MUST NOT display a confidence score or attack progress number, and MUST
  NOT use the words "secure", "safe", or "contained" in generated or static copy.
- **FR-012**: The prototype MUST be deployed and usable in a browser with no installation.

### Key Entities

- **Event**: One telemetry record. `id`, `timestamp`, `source`, `target`, `type`, `detail`.
- **Asset**: A host, a user, or an external address. Appears as a node. Derived from event
  `source` and `target` fields; kind is derived from the name. The generator guarantees every
  seeded event names two distinct assets, so citation validation can require an event to name
  both endpoints of an edge.
- **Edge**: An attacker action from one asset to another, with `citations` (event IDs) and a
  `verified` flag set by validation, not by the model.
- **Chain**: The set of nodes and edges returned by one analysis over one event set.
- **Intervention**: A named subtraction of events. Kinds: `isolate(asset)` and `block(edge)`.
  Both produce a new event set and trigger re-analysis.
- **Answer Key**: The list of planted attack event IDs emitted by the generator.

---

## Success Criteria

A reviewer with no security background can, in under two minutes:

- **SC-001**: Open the link and see a graph with a handful of nodes instead of 500 rows.
- **SC-002**: Click any edge and see the exact events that justify it.
- **SC-003**: Remove a node and watch the graph rebuild from the remaining evidence, with a
  live model call completing in under thirty seconds.
- **SC-004**: Open the answer key and confirm the attack events are the ones the model cited.
- **SC-005**: Do all of the above without an API key, an install, or a security background.

---

## Out of Scope (deferred, to be named in the rationale)

- Scenario 2 in the UI: a benign lookalike where the correct answer is "no attack". Its data
  is already generated; only the scenario switcher is deferred, as an optional task after the
  cut line.
- Any confidence, risk, or attack-progress score.
- Streaming events in over time so the graph visibly evolves.
- Narrative or report generation.
- Agent loop with tools such as event query or technique lookup.
- Adding hypothetical events, the inverse of deletion.
- MITRE ATT&CK technique labeling and an inline glossary.
- Multi-scenario comparison.

---

## Time Plan (3 to 4 hours)

| Block | Time | Output |
|---|---|---|
| Generator skill, one scenario, answer key | 45 min | `events.json`, `answer_key.json` |
| Analysis call with structured output, citation validation, cached result | 45 min | analyze and validate |
| Graph rendering, edge click to evidence panel | 60 min | Working UI on cached data |
| Intervention, live re-analysis, diff rendering | 45 min | Hero loop end to end |
| Deploy, record video, write rationale | 45 min | Submission |

If the intervention block runs over, cut diff highlighting (Story 4) before cutting live
re-analysis (Story 3).

---

## Decisions

Resolved in [plan.md](plan.md). Summary: Vercel hosting, which rules out the Java scaffold;
Python FastAPI serverless function for the API; Vite + React + React Flow with dagre
left-to-right layout; Claude Sonnet 5 with structured output; diff shown as an overlay on one
graph; Vitest for TypeScript logic plus a minimal pytest set for the server; working name Sever.

---

## Risks

- **Overlap with prior employment**: no employer code, prompts, schemas, or data. Everything
  is written fresh. State the delta on video.
- **Live re-analysis latency**: a 500-event prompt is roughly 25k tokens. Expect several seconds.
  Show progress.
- **Model inconsistency across runs**: validation limits the damage. Lower temperature and
  tighten the schema if it distracts.
- **Scope creep**: the Out of Scope list is the defense.

---

## Rationale Talking Points

- Why Theme 1: the artifact being understood is an incident, and the tool turns 500 events
  into one picture.
- What is non-obvious: acting on the graph and re-analyzing, not the graph.
- Tradeoff: cached first analysis for reliability, live re-analysis because the idea demands it.
- Tradeoff: no score. A number implies precision the model cannot honestly claim.
- How AI was used: Claude Code skill for data generation, Claude API with structured output
  for analysis, Claude Code for the build. Transcripts show direction and overrides.
- With more time: scenario 2, streaming, agent tools, report.
- Time spent: to be filled in.
