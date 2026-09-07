# Statement of Purpose

**Project working name:** Sever (alternatives: ChainSight, Untangle). Final name is a design-phase decision.
**Author:** Kavya Kambi
**Submission:** Anthropic SWE take-home, Theme 1 (Exploration & Understanding)
**Time budget:** 3 to 4 hours of build time

---

## 1. Problem

A security incident produces hundreds of telemetry events. An expert analyst scrolls through them, discards the noise, keeps the handful that matter, and builds a mental model of the attack chain in their head. A new entrant to the field cannot do this. Even the expert cannot do it fast under pressure, and they cannot show their mental model to anyone else.

AI can do the piecing together. But a CSO will not act on a picture that was built entirely by a model with no way to check it. The problem is not "build an attack graph with AI." The problem is "build one that a novice can read and a CSO can trust."

## 2. Purpose

Build a browser tool that takes a raw stream of security events, has Claude assemble them into an attack chain drawn as a graph, and then lets the user intervene on that graph and see the chain re-analyzed from the remaining evidence.

The tool exists to answer two questions for a non-expert:

1. **What happened?** Five hundred events become one picture with a handful of assets and the actions between them.
2. **What if I take this out?** Remove an asset or cut a connection, and Claude rebuilds the chain from what is left. The user sees what the intervention actually changes.

## 3. Thesis: why this is not just another attack graph

AI-generated attack graphs exist. Security copilots that narrate incidents exist. What does not exist for a novice is a way to interrogate the graph by acting on it.

The novel element is **counterfactual re-analysis**. Every intervention the user can make, whether isolating a host or cutting an edge, is implemented as one operation: subtract a set of events and re-run the analysis. This gives the user a hands-on way to build confidence. If they remove the event that justifies an edge and the edge disappears, the model was grounded. If they isolate the file server and the chain survives through stolen credentials, they have learned something an expert would know and they would not.

The delta from prior work, stated in one sentence for the video: *I have built attack graphs that explain the past. This one lets you act on the graph and see what the evidence still supports.*

## 4. Users

| User | What they cannot do today | What the tool gives them |
|---|---|---|
| Novice (new entrant, high school grad) | Read 500 events and find the attack | A graph with a few nodes, each edge clickable to the raw events behind it |
| Expert analyst | Show their mental model, test containment ideas quickly | Same graph, plus intervention and re-analysis in seconds |
| CSO / decision maker | Trust an AI-built picture | Evidence behind every edge, and the ability to poke it and watch it hold or break |

Design for the novice. The expert path is the same interface used faster.

## 5. Core interaction (the hero loop)

1. **Load a scenario.** A bundled set of roughly 500 synthetic events, mostly noise, with one planted attack.
2. **See the chain.** Claude's analysis, cached for the demo, renders as a graph. Nodes are assets (hosts, users, external IPs). Edges are attacker actions between them.
3. **Click an edge.** A panel shows the raw events that justify that edge, quoted verbatim with their IDs.
4. **Intervene.** The user removes a node (isolate the asset) or an edge (block the connection). Both map to "remove these events."
5. **Re-analyze live.** The remaining events go to Claude. A new graph is generated and rendered.
6. **Compare.** The new graph is shown with the difference highlighted: edges that vanished, edges that survived, edges that appeared.

No scoring. The graph and its diff are the output.

## 6. Trust principles

These are design commitments, not features to add later.

- **Every edge cites events.** The model must return event IDs for each edge. An edge with no citation is not drawn as solid.
- **Citations are validated in code.** After each analysis, deterministic code checks that every cited event ID exists in the input and that the cited events actually involve the two nodes the edge connects. Failures are drawn dashed and labeled unverified. This is the hallucination guard.
- **Honest wording.** The tool never says "secure." It says what the remaining evidence supports.
- **Interventions are real re-analysis, not cosmetic.** Deleting an event genuinely re-runs the model on the remaining set. The user is not watching a canned animation.

## 7. Data and demo mode

- **Generator:** A Claude Code skill that produces the event set. This is a deliberate choice: the job description lists building skills for Claude Code as a plus, and it keeps the generator reproducible and in the repo.
- **Shape of the data:** About 500 events, roughly 5 percent belonging to the attack. Event types kept to a small set so the story is legible: process start, network connection, authentication, file access. One shared schema with an event ID, timestamp, source asset, target asset, type, and a short detail string.
- **Ground truth:** The generator emits an answer key listing which events form the attack. The answer key is available in the UI so a non-security reviewer can check the graph against it.
- **Demo mode:** The initial analysis is cached at build time so the first screen is instant and never fails. Re-analysis after an intervention calls the Claude API live from a backend that holds the key. If the live call fails, the UI shows a clear error and keeps the previous graph. The reviewer never needs a key.

## 8. Scope

### In scope for 3 to 4 hours

- One scenario with one planted attack
- Cached initial analysis and rendered graph
- Click an edge to see cited raw events
- Remove a node or edge, live re-analysis, new graph with diff highlighting
- Citation validation with dashed edges for unverified claims
- Answer key visible to the reviewer
- Deployed, browser-accessible, no installation

### Explicitly deferred, to be named in the rationale

- Scenario 2: a benign lookalike where the correct answer is "no attack"
- Any confidence or attack-progress score
- Streaming events in over time to show the graph evolving
- Narrative report generation
- Agent loop with tools such as event query and technique lookup
- Adding hypothetical events, the inverse of deletion
- MITRE ATT&CK technique labeling and inline glossary
- Multi-scenario comparison

## 9. Time plan

| Block | Time | Output |
|---|---|---|
| Data generator skill and one scenario with answer key | 45 min | events.json, answer_key.json |
| Analysis prompt with structured output, citation validation, cached result | 45 min | analyze() and validate() |
| Graph rendering, edge click to evidence panel | 60 min | Working UI on cached data |
| Intervention: remove node or edge, live re-analysis, diff rendering | 45 min | The hero loop end to end |
| Deploy, record video, write rationale | 45 min | Submission |

If the intervention block runs over, cut diff highlighting before cutting live re-analysis. Live re-analysis is the idea. Diff highlighting is polish.

## 10. Success criteria for the reviewer

A reviewer with no security background should be able to, in under two minutes:

1. Open the link and see a graph with a handful of nodes instead of 500 rows.
2. Click any edge and see the exact events that justify it.
3. Remove a node and watch the graph rebuild from the remaining evidence.
4. Check the graph against the answer key and see that the attack events are the ones the model used.

## 11. Open decisions for the design phase

- Stack: TypeScript and React front end with a thin Node or Python backend is the default. Confirm.
- Graph layout: force-directed versus left-to-right by time. Left-to-right by time is easier for a novice to read.
- Hosting: Vercel, Fly, or Cloudflare. The key must live server side.
- Model and structured output schema for the analysis call.
- What the diff view looks like: overlay on one graph, or before and after side by side.
- Final name.

## 12. Risks

- **Overlap with prior employment.** No employer code, prompts, schemas, or data. The generator, prompt, and UI are written fresh for this submission. State the delta on video.
- **Live re-analysis latency.** A 500-event prompt is roughly 25k tokens. Expect several seconds per call. Show a visible progress state.
- **Model inconsistency across runs.** Two runs on the same events may produce slightly different graphs. Citation validation limits the damage. If it becomes distracting, lower temperature and constrain the schema.
- **Scope creep.** The deferred list above is the defense. Anything not in section 8 waits for the rationale's "with more time" section.

## 13. Talking points for the video and written rationale

- Why Theme 1: the artifact being understood is an incident, and the tool turns 500 events into one picture.
- What is non-obvious: acting on the graph and re-analyzing, not the graph itself.
- Key tradeoff: cached first analysis for reliability, live re-analysis because the idea requires it.
- Key tradeoff: no score. A number implies precision the model cannot honestly claim. The graph and its evidence are the output.
- How AI was used: Claude Code skill for data generation, Claude API with structured output for analysis, Claude Code for the build. Transcripts show the direction and the overrides.
- With more time: scenario 2 benign lookalike, streaming, agent tools, report.
- Time spent: to be filled in.
