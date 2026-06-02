"""
Microsoft Graph read helpers for the Oria sidecar.

Covers Outlook mail (read-only Mail.Read), OneDrive files (Files.Read), and
Outlook Calendar (Calendars.Read). Office formats are parsed locally
(python-docx, openpyxl, python-pptx); other binaries go through the existing
extractor router. Content is fetched on demand and returned to the Node app; it
is never persisted here. Access tokens arrive in the signed request body and
are NEVER logged.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Outlook mail ──────────────────────────────────────────────────────────────

_MAIL_SELECT = "id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments"


def _strip_body(body: dict) -> str:
    content = body.get("content", "") or ""
    if body.get("contentType", "").lower() == "html":
        return BeautifulSoup(content, "html.parser").get_text(" ", strip=True)[:4000]
    return content[:4000]


def outlook_fetch_messages(
    client: httpx.Client, token: str, since_iso: Optional[str], max_messages: int
) -> list[dict]:
    """Fetch recent Outlook messages, newest first, paginating up to max_messages."""
    params = {
        "$select": _MAIL_SELECT,
        "$top": str(min(50, max_messages)),
        "$orderby": "receivedDateTime desc",
    }
    if since_iso:
        params["$filter"] = f"receivedDateTime ge {since_iso}"

    url = f"{GRAPH}/me/messages"
    out: list[dict] = []
    next_link: Optional[str] = None
    while len(out) < max_messages:
        resp = client.get(next_link or url, headers=_auth(token), params=None if next_link else params)
        if resp.status_code == 401:
            raise RuntimeError("Outlook token rejected")
        if resp.status_code != 200:
            break
        data = resp.json()
        for m in data.get("value", []) or []:
            sender = (((m.get("from") or {}).get("emailAddress") or {}).get("address")) or ""
            out.append(
                {
                    "id": m.get("id", ""),
                    "subject": m.get("subject", "") or "",
                    "sender": sender,
                    "date": m.get("receivedDateTime"),
                    "snippet": m.get("bodyPreview", "") or "",
                    "body": _strip_body(m.get("body", {}) or {}),
                    "has_attachments": bool(m.get("hasAttachments")),
                }
            )
            if len(out) >= max_messages:
                break
        next_link = data.get("@odata.nextLink")
        if not next_link:
            break
    return out
