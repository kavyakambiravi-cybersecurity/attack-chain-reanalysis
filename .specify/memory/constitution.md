# Sever Constitution

<!-- Working name. Alternatives: ChainSight, Untangle. Final name is a design decision. -->

## Core Principles

### I. Evidence Before Conclusions
Every edge in an attack chain MUST cite the raw event IDs that justify it. Code, not the model,
validates that every cited event exists in the input and involves the two nodes the edge
connects. An edge that fails validation is rendered dashed and labeled unverified. A claim
without evidence is never drawn as fact.

### II. One Mechanism for Every Intervention
Isolating a host and cutting a connection are the same operation: subtract a set of events and
re-run the analysis. There is one code path for intervention. New intervention types are added
by defining which events they remove, never by adding a second analysis path.

### III. Real Re-analysis, Never Cosmetic
When the user intervenes, the remaining events go to the model and a new chain comes back.
The tool never animates a precomputed answer while pretending to think. The initial analysis
MAY be cached for demo reliability; re-analysis after intervention MUST be live.

### IV. Honest Wording
The tool never says "secure", "safe", or "contained". It says what the remaining evidence
supports and what it no longer supports. No confidence score or progress percentage is shown;
a number implies precision the model cannot honestly claim.

### V. Design for the Novice
The primary user is a new entrant to security. The expert uses the same interface faster.
There is no expert mode. Any screen must be readable by someone who does not know what
lateral movement is.

### VI. Scope Discipline
Target build time is 3 to 4 hours. Anything not in the active feature spec's "In Scope" list
waits for the "with more time" section of the rationale. When the intervention block runs over,
cut diff highlighting before cutting live re-analysis.

### VII. Clean Provenance
No employer code, prompts, schemas, or data. The event generator, analysis prompt, validation,
and UI are written fresh for this submission. The delta from prior professional work is stated
explicitly in the rationale.

## Evaluation Constraints

- Deployed and usable in a browser with no installation, key, or domain knowledge.
- Bundled synthetic scenario with a visible answer key so a non-security reviewer can check the graph.
- AI transcripts, a short written rationale, and a roughly five minute video are part of the deliverable.
- Approximate time spent is recorded in the rationale.

## Governance

This constitution supersedes convenience. A feature spec that conflicts with a principle must
either amend the principle here, with a one-line reason, or drop the feature. Amendments are
committed with the spec that motivated them.

**Version**: 1.0.0 | **Ratified**: 2026-09-07 | **Last Amended**: 2026-09-07
