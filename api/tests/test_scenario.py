"""Scenario loading and the subtraction that every intervention goes through."""

from __future__ import annotations

import pytest

from api.scenario import (
    MAX_REMOVED,
    TooManyRemoved,
    UnknownEventIds,
    UnknownScenario,
    dedupe,
    load,
    subtract,
)


@pytest.fixture
def events() -> list[dict]:
    return load("attack-chain-01")


def test_load_known_scenario(events):
    assert len(events) == 500
    assert events[0]["id"] == "E-0001"
    assert set(events[0]) == {"id", "timestamp", "source", "target", "type", "detail"}


def test_load_unknown_scenario():
    with pytest.raises(UnknownScenario):
        load("nope")


@pytest.mark.parametrize("scenario_id", ["", "../data", "attack-chain-01/../..", "ATTACK"])
def test_load_rejects_ids_that_are_not_bundled_scenarios(scenario_id):
    with pytest.raises(UnknownScenario):
        load(scenario_id)


def test_subtract_removes_exactly_the_ids(events):
    remaining = subtract(events, ["E-0001", "E-0002"])
    assert len(remaining) == len(events) - 2
    remaining_ids = {event["id"] for event in remaining}
    assert "E-0001" not in remaining_ids
    assert "E-0002" not in remaining_ids


def test_subtract_does_not_mutate_its_input(events):
    before = len(events)
    subtract(events, ["E-0001"])
    assert len(events) == before


def test_unknown_ids_rejected(events):
    with pytest.raises(UnknownEventIds) as excinfo:
        subtract(events, ["E-9999"])
    assert excinfo.value.ids == ["E-9999"]


def test_unknown_ids_are_reported_deduplicated_in_order(events):
    with pytest.raises(UnknownEventIds) as excinfo:
        subtract(events, ["E-9999", "E-0001", "E-0000", "E-9999"])
    assert excinfo.value.ids == ["E-9999", "E-0000"]


def test_duplicates_deduped_order_kept():
    assert dedupe(["E-0002", "E-0001", "E-0002"]) == ["E-0002", "E-0001"]
    assert dedupe([]) == []


def test_too_many_rejected(events):
    ids = [event["id"] for event in events]
    assert MAX_REMOVED == 200
    with pytest.raises(TooManyRemoved):
        subtract(events, ids[: MAX_REMOVED + 1])
    remaining = subtract(events, ids[:MAX_REMOVED])
    assert len(remaining) == len(events) - MAX_REMOVED


def test_duplicates_do_not_count_towards_the_limit(events):
    ids = [event["id"] for event in events][:MAX_REMOVED]
    assert len(subtract(events, ids + ids)) == len(events) - MAX_REMOVED


def test_empty_removal_allowed(events):
    assert len(subtract(events, [])) == 500
