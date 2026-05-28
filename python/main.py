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
import logging
import os
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from extractors.router import route
from extractors.embed import embed_texts, embed_query

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

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


@app.post("/extract", response_model=ExtractionResponse)
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


@app.post("/embed", response_model=EmbedResponse)
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


@app.post("/embed-query", response_model=QueryEmbedResponse)
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
