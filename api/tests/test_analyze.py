"""POST /api/analyze, GET /api/health, and the prompt rendering.

Every row asserts the body validates as AnalyzeResponse (2xx) or ErrorResponse (non-2xx)
and that the Content-Type is application/json. The model is never called: the Anthropic
client is replaced through `api.analysis.client`.
"""

from __future__ import annotations

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from api import analysis, index
from api.analysis import PROMPT_VERSION, AnalyzeResponse, ErrorResponse, render_events
from api.index import STATUS_FOR_ERROR
from api.scenario import load
from api.tests.helpers import FakeResponse, contract

SCENARIO = "attack-chain-01"


def ok(response: httpx.Response) -> dict:
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    AnalyzeResponse.model_validate(body)
    return body


def failed(response: httpx.Response, code: str) -> dict:
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    error = ErrorResponse.model_validate(body)
    assert error.error == code, body
    assert response.status_code == STATUS_FOR_ERROR[code], body
    assert body["detail"] and body["detail"][-1] in ".!"
    assert set(body) <= {"error", "detail", "ids"}
    return body


def _sdk_error() -> anthropic.APIStatusError:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.APIStatusError(
        "boom", response=httpx.Response(500, request=request), body=None
    )


def _timeout() -> anthropic.APITimeoutError:
    return anthropic.APITimeoutError(
        request=httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    )


# --- Happy path -------------------------------------------------------------------


def test_happy_path_echoes_deduped_ids_and_prompt_version(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    request = contract("analyze_request.json")
    body = ok(client.post("/api/analyze", json=request))

    assert body["scenario_id"] == SCENARIO
    assert body["removed_event_ids"] == ["E-0115", "E-0117"]  # deduped, first seen order
    assert body["prompt_version"] == PROMPT_VERSION
    assert body["nodes"] == contract("analyze_response.json")["nodes"]
    assert len(fake.calls) == 1

    call = fake.calls[0]
    assert call["model"] == "claude-sonnet-5"
    assert call["thinking"] == {"type": "adaptive"}
    assert call["output_config"] == {"effort": "medium"}
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert call["system"][0]["text"] == analysis.SYSTEM_PROMPT
    assert call["output_format"] is analysis.ChainOutput

    sent = call["messages"][0]["content"]
    assert "E-0115" not in sent and "E-0117" not in sent
    assert len(sent.splitlines()) == 2 + 498  # header, blank line, 498 event lines


def test_empty_removal_sends_all_500_events(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    body = ok(client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}))
    assert body["removed_event_ids"] == []
    sent = fake.calls[0]["messages"][0]["content"]
    assert sent.startswith("Events: 500 of the day's telemetry records, in time order.")
    assert sent.count("E-0500 | ") == 1


# --- Rejections that never reach the model ----------------------------------------


def test_malformed_body(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    failed(client.post("/api/analyze", json={"scenario": "x"}), "bad_request")
    assert fake.calls == []


def test_missing_removed_event_ids(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    failed(client.post("/api/analyze", json={"scenario_id": SCENARIO}), "bad_request")
    assert fake.calls == []


def test_non_json_body(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    response = client.post(
        "/api/analyze",
        content="not json at all",
        headers={"content-type": "application/json"},
    )
    failed(response, "bad_request")
    assert fake.calls == []


def test_unknown_scenario(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    body = failed(
        client.post("/api/analyze", json={"scenario_id": "nope", "removed_event_ids": []}),
        "unknown_scenario",
    )
    assert body["detail"] == "No scenario named nope."
    assert fake.calls == []


def test_unknown_event_ids(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    body = failed(
        client.post(
            "/api/analyze",
            json={"scenario_id": SCENARIO, "removed_event_ids": ["E-9999", "E-0001", "E-0000"]},
        ),
        "unknown_event_ids",
    )
    assert body["ids"] == ["E-9999", "E-0000"]
    assert body["detail"] == "2 event ids are not in this scenario."
    assert fake.calls == []


def test_too_many_removed(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    ids = [event["id"] for event in load(SCENARIO)][:201]
    body = failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": ids}),
        "too_many_removed",
    )
    assert body["detail"] == "At most 200 events can be removed."
    assert fake.calls == []


def test_rate_limited_on_the_eleventh_call(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain))
    request = {"scenario_id": SCENARIO, "removed_event_ids": []}
    for _ in range(10):
        ok(client.post("/api/analyze", json=request))
    failed(client.post("/api/analyze", json=request), "rate_limited")
    assert len(fake.calls) == 10


def test_no_key(client, fake_model, chain):
    fake = fake_model(FakeResponse(chain), key=None)
    body = failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}),
        "not_configured",
    )
    assert body == contract("error_not_configured.json")
    assert fake.calls == []


# --- Model failures ---------------------------------------------------------------


def test_refusal(client, fake_model):
    fake_model(FakeResponse(None, stop_reason="refusal", stop_details={"type": "refusal"}))
    failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}),
        "model_refused",
    )


def test_sdk_error(client, fake_model):
    fake_model(_sdk_error())
    failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}),
        "model_error",
    )


def test_timeout(client, fake_model):
    fake_model(_timeout())
    failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}),
        "model_error",
    )


def test_unparseable_output(client, fake_model):
    fake_model(FakeResponse(None))
    failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}),
        "model_error",
    )


def test_unexpected_exception_is_internal(client, fake_model):
    fake_model(RuntimeError("something else entirely"))
    failed(
        client.post("/api/analyze", json={"scenario_id": SCENARIO, "removed_event_ids": []}),
        "internal",
    )


# --- Health -----------------------------------------------------------------------


def test_health_with_key(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == contract("health_live.json")


def test_health_without_key_never_builds_a_client(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == contract("health_offline.json")
    assert analysis.client is None


# --- Prompt rendering -------------------------------------------------------------


def test_render_events_is_stable():
    events = load(SCENARIO)
    assert render_events(events) == render_events(events)


def test_render_events_keeps_parenthesised_labels():
    events = [event for event in load(SCENARIO) if "(" in event["target"]]
    assert events
    line = render_events(events[:1]).splitlines()[2]
    assert events[0]["target"] in line
    assert line.startswith(f"{events[0]['id']} | {events[0]['timestamp']} | ")


def test_render_events_never_mentions_removals():
    events = load(SCENARIO)
    removed = [event["id"] for event in events[:14]]
    remaining = [event for event in events if event["id"] not in set(removed)]
    text = render_events(remaining)
    assert len(remaining) == 486
    assert text.startswith("Events: 486 of the day's telemetry records, in time order.")
    for event_id in removed:
        assert event_id not in text
    lowered = text.lower()
    assert "removed" not in lowered
    assert "re-analy" not in lowered
