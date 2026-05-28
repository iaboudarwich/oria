"""
Oria Python Extraction Service
FastAPI sidecar for multi-stage document ingestion.

Endpoints:
  POST /extract   — extract text from a document
  POST /embed     — embed text chunks
  GET  /health    — liveness check

Start locally:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Production:
  uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from extractors.router import route
from extractors.embed import embed_texts, embed_query

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── HMAC signature verification ───────────────────────────────────────────────
# Shared secret set via ORIA_SIDECAR_SECRET env var.
# When the env var is absent (local dev without secret), auth is skipped so
# existing dev workflows keep working. In production (Railway), the var MUST
# be set — requests without a valid signature are rejected with 401/403.
#
# Signature scheme:
#   X-Oria-Timestamp: <unix seconds, integer>
#   X-Oria-Signature: sha256=HMAC-SHA256(secret, "<ts>:<METHOD>:<path>")
#
# The timestamp must be within ±60 s of server time to prevent replay attacks.

_SIDECAR_SECRET: str = os.getenv("ORIA_SIDECAR_SECRET", "")
_SIGNATURE_TTL_S: int = 60


async def require_signature(request: Request) -> None:
    """FastAPI dependency — verify HMAC signature on protected endpoints."""
    if not _SIDECAR_SECRET:
        # Dev mode: no secret configured → unauthenticated (log once per run).
        return

    ts_header = request.headers.get("x-oria-timestamp", "")
    sig_header = request.headers.get("x-oria-signature", "")

    if not ts_header or not sig_header:
        raise HTTPException(status_code=401, detail="Missing authentication headers")

    try:
        ts = int(ts_header)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp format")

    if abs(time.time() - ts) > _SIGNATURE_TTL_S:
        raise HTTPException(status_code=401, detail="Request timestamp expired")

    # Canonical payload: "<timestamp>:<METHOD>:<path>"
    method = request.method.upper()
    path = request.url.path
    payload = f"{ts_header}:{method}:{path}".encode()

    expected_hex = hmac.new(_SIDECAR_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    expected_sig = f"sha256={expected_hex}"

    if not hmac.compare_digest(expected_sig, sig_header):
        raise HTTPException(status_code=403, detail="Invalid signature")

app = FastAPI(
    title="Oria Extraction Service",
    version="1.0.0",
    description="Multi-stage document extraction and embedding for Oria",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", os.getenv("NEXT_PUBLIC_SITE_URL", "")],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── /health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "oria-extraction"}


# ── /extract ─────────────────────────────────────────────────────────────────

class ExtractionResponse(BaseModel):
    text: str
    method: str
    file_hash: str
    char_count: int


@app.post("/extract", response_model=ExtractionResponse, dependencies=[Depends(require_signature)])
async def extract(
    file: UploadFile = File(...),
    mime_type: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
):
    """
    Accept a raw file upload. Return extracted text + metadata.

    - mime_type: override MIME (falls back to UploadFile.content_type)
    - filename:  override filename (falls back to UploadFile.filename)
    """
    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    resolved_mime = mime_type or file.content_type or "application/octet-stream"
    resolved_name = filename or file.filename or "upload.bin"

    # SHA-256 hash for deduplication
    file_hash = hashlib.sha256(data).hexdigest()

    text, method = route(data, resolved_mime, resolved_name)

    logger.info(
        "Extracted %d chars via %s from %s (hash=%s…)",
        len(text),
        method,
        resolved_name,
        file_hash[:12],
    )

    return ExtractionResponse(
        text=text,
        method=method,
        file_hash=file_hash,
        char_count=len(text),
    )


# ── /embed ───────────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimensions: int


@app.post("/embed", response_model=EmbedResponse, dependencies=[Depends(require_signature)])
def embed(req: EmbedRequest):
    """
    Embed a list of text strings using MiniLM-L6-v2.
    Returns 384-dim L2-normalised float vectors.
    """
    if not req.texts:
        return EmbedResponse(embeddings=[], model="all-MiniLM-L6-v2", dimensions=384)

    if len(req.texts) > 512:
        raise HTTPException(status_code=400, detail="Max 512 texts per request")

    vectors = embed_texts(req.texts)
    return EmbedResponse(
        embeddings=vectors,
        model="all-MiniLM-L6-v2",
        dimensions=384,
    )


# ── /embed-query ─────────────────────────────────────────────────────────────

class QueryEmbedRequest(BaseModel):
    text: str


class QueryEmbedResponse(BaseModel):
    embedding: list[float]
    model: str
    dimensions: int


@app.post("/embed-query", response_model=QueryEmbedResponse, dependencies=[Depends(require_signature)])
def embed_query_endpoint(req: QueryEmbedRequest):
    """Embed a single query string for semantic search."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty query")

    vector = embed_query(req.text)
    return QueryEmbedResponse(
        embedding=vector,
        model="all-MiniLM-L6-v2",
        dimensions=384,
    )
