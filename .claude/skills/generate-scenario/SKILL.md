---
name: generate-scenario
description: Generate the synthetic security-telemetry scenario for Attack Chain Reanalysis — ~500 events with one planted attack chain plus an answer key. Use when creating, regenerating, or tuning the bundled incident data (events.json / answer_key.json).
---

# generate-scenario

Produces the bundled incidents for the attack-chain re-analysis prototype:
deterministic sets of ~500 telemetry events, mostly benign noise, seeded with a
small set of interesting events, each with a matching answer key.

## Scenarios

| # | id | correct answer | seeded events |
|---|---|---|---|
| 1 | `attack-chain-01` | one attack chain | 16 planted attack events forming a coherent intrusion |
| 2 | `benign-lookalike-02` | no attack | 16 lookalike events that resemble techniques but are individually benign and do not chain |

## Run

```bash
python3 .claude/skills/generate-scenario/generate.py               # scenario 1 (default)
python3 .claude/skills/generate-scenario/generate.py --scenario 2  # scenario 2
```

Each run writes two files into `data/scenarios/<scenario-id>/`:

- `events.json` — the full event stream (this is the model's input).
- `answer_key.json` — the correct answer for a non-security reviewer to check against.

Pass `--out DIR` to write elsewhere. Output is byte-identical on every run
(each scenario has its own fixed seed), so regeneration never changes an answer
key unless the code changes.

## Answer-key shape

Both keys share a common head: `scenario_id`, `scenario_name`, `scenario_type`
(`attack` | `benign`), `correct_answer`, `total_events`, `attack_event_ids`.

- Scenario 1 also carries `assets_involved` and a `chain_summary`.
- Scenario 2 has an empty `attack_event_ids` and instead carries
  `lookalike_event_ids` plus a `lookalikes` array, where each entry has a
  `why_benign` explanation. A correct analysis of scenario 2 draws no connected
  attack chain (at most dashed, unverified fragments).

## Event schema

Each event has exactly these fields (FR-002):

| field | meaning |
|---|---|
| `id` | `E-0001` … assigned in timestamp order after merge |
| `timestamp` | ISO-8601 UTC, e.g. `2026-09-05T09:14:00Z` |
| `source` | originating asset (user, host, or external IP) |
| `target` | destination asset |
| `type` | one of `process_start`, `network_connection`, `authentication`, `file_access` |
| `detail` | short human-readable description |

## Invariants the generator guarantees

These exist so the downstream analysis and citation validation can rely on them:

1. **Every seeded event names two distinct assets** (`source != target`), so any
   edge that cites it can pass the "event involves both endpoints" check.
2. **Scenario-1 attacker IPs (`203.0.113.47`, `198.51.100.22`) never appear in
   noise, and never appear in scenario 2 at all.** The attack cannot be found by
   IP alone, and the benign scenario has no attacker infrastructure.
3. **Attack hosts and users are reused in benign events** (WKSTN-042, FILESRV-01,
   DC-01, jsmith, administrator all appear in noise), so a scenario cannot be
   solved by asset name — the analysis has to use the relationships.
4. **IDs are scattered.** Seeded events are interleaved with noise by timestamp,
   so their IDs are non-contiguous.
5. **Scenario 2's lookalikes share no pivot.** They are spread across unrelated
   hosts, users, and times, with no credential theft feeding a lateral move and
   no exfil edge, so no coherent intrusion can be assembled from them.

## Tuning

Edit the constants at the top of `generate.py`:

- `TOTAL_EVENTS` — total event count (default 500).
- `SEED` — change to get a different but still-reproducible noise mix.
- `build_attack_chain()` — the planted chain, step by step. Keep every step
  spanning two distinct assets.

After any change, re-run and confirm the printed attack IDs match what the app
and rationale expect.
