#!/usr/bin/env python3
"""Produce the cached first analysis for a bundled scenario.

    ANTHROPIC_API_KEY=... python scripts/analyze.py attack-chain-01

Runs the same `api.analysis.analyze` the live endpoint runs, over the full event set,
and writes `data/scenarios/<id>/analysis.json`. Because it is the same function with the
same prompt, the cached first screen and a live re-analysis cannot drift.

This is the only step in the project that calls the model. It then prints a review of the
chain so the result can be checked by hand before it is committed: which citations exist,
whether each cited event really names the edge's two endpoints, how much of the answer key
the chain covers, and whether any banned word slipped in.

Exit codes: 0 written, 2 bad usage or no key, 3 the model call failed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.analysis import (  # noqa: E402
    PROMPT_VERSION,
    AnalyzeResponse,
    ModelError,
    ModelRefused,
    analyze,
    build_response,
)
from api.scenario import DATA_DIR, UnknownScenario, load  # noqa: E402

BANNED_WORDS = ("secure", "safe", "contained")


def review(response: AnalyzeResponse, events: list[dict], answer_key: dict | None) -> None:
    """Print everything a human needs to accept or reject this chain."""
    by_id = {event["id"]: event for event in events}

    print(f"\nscenario_id     {response.scenario_id}")
    print(f"prompt_version  {response.prompt_version}")
    print(f"events analysed {len(events)}")
    print(f"\nsummary\n  {response.summary}")

    print(f"\nnodes ({len(response.nodes)})")
    for node in response.nodes:
        seen = any(node.id in (event["source"], event["target"]) for event in events)
        print(f"  {'ok ' if seen else 'NOT IN EVENTS'} {node.id}  ({node.label})")

    print(f"\nedges ({len(response.edges)})")
    for edge in response.edges:
        print(f"  {edge.source} -> {edge.target}  [{edge.action}]")
        print(f"    {edge.description}")
        if not edge.citations:
            print("    NO CITATIONS")
        for event_id in edge.citations:
            event = by_id.get(event_id)
            if event is None:
                print(f"    {event_id}  DOES NOT EXIST")
                continue
            endpoints = {event["source"], event["target"]}
            match = endpoints == {edge.source, edge.target}
            flag = "ok " if match else "ENDPOINTS DO NOT MATCH"
            print(f"    {event_id}  {flag}  {event['source']} -> {event['target']}")

    cited = {event_id for edge in response.edges for event_id in edge.citations}
    if answer_key:
        attack_ids = answer_key.get("attack_event_ids") or []
        if attack_ids:
            hit = sorted(cited & set(attack_ids))
            print(f"\nanswer key      {len(hit)} of {len(attack_ids)} attack events cited")
            print(f"  cited    {hit}")
            print(f"  missed   {sorted(set(attack_ids) - cited)}")
        noise = sorted(cited - set(attack_ids))
        if noise:
            print(f"  cited but not in attack_event_ids: {noise}")

    text = " ".join(
        [response.summary] + [f"{edge.action} {edge.description}" for edge in response.edges]
    ).lower()
    found = [word for word in BANNED_WORDS if re.search(rf"\b{word}\b", text)]
    print(f"\nbanned words    {found if found else 'none'}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="scripts/analyze.py",
        description="Run the analysis over a whole bundled scenario and cache the result.",
    )
    parser.add_argument("scenario_id", help="for example attack-chain-01")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="where to write (default data/scenarios/<scenario-id>/analysis.json)",
    )
    args = parser.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "ANTHROPIC_API_KEY is not set. This script is the only step that calls the\n"
            "model, so it needs a key in the environment. Export one and run again:\n"
            f"  ANTHROPIC_API_KEY=sk-... python scripts/analyze.py {args.scenario_id}",
            file=sys.stderr,
        )
        return 2

    try:
        events = load(args.scenario_id)
    except UnknownScenario:
        bundled = sorted(path.name for path in DATA_DIR.iterdir() if path.is_dir())
        print(
            f"No bundled scenario named {args.scenario_id!r}. Bundled: {', '.join(bundled)}",
            file=sys.stderr,
        )
        return 2

    print(
        f"Analysing {args.scenario_id}: {len(events)} events, "
        f"prompt version {PROMPT_VERSION}. This takes 8 to 25 seconds.",
        file=sys.stderr,
    )

    try:
        chain = analyze(events)
    except ModelRefused as exc:
        print(f"The model declined to analyse these events: {exc}", file=sys.stderr)
        return 3
    except ModelError as exc:
        print(f"The model call failed or timed out: {exc}", file=sys.stderr)
        return 3

    response = build_response(chain, args.scenario_id, [])

    out = args.out or (DATA_DIR / args.scenario_id / "analysis.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(response.model_dump(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    review(response, events, _answer_key(args.scenario_id))
    print(f"\nwrote {out}")
    print("Check the edges above against the scenario table in plan.md before committing.")
    return 0


def _answer_key(scenario_id: str) -> dict | None:
    path = DATA_DIR / scenario_id / "answer_key.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    raise SystemExit(main())
