"""Shared fixtures. The Anthropic client is always faked: no test calls the model."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from api import analysis, index  # noqa: E402
from api.tests.helpers import FakeAnthropic, contract  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch):
    """No key, no client, a full bucket. Every test starts from the same server state."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(analysis, "client", None)
    index.rate_limiter.reset()
    yield
    index.rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(index.app)


@pytest.fixture
def fake_model(monkeypatch: pytest.MonkeyPatch) -> Callable[..., FakeAnthropic]:
    """Install a fake Anthropic client and a key. Returns the fake so calls can be read."""

    def install(result: Any, *, key: str | None = "test-key") -> FakeAnthropic:
        fake = FakeAnthropic(result)
        monkeypatch.setattr(analysis, "client", fake)
        if key is None:
            monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        else:
            monkeypatch.setenv("ANTHROPIC_API_KEY", key)
        return fake

    return install


@pytest.fixture
def chain() -> analysis.ChainOutput:
    """A small, valid model output built from the frozen response example."""
    example = contract("analyze_response.json")
    return analysis.ChainOutput(
        nodes=example["nodes"], edges=example["edges"], summary=example["summary"]
    )
