"""
Google Drive + Calendar read helpers for the Oria sidecar.

Drive uses the drive.file OAuth scope, so the app can only ever touch files the
user explicitly picked via the Picker. Google-native types are EXPORTED to their
Office equivalents and run through the same extractor router as everything else,
so they get the full structured extraction (Docs -> DOCX -> Docling, Sheets ->
XLSX -> pandas tables, Slides -> PPTX -> Docling per-slide text). Binary/Office
files already in Drive download and route as-is.

Drive's export endpoint caps at 10 MB. A file that exceeds it (or an unsupported
subtype) is SKIPPED cleanly: it returns empty text with accessible=True so the
rest of the scan keeps going, never failing the whole pass. When the Office
export fails for a non-size reason we fall back to Drive's lighter text export so
we still capture the body.

Content is fetched on demand and returned to the Node app; it is never persisted
here. Access tokens arrive in the signed request body and are NEVER logged.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from extractors.router import route

logger = logging.getLogger(__name__)

DRIVE_API = "https://www.googleapis.com/drive/v3"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"

# Google-native types are exported to their Office equivalent (export_mime, ext)
# and run through the extractor router for full structured extraction.
GOOGLE_EXPORT_OFFICE = {
    "application/vnd.google-apps.document": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".docx",
    ),
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
    "application/vnd.google-apps.presentation": (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".pptx",
    ),
}

# Lighter text export, used only as a fallback when the Office export fails for a
# non-size reason (Docs/Slides -> plain text, Sheets -> CSV).
GOOGLE_EXPORT_TEXT = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

_META_FIELDS = "id,name,mimeType,webViewLink,iconLink,thumbnailLink,size,modifiedTime"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def drive_get_metadata(client: httpx.Client, token: str, file_id: str) -> Optional[dict]:
    """Fetch one file's metadata. Returns None if inaccessible (403/404)."""
    resp = client.get(
        f"{DRIVE_API}/files/{file_id}",
        headers=_auth(token),
        params={"fields": _META_FIELDS, "supportsAllDrives": "true"},
    )
    if resp.status_code in (403, 404):
        return None
    if resp.status_code != 200:
        return None
    return resp.json()


def _export_too_large(resp: httpx.Response) -> bool:
    """True when a 403 from the export endpoint is the 10 MB size cap rather than
    a permissions problem, so we can skip the file instead of marking it gone."""
    try:
        body = resp.json()
    except Exception:
        return False
    for err in (body.get("error", {}) or {}).get("errors", []) or []:
        if err.get("reason") == "exportSizeLimitExceeded":
            return True
    return "exportsizelimitexceeded" in resp.text.lower()


def _export_text_fallback(client: httpx.Client, token: str, file_id: str, mime_type: str) -> str:
    """Drive's lighter text export, used when the Office export yields nothing."""
    target = GOOGLE_EXPORT_TEXT.get(mime_type)
    if not target:
        return ""
    try:
        resp = client.get(
            f"{DRIVE_API}/files/{file_id}/export",
            headers=_auth(token),
            params={"mimeType": target},
        )
        return resp.text if resp.status_code == 200 else ""
    except Exception:
        return ""


def drive_fetch_text(client: httpx.Client, token: str, file_id: str, mime_type: str, name: str) -> tuple[str, bool]:
    """Return (text, accessible). Exports Google-native types to their Office
    equivalent and routes them through the extractor (full structured text);
    downloads everything else and routes it. Empty text + accessible=True means
    the file had no extractable text or was skipped (too large / unsupported)."""
    if mime_type == FOLDER_MIME:
        return "", True

    office = GOOGLE_EXPORT_OFFICE.get(mime_type)
    if office:
        export_mime, ext = office
        resp = client.get(
            f"{DRIVE_API}/files/{file_id}/export",
            headers=_auth(token),
            params={"mimeType": export_mime},
        )
        if resp.status_code == 404:
            return "", False
        if resp.status_code == 403:
            # Distinguish "too big to export" (skip, still accessible) from a
            # genuine permissions problem (mark inaccessible).
            if _export_too_large(resp):
                logger.info("Drive export over the size cap, skipping file %s", file_id)
                return "", True
            return "", False
        if resp.status_code != 200:
            return "", True
        # Route the exported Office bytes. The /fetch path passes an empty name,
        # so synthesize a filename with the right extension: Docling and the
        # router both key off it.
        base = name or "file"
        fname = base if base.lower().endswith(ext) else f"{base}{ext}"
        try:
            text, _method = route(resp.content, export_mime, fname)
        except Exception:
            text = ""
        if text and text.strip():
            return text, True
        # Office export produced nothing usable -> lighter text export.
        return _export_text_fallback(client, token, file_id, mime_type), True

    # Binary download for PDFs, images, Office files.
    resp = client.get(
        f"{DRIVE_API}/files/{file_id}",
        headers=_auth(token),
        params={"alt": "media", "supportsAllDrives": "true"},
    )
    if resp.status_code in (403, 404):
        return "", False
    if resp.status_code != 200:
        return "", True
    try:
        text, _method = route(resp.content, mime_type, name)
        return text, True
    except Exception:
        return "", True


def drive_list_folder(client: httpx.Client, token: str, folder_id: str) -> list[dict]:
    """List non-folder files directly inside a folder (single page, up to 200)."""
    resp = client.get(
        f"{DRIVE_API}/files",
        headers=_auth(token),
        params={
            "q": f"'{folder_id}' in parents and trashed = false and mimeType != '{FOLDER_MIME}'",
            "fields": f"files({_META_FIELDS})",
            "pageSize": 200,
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        },
    )
    if resp.status_code != 200:
        return []
    return resp.json().get("files", []) or []


def calendar_list_events(client: httpx.Client, token: str, past_days: int, future_days: int) -> list[dict]:
    """List events on the primary calendar in [-past_days, +future_days],
    expanding recurring events into instances. Paginates up to 1000."""
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    time_min = (now - timedelta(days=max(0, past_days))).isoformat()
    time_max = (now + timedelta(days=max(0, future_days))).isoformat()

    events: list[dict] = []
    page_token: Optional[str] = None
    while len(events) < 1000:
        params = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 250,
        }
        if page_token:
            params["pageToken"] = page_token
        resp = client.get(
            f"{CALENDAR_API}/calendars/primary/events",
            headers=_auth(token),
            params=params,
        )
        if resp.status_code != 200:
            break
        data = resp.json()
        events.extend(data.get("items", []) or [])
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return events
