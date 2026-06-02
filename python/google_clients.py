"""
Google Drive + Calendar read helpers for the Oria sidecar.

Drive uses the drive.file OAuth scope, so the app can only ever touch files the
user explicitly picked via the Picker. Google-native types are exported to text
(Docs -> text/plain, Sheets -> text/csv, Slides -> text/plain); everything else
is downloaded and run through the existing extractor router (PDF, docx, images).

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

# Google-native types are exported (not downloaded) to a text-bearing format.
GOOGLE_EXPORT = {
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


def drive_fetch_text(client: httpx.Client, token: str, file_id: str, mime_type: str, name: str) -> tuple[str, bool]:
    """Return (text, accessible). Exports Google-native types, downloads the rest
    and routes them through the extractor. Empty text + accessible=True means the
    file simply had no extractable text."""
    if mime_type == FOLDER_MIME:
        return "", True

    export_as = GOOGLE_EXPORT.get(mime_type)
    if export_as:
        resp = client.get(
            f"{DRIVE_API}/files/{file_id}/export",
            headers=_auth(token),
            params={"mimeType": export_as},
        )
        if resp.status_code in (403, 404):
            return "", False
        if resp.status_code != 200:
            return "", True
        return resp.text, True

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
