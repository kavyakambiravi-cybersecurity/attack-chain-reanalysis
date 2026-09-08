"""The committed first analysis, when it exists.

Skipped until backend task T012 has been run with a real key. The frontend has the
matching test in tests/cached-analysis.test.ts.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from api.analysis import PROMPT_VERSION, AnalyzeResponse
from api.scenario import load
from api.tests.helpers import DATA_DIR

CACHED = DATA_DIR / "attack-chain-01" / "analysis.json"

pytestmark = pytest.mark.skipif(
    not CACHED.is_file(),
    reason="analysis.json not generated yet (backend task T012)",
)


@pytest.fixture
def cached() -> AnalyzeResponse:
    return AnalyzeResponse.model_validate(json.loads(CACHED.read_text(encoding="utf-8")))


def test_cached_file_is_an_analyze_response(cached):
    assert cached.scenario_id == "attack-chain-01"
    assert cached.removed_event_ids == []


def test_prompt_version_matches(cached):
    assert cached.prompt_version == PROMPT_VERSION, (
        "the cached analysis was made with a different prompt: "
        "rerun scripts/analyze.py attack-chain-01"
    )


def test_every_citation_is_a_real_event_id(cached):
    known = {event["id"] for event in load("attack-chain-01")}
    cited = {event_id for edge in cached.edges for event_id in edge.citations}
    assert cited <= known
