"""
Oria Python Extraction Service
FastAPI sidecar for multi-stage document ingestion.

Endpoints:
  POST /extract     : extract text from a document
  POST /embed       : embed text chunks
  POST /gmail/scan  : fetch + parse recent Gmail messages (read-only)
  GET  /health      : liveness check

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
import re
import time
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import base64

import httpx
from bs4 import BeautifulSoup

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


# ── /gmail/scan ────────────────────────────────────────────────────────────────
# Fetch and parse a window of Gmail messages so the Node app can classify them
# with Claude. We only READ mail (the OAuth scope is gmail.readonly) and never
# send, delete, or modify anything. Only Social is excluded at the query level;
# Updates, Promotions, Forums, and the inbox itself are all included because
# e-commerce receipts and order confirmations live in Promotions. The AI
# classifier (not the query) decides what is actually transactional.
#
# SECURITY: the access token arrives in the signed request body and is used only
# to call the Gmail API. It is NEVER logged. Only counts and message ids appear
# in logs.

_GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailScanRequest(BaseModel):
    access_token: str
    timeframe_months: int = 6
    # Gmail search suffix appended to the timeframe filter, e.g. "after:2026/01/01"
    # used by ongoing sync to fetch only mail newer than the last scan.
    since_query: Optional[str] = None
    max_messages: int = 200
    # Confidentiality filters: emails matching are dropped here, before they are
    # ever returned or sent to the classifier. Never stored.
    exclude_keywords: list[str] = []
    exclude_senders: list[str] = []
    exclude_with_attachments: bool = False


class ScannedEmail(BaseModel):
    id: str
    subject: str
    sender: str
    date: Optional[str] = None
    snippet: str
    body: str


class GmailScanResponse(BaseModel):
    emails: list[ScannedEmail]
    total: int
    skipped: int = 0


def _decode_b64url(data: str) -> str:
    """Decode a Gmail base64url body part to text, tolerating bad padding."""
    if not data:
        return ""
    padded = data + "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_body(payload: dict) -> str:
    """Walk a Gmail message payload, preferring text/plain, falling back to
    HTML stripped to text. Returns at most ~4000 chars."""
    plain_parts: list[str] = []
    html_parts: list[str] = []

    def walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        body = part.get("body", {})
        data = body.get("data")
        if data:
            if mime == "text/plain":
                plain_parts.append(_decode_b64url(data))
            elif mime == "text/html":
                html_parts.append(_decode_b64url(data))
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload)

    if plain_parts:
        text = "\n".join(plain_parts)
    elif html_parts:
        text = BeautifulSoup("\n".join(html_parts), "html.parser").get_text(" ", strip=True)
    else:
        text = ""
    return text[:4000]


def _header(headers: list[dict], name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _has_attachment(payload: dict) -> bool:
    """True if any message part is a real file attachment (has a filename)."""
    def walk(part: dict) -> bool:
        if (part.get("filename") or "").strip():
            return True
        return any(walk(sub) for sub in part.get("parts", []) or [])
    return walk(payload)


def _matches_keyword(text: str, keywords: list[str]) -> bool:
    """Case-insensitive whole-word match of any keyword in text."""
    if not keywords:
        return False
    lowered = text.lower()
    for kw in keywords:
        k = kw.strip().lower()
        if not k:
            continue
        if re.search(rf"(?<!\w){re.escape(k)}(?!\w)", lowered):
            return True
    return False


def _sender_excluded(sender: str, exclude_senders: list[str]) -> bool:
    """Match the sender's address/domain against the exclude list (substring)."""
    if not exclude_senders:
        return False
    s = sender.lower()
    return any(e.strip().lower() in s for e in exclude_senders if e.strip())


@app.post("/gmail/scan", response_model=GmailScanResponse, dependencies=[Depends(require_signature)])
def gmail_scan(req: GmailScanRequest):
    """List and parse recent Gmail messages (Social excluded) for classification."""
    months = max(1, min(req.timeframe_months, 24))
    query = req.since_query or f"newer_than:{months}m"
    # Only exclude Social: it is almost never a transactional signal. Updates,
    # Promotions, Forums, and the inbox stay in so receipts (which often land in
    # Promotions) are scanned. The classifier discriminates from here.
    query = f"{query} -category:social"
    max_messages = max(1, min(req.max_messages, 400))

    auth = {"Authorization": f"Bearer {req.access_token}"}
    emails: list[ScannedEmail] = []
    skipped = 0

    with httpx.Client(timeout=30.0) as client:
        # 1) Collect message ids (paginated) up to max_messages.
        ids: list[str] = []
        page_token: Optional[str] = None
        while len(ids) < max_messages:
            params = {
                "q": query,
                "maxResults": min(100, max_messages - len(ids)),
            }
            if page_token:
                params["pageToken"] = page_token
            resp = client.get(f"{_GMAIL_API}/messages", headers=auth, params=params)
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Gmail token rejected")
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Gmail list failed: {resp.status_code}")
            data = resp.json()
            ids.extend(m["id"] for m in data.get("messages", []) or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break

        # 2) Fetch + parse each message.
        for mid in ids[:max_messages]:
            resp = client.get(
                f"{_GMAIL_API}/messages/{mid}",
                headers=auth,
                params={"format": "full"},
            )
            if resp.status_code != 200:
                continue
            msg = resp.json()
            payload = msg.get("payload", {})
            headers = payload.get("headers", []) or []
            subject = _header(headers, "Subject")
            sender = _header(headers, "From")
            body = _extract_body(payload)

            # Confidentiality filters: drop the email entirely, before it is
            # returned or classified. We check only subject + first 500 chars.
            if req.exclude_with_attachments and _has_attachment(payload):
                skipped += 1
                continue
            if _sender_excluded(sender, req.exclude_senders):
                skipped += 1
                continue
            if _matches_keyword(f"{subject}\n{body[:500]}", req.exclude_keywords):
                skipped += 1
                continue

            emails.append(
                ScannedEmail(
                    id=mid,
                    subject=subject,
                    sender=sender,
                    date=_header(headers, "Date") or None,
                    snippet=msg.get("snippet", ""),
                    body=body,
                )
            )

    logger.info(
        "Gmail scan: parsed %d, skipped %d by filter, of %d messages",
        len(emails),
        skipped,
        len(ids),
    )
    return GmailScanResponse(emails=emails, total=len(emails), skipped=skipped)
