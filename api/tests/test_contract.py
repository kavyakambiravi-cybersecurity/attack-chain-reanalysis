"""The wire contract, server side. Reads the frozen examples in specs/.../contract/."""

from __future__ import annotations

from typing import get_args

import pytest

from api.analysis import (
    AnalyzeRequest,
    AnalyzeResponse,
    ErrorCode,
    ErrorResponse,
    HealthResponse,
)
from api.index import STATUS_FOR_ERROR
from api.tests.helpers import CONTRACT_DIR, FakeResponse, contract


def test_contract_dir_is_present():
    assert CONTRACT_DIR.is_dir()
    assert (CONTRACT_DIR / "analyze_request.json").is_file()


def test_request_example_validates():
    example = contract("analyze_request.json")
    request = AnalyzeRequest.model_validate(example)
    assert request.scenario_id == example["scenario_id"]
    assert request.removed_event_ids == example["removed_event_ids"]


def test_response_example_validates_with_the_same_top_level_keys():
    example = contract("analyze_response.json")
    response = AnalyzeResponse.model_validate(example)
    assert set(response.model_dump().keys()) == set(example.keys())
    assert response.model_dump() == example


def test_error_example_with_ids_validates():
    example = contract("error_unknown_event_ids.json")
    err = ErrorResponse.model_validate(example)
    assert err.error == "unknown_event_ids"
    assert err.ids == example["ids"]
    assert err.model_dump(exclude_none=True) == example


def test_error_example_without_ids_dumps_without_an_ids_key():
    example = contract("error_not_configured.json")
    err = ErrorResponse.model_validate(example)
    assert err.ids is None
    assert "ids" not in err.model_dump(exclude_none=True)
    assert err.model_dump(exclude_none=True) == example


@pytest.mark.parametrize("name", ["health_live.json", "health_offline.json"])
def test_health_examples_validate(name: str):
    example = contract(name)
    health = HealthResponse.model_validate(example)
    assert health.model_dump() == example
    assert health.ok is True
    assert health.model == "claude-sonnet-5"


def test_every_error_code_has_a_status_and_nothing_else():
    assert set(STATUS_FOR_ERROR) == set(get_args(ErrorCode))
    assert len(STATUS_FOR_ERROR) == 9
    assert STATUS_FOR_ERROR == {
        "bad_request": 400,
        "unknown_scenario": 404,
        "unknown_event_ids": 400,
        "too_many_removed": 400,
        "rate_limited": 429,
        "not_configured": 503,
        "model_refused": 502,
        "model_error": 502,
        "internal": 500,
    }


def test_unknown_request_fields_are_ignored():
    example = contract("analyze_request.json") | {"foo": "bar", "events": [1, 2, 3]}
    request = AnalyzeRequest.model_validate(example)
    assert not hasattr(request, "foo")
    assert set(request.model_dump()) == {"scenario_id", "removed_event_ids"}


def test_unknown_request_fields_are_ignored_by_the_endpoint(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    body = contract("analyze_request.json") | {"foo": "bar"}
    response = client.post("/api/analyze", json=body)
    assert response.status_code == 200, response.text
    assert len(fake.calls) == 1
