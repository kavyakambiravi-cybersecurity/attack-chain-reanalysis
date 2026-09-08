"""Bundled scenario loading and the intervention subtraction.

The client never sends events, only the ids it wants removed. The server owns the
scenario data, so this module is the only place a scenario is read from disk and the
only place removed ids are validated.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

Event = dict[str, Any]

MAX_REMOVED = 200

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "scenarios"

_SCENARIO_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


class UnknownScenario(Exception):
    """No bundled scenario has this id."""

    def __init__(self, scenario_id: str) -> None:
        self.scenario_id = scenario_id
        super().__init__(f"unknown scenario: {scenario_id!r}")


class UnknownEventIds(Exception):
    """One or more removed ids are not in the scenario."""

    def __init__(self, ids: list[str]) -> None:
        self.ids = list(ids)
        super().__init__(f"unknown event ids: {self.ids}")


class TooManyRemoved(Exception):
    """More than MAX_REMOVED ids after deduplication."""

    def __init__(self, count: int | None = None) -> None:
        self.count = count
        self.max_removed = MAX_REMOVED
        super().__init__(f"too many removed ids: {count} > {MAX_REMOVED}")


@lru_cache(maxsize=8)
def _read(scenario_id: str) -> tuple[Event, ...]:
    path = DATA_DIR / scenario_id / "events.json"
    if not path.is_file():
        raise UnknownScenario(scenario_id)
    with path.open(encoding="utf-8") as handle:
        events = json.load(handle)
    if not isinstance(events, list):
        raise UnknownScenario(scenario_id)
    return tuple(events)


def load(scenario_id: str) -> list[Event]:
    """Return every event of a bundled scenario, in the file's timestamp order.

    Raises UnknownScenario for an id that is not a bundled scenario. The id is matched
    against a strict pattern first so it can never walk out of the data directory.
    """
    if not isinstance(scenario_id, str) or not _SCENARIO_ID.match(scenario_id):
        raise UnknownScenario(scenario_id)
    return [dict(event) for event in _read(scenario_id)]


def dedupe(ids: list[str]) -> list[str]:
    """Drop repeats, keeping the order in which each id was first seen."""
    seen: set[str] = set()
    out: list[str] = []
    for event_id in ids:
        if event_id not in seen:
            seen.add(event_id)
            out.append(event_id)
    return out


def subtract(events: list[Event], ids: list[str]) -> list[Event]:
    """Return the events that remain after removing `ids`.

    Checks run in the order the wire contract fixes: deduplicate, then reject ids that
    are not in the scenario, then reject more than MAX_REMOVED of them.
    """
    removed = dedupe(ids)

    known = {event["id"] for event in events}
    unknown = [event_id for event_id in removed if event_id not in known]
    if unknown:
        raise UnknownEventIds(unknown)

    if len(removed) > MAX_REMOVED:
        raise TooManyRemoved(len(removed))

    drop = set(removed)
    return [event for event in events if event["id"] not in drop]
