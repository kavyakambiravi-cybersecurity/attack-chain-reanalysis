"""Paths and the fake Anthropic client. No test ever calls the real model."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CONTRACT_DIR = ROOT / "specs" / "001-attack-chain-reanalysis" / "contract"
DATA_DIR = ROOT / "data" / "scenarios"


def contract(name: str) -> Any:
    """Read one of the frozen wire-contract examples."""
    return json.loads((CONTRACT_DIR / name).read_text(encoding="utf-8"))


class FakeResponse:
    """Stands in for anthropic's ParsedMessage."""

    def __init__(
        self,
        parsed_output: Any = None,
        stop_reason: str = "end_turn",
        stop_details: Any = None,
    ) -> None:
        self.parsed_output = parsed_output
        self.stop_reason = stop_reason
        self.stop_details = stop_details


class FakeMessages:
    def __init__(self, result: Any) -> None:
        self.result = result
        self.calls: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if isinstance(self.result, BaseException):
            raise self.result
        if callable(self.result):
            return self.result(**kwargs)
        return self.result


class FakeAnthropic:
    def __init__(self, result: Any) -> None:
        self.messages = FakeMessages(result)

    @property
    def calls(self) -> list[dict[str, Any]]:
        return self.messages.calls
