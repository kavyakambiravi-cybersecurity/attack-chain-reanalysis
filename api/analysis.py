"""Prompt, Pydantic shapes, and the single model call.

Both the live endpoint and `scripts/analyze.py` go through `analyze()`, so the cached
`analysis.json` and a live re-analysis are produced by exactly the same text and the same
model settings. The model is never told that events were removed, what the user did, or
what the previous chain looked like: it sees only the remaining events.
"""

from __future__ import annotations

from typing import Any, Iterable, Literal

import anthropic
from pydantic import BaseModel, ValidationError

MODEL = "claude-sonnet-5"
PROMPT_VERSION = "2026-09-07.2"
MAX_TOKENS = 8000
TIMEOUT_SECONDS = 50.0

# Frozen. Copied verbatim from plan.md, "Analysis design (server)". Changing this text
# means bumping PROMPT_VERSION and regenerating every committed analysis.json.
SYSTEM_PROMPT = """\
You are a security analyst. You will be given a list of telemetry events from one
organisation's network over one day. Most events are ordinary activity. Some of them may
together form a single attack. Your job is to find the attack, if there is one, and describe it
as a chain of actions between assets, for a reader who has no security background.

Each event line has this shape:
  <id> | <timestamp> | <source> -> <target> | <type> | <detail>
The source and target are asset names. An asset is a host (for example WKSTN-042), a user
account (for example jsmith), or an external address (for example 203.0.113.47). User accounts
are assets in their own right: "jsmith -> WKSTN-042" means the user jsmith did something on
that workstation.

Return a chain with these rules.

Nodes
- A node is an asset. Its id must be an asset name copied exactly as it appears in the events,
  including any label in parentheses. Never invent, shorten, or normalise a name.
- Include only assets that take part in the attack. Leave out assets that appear only in
  ordinary activity.
- Every asset you use as the source or target of an edge must also appear in this node list.
  Never draw an edge to or from an asset you have not listed. This includes external addresses
  that only receive data.
- The label is a short plain-English description of the asset's role, at most four words,
  based only on what the events show. Example: "finance file server".

Edges
- An edge is one attacker action from a source asset to a target asset.
- Every edge must list the ids of the events that justify it in "citations". Each cited event
  must have exactly the edge's source as its source and exactly the edge's target as its
  target. If the events that show an action run from a user to a host, the edge runs from that
  user to that host, not from the host the user was sitting at.
- Never cite an id that is not in the list. Never leave citations empty.
- Prefer fewer, well-supported edges over many weak ones. One edge may cite several events.
- Order edges by the timestamp of their earliest cited event.
- "action" is three to six words naming what happened, for example "logged in from outside"
  or "copied files out". "description" is one sentence a newcomer can follow, and may say why
  this step matters for the next one.

Summary
- At most two sentences. Say what the evidence shows happened, from first step to last.

If the events do not show a connected attack, return no edges, list no nodes, and use the
summary to say that the remaining events do not show a connected attack.

Wording
- Plain English throughout. Do not use security jargon or technique names in "action",
  "description", or "summary". If you must refer to a technique, describe what it did.
- Never use the words "secure", "safe", or "contained".
- Do not give scores, percentages, confidence levels, or severity ratings.
- Do not speculate beyond the events. Say only what the cited events support.
"""


# --- Wire shapes ------------------------------------------------------------------


class ChainNode(BaseModel):
    id: str
    label: str


class ChainEdge(BaseModel):
    source: str
    target: str
    action: str
    description: str
    citations: list[str]


class ChainOutput(BaseModel):
    """What the model returns."""

    nodes: list[ChainNode]
    edges: list[ChainEdge]
    summary: str


class AnalyzeResponse(ChainOutput):
    """The only chain shape that crosses the wire or is written to analysis.json."""

    scenario_id: str
    removed_event_ids: list[str]
    prompt_version: str


class AnalyzeRequest(BaseModel):
    """Unknown request fields are ignored, which is pydantic's default."""

    scenario_id: str
    removed_event_ids: list[str]


ErrorCode = Literal[
    "unknown_scenario",
    "unknown_event_ids",
    "too_many_removed",
    "bad_request",
    "rate_limited",
    "not_configured",
    "model_refused",
    "model_error",
    "internal",
]


class ErrorResponse(BaseModel):
    error: ErrorCode
    detail: str
    ids: list[str] | None = None  # only for unknown_event_ids


class HealthResponse(BaseModel):
    ok: Literal[True] = True
    live: bool
    model: str


# --- Model call -------------------------------------------------------------------


class ModelRefused(Exception):
    """The model declined to answer (stop_reason == "refusal")."""

    def __init__(self, stop_details: Any = None) -> None:
        self.stop_details = stop_details
        super().__init__(f"model refused: {stop_details!r}")


class ModelError(Exception):
    """An SDK error, a timeout, or output that would not parse."""


# Module level so tests can replace it with a fake via monkeypatch. It is constructed
# lazily: /api/health must never build a client, and importing this module must not
# require a key.
client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global client
    if client is None:
        client = anthropic.Anthropic(timeout=TIMEOUT_SECONDS, max_retries=0)
    return client


def render_events(events: Iterable[dict[str, Any]]) -> str:
    """One header line, a blank line, then one line per event in the given order.

    Asset names are copied verbatim, including parenthesised labels, so the model can
    copy them back. Nothing about removals, the user, or a previous chain is added.
    """
    events = list(events)
    lines = [
        f"Events: {len(events)} of the day's telemetry records, in time order.",
        "",
    ]
    for event in events:
        lines.append(
            f"{event['id']} | {event['timestamp']} | "
            f"{event['source']} -> {event['target']} | "
            f"{event['type']} | {event['detail']}"
        )
    return "\n".join(lines)


def analyze(events: Iterable[dict[str, Any]]) -> ChainOutput:
    """Ask the model for a chain over exactly these events.

    Raises ModelRefused on a refusal and ModelError on any SDK failure, timeout, or
    output that will not parse. Anything else propagates and becomes `internal`.
    """
    try:
        response = get_client().messages.parse(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            output_config={"effort": "medium"},
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": render_events(events)}],
            output_format=ChainOutput,
        )
    except anthropic.APIError as exc:  # status errors, timeouts, connection errors
        raise ModelError(str(exc)) from exc

    if getattr(response, "stop_reason", None) == "refusal":
        raise ModelRefused(getattr(response, "stop_details", None))

    chain = response.parsed_output
    if chain is None:
        raise ModelError("the model returned no parseable chain")
    if not isinstance(chain, ChainOutput):
        try:
            chain = ChainOutput.model_validate(chain)
        except ValidationError as exc:
            raise ModelError(str(exc)) from exc
    return chain


def build_response(
    chain: ChainOutput, scenario_id: str, removed_event_ids: list[str]
) -> AnalyzeResponse:
    """Wrap a model chain with the server-added fields. Used by the API and the script."""
    return AnalyzeResponse(
        nodes=chain.nodes,
        edges=chain.edges,
        summary=chain.summary,
        scenario_id=scenario_id,
        removed_event_ids=list(removed_event_ids),
        prompt_version=PROMPT_VERSION,
    )
