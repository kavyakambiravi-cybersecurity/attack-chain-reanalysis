"""FastAPI app for Attack Chain Reanalysis.

Routes are declared with their full paths (`/api/health`, `/api/analyze`) so the same
app serves locally under uvicorn and on Vercel behind the `/api/(.*)` rewrite.

Every non-2xx body is an ErrorResponse, including the ones FastAPI would otherwise
generate itself, so the client only ever has one error shape to parse.
"""

from __future__ import annotations

import os
import re
import time
from typing import get_args

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.analysis import (
    MODEL,
    AnalyzeRequest,
    ErrorCode,
    ErrorResponse,
    HealthResponse,
    ModelError,
    ModelRefused,
    analyze,
    build_response,
)
from api.scenario import (
    MAX_REMOVED,
    TooManyRemoved,
    UnknownEventIds,
    UnknownScenario,
    dedupe,
    load,
    subtract,
)

# The nine codes of the wire contract and the status each one is returned with.
STATUS_FOR_ERROR: dict[str, int] = {
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
assert set(STATUS_FOR_ERROR) == set(get_args(ErrorCode))

RATE_LIMIT_PER_MINUTE = 10

_UNPRINTABLE = re.compile(r"[^\x20-\x7e]")

app = FastAPI(title="Attack Chain Reanalysis API", docs_url=None, redoc_url=None, openapi_url=None)


# --- Helpers ----------------------------------------------------------------------


def error(code: ErrorCode, detail: str, ids: list[str] | None = None) -> JSONResponse:
    """Build the one error shape the client parses. `ids` is omitted unless it is set."""
    body = ErrorResponse(error=code, detail=detail, ids=ids)
    return JSONResponse(
        status_code=STATUS_FOR_ERROR[code],
        content=body.model_dump(exclude_none=True),
    )


def _echo(value: str, limit: int = 40) -> str:
    """Make a user-supplied string safe to put in a banner sentence."""
    cleaned = _UNPRINTABLE.sub("", str(value))
    return cleaned if len(cleaned) <= limit else cleaned[:limit] + "..."


class TokenBucket:
    """Per-instance guard: `capacity` analyses per minute, refilling continuously.

    Weak across Vercel instances, which is acceptable for a demo. It only guards the
    model call, so a malformed or unknown-id request never spends a token.
    """

    def __init__(self, capacity: int = RATE_LIMIT_PER_MINUTE, per_seconds: float = 60.0):
        self.capacity = capacity
        self.per_seconds = per_seconds
        self.tokens = float(capacity)
        self.updated = time.monotonic()

    def take(self) -> bool:
        now = time.monotonic()
        refill = (now - self.updated) * self.capacity / self.per_seconds
        self.tokens = min(float(self.capacity), self.tokens + refill)
        self.updated = now
        if self.tokens < 1.0:
            return False
        self.tokens -= 1.0
        return True

    def reset(self) -> None:
        self.tokens = float(self.capacity)
        self.updated = time.monotonic()


rate_limiter = TokenBucket()


# --- Routes -----------------------------------------------------------------------


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Cheap liveness probe. Never constructs or calls the model client."""
    return HealthResponse(ok=True, live=bool(os.environ.get("ANTHROPIC_API_KEY")), model=MODEL)


@app.post("/api/analyze")
def analyze_endpoint(body: AnalyzeRequest) -> JSONResponse:
    """Subtract the removed events from the bundled scenario and re-analyse what is left.

    Checks run in the order the wire contract fixes. FastAPI has already turned an
    unparseable body into `bad_request` before this function is entered.
    """
    try:
        # 2. Known scenario.
        try:
            events = load(body.scenario_id)
        except UnknownScenario:
            return error("unknown_scenario", f"No scenario named {_echo(body.scenario_id)}.")

        # 3. Deduplicate, first-seen order. 4. Known ids. 5. At most MAX_REMOVED.
        removed = dedupe(body.removed_event_ids)
        try:
            remaining = subtract(events, removed)
        except UnknownEventIds as exc:
            count = len(exc.ids)
            plural = "id is" if count == 1 else "ids are"
            return error(
                "unknown_event_ids",
                f"{count} event {plural} not in this scenario.",
                ids=exc.ids,
            )
        except TooManyRemoved:
            return error("too_many_removed", f"At most {MAX_REMOVED} events can be removed.")

        # 6. Per-instance token bucket.
        if not rate_limiter.take():
            return error("rate_limited", "Too many analyses in the last minute. Try again shortly.")

        # 7. A key must be present before anything reaches the SDK.
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return error("not_configured", "Live re-analysis is off: the server has no model key.")

        # 8. The model call.
        try:
            chain = analyze(remaining)
        except ModelRefused:
            return error("model_refused", "The model declined to analyse these events.")
        except ModelError:
            return error("model_error", "The model call failed or timed out.")

        # 9. Echo the scenario, the deduplicated removals, and the prompt version.
        response = build_response(chain, body.scenario_id, removed)
        return JSONResponse(status_code=200, content=response.model_dump())
    except Exception:  # noqa: BLE001 - no FastAPI default body may ever reach the client
        return error("internal", "Something went wrong on the server.")


# --- Error shape for everything FastAPI would answer on its own --------------------


@app.exception_handler(RequestValidationError)
async def on_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    return error("bad_request", "Request body must have scenario_id and removed_event_ids.")


@app.exception_handler(StarletteHTTPException)
async def on_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code < 500:
        return error("bad_request", "That request could not be handled.")
    return error("internal", "Something went wrong on the server.")


@app.exception_handler(Exception)
async def on_unhandled(request: Request, exc: Exception) -> JSONResponse:
    return error("internal", "Something went wrong on the server.")
