"""FastAPI app for Sever.

Routes are declared with their full paths (`/api/health`, `/api/analyze`) so the same
app serves locally under uvicorn and on Vercel behind the `/api/(.*)` rewrite.
"""

from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

MODEL = "claude-sonnet-5"

app = FastAPI(title="Sever API", docs_url=None, redoc_url=None, openapi_url=None)


class HealthResponse(BaseModel):
    ok: Literal[True] = True
    live: bool
    model: str


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Cheap liveness probe. Never constructs or calls the model client."""
    return HealthResponse(ok=True, live=bool(os.environ.get("ANTHROPIC_API_KEY")), model=MODEL)
