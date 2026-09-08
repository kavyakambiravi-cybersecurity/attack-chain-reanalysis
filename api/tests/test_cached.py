"""The committed first analyses, when they exist.

attack-chain-01 is produced by backend task T012 and benign-lookalike-02 by the optional
T028. Each is skipped until its file has been generated with a real key. The frontend has
the matching tests in tests/cached-analysis.test.ts.
"""

from __future__ import annotations

import json

import pytest

from api.analysis import PROMPT_VERSION, AnalyzeResponse
from api.scenario import load
from api.tests.helpers import DATA_DIR

SCENARIOS = ["attack-chain-01", "benign-lookalike-02"]


@pytest.fixture(params=SCENARIOS)
def scenario_id(request) -> str:
    path = DATA_DIR / request.param / "analysis.json"
    if not path.is_file():
        pytest.skip(f"analysis.json not generated yet for {request.param}")
    return request.param


@pytest.fixture
def cached(scenario_id: str) -> AnalyzeResponse:
    path = DATA_DIR / scenario_id / "analysis.json"
    return AnalyzeResponse.model_validate(json.loads(path.read_text(encoding="utf-8")))


def test_cached_file_is_an_analyze_response(cached, scenario_id):
    assert cached.scenario_id == scenario_id
    assert cached.removed_event_ids == []


def test_prompt_version_matches(cached, scenario_id):
    assert cached.prompt_version == PROMPT_VERSION, (
        "the cached analysis was made with a different prompt: "
        f"rerun scripts/analyze.py {scenario_id}"
    )


def test_every_citation_is_a_real_event_id(cached, scenario_id):
    known = {event["id"] for event in load(scenario_id)}
    cited = {event_id for edge in cached.edges for event_id in edge.citations}
    assert cited <= known


def test_benign_scenario_draws_no_chain():
    """T028's gate: the switcher ships only if the benign run drew no confident chain."""
    path = DATA_DIR / "benign-lookalike-02" / "analysis.json"
    if not path.is_file():
        pytest.skip("analysis.json not generated yet for benign-lookalike-02")
    cached = AnalyzeResponse.model_validate(json.loads(path.read_text(encoding="utf-8")))
    assert cached.edges == []
    assert cached.nodes == []
    assert "not show a connected attack" in cached.summary
