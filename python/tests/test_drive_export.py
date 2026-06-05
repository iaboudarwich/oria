"""
Sidecar tests for native Google format export (Round 17.5).

Verifies drive_fetch_text exports Docs/Sheets/Slides to their Office equivalent
and routes the bytes through the extractor, handles the export size cap by
skipping cleanly, distinguishes a genuine permission 403, and falls back to the
lighter text export when the Office route yields nothing.

Runnable without pytest:  python/.venv/bin/python python/tests/test_drive_export.py
(also works under pytest if installed).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import google_clients as gc

DOC = "application/vnd.google-apps.document"
SHEET = "application/vnd.google-apps.spreadsheet"
SLIDES = "application/vnd.google-apps.presentation"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


class FakeResp:
    def __init__(self, status_code=200, content=b"", text="", json_body=None):
        self.status_code = status_code
        self.content = content
        self.text = text
        self._json = json_body if json_body is not None else {}

    def json(self):
        return self._json


class FakeClient:
    """Records GET calls and replays canned responses by (url, mimeType)."""

    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    def get(self, url, headers=None, params=None):
        params = params or {}
        self.calls.append({"url": url, "params": params})
        for matcher, resp in self.responses:
            if matcher(url, params):
                return resp
        return FakeResp(status_code=500)


def _is_export(url, params):
    return url.endswith("/export")


def test_doc_exports_to_docx_and_routes(monkeypatch=None):
    captured = {}

    def fake_route(data, mime, fname):
        captured["mime"] = mime
        captured["fname"] = fname
        captured["data"] = data
        return ("ROUTED DOC TEXT", "docling")

    gc.route = fake_route
    client = FakeClient([(_is_export, FakeResp(200, content=b"DOCXBYTES"))])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", DOC, "")
    assert ok is True
    assert text == "ROUTED DOC TEXT"
    # Asked Drive for a DOCX export and routed those exact bytes.
    assert client.calls[0]["params"]["mimeType"] == DOCX
    assert captured["mime"] == DOCX
    assert captured["data"] == b"DOCXBYTES"
    assert captured["fname"].endswith(".docx")


def test_sheet_exports_to_xlsx():
    gc.route = lambda data, mime, fname: ("CELLS", "pandas")
    client = FakeClient([(_is_export, FakeResp(200, content=b"XLSXBYTES"))])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", SHEET, "budget")
    assert ok and text == "CELLS"
    assert client.calls[0]["params"]["mimeType"] == XLSX


def test_slides_exports_to_pptx():
    gc.route = lambda data, mime, fname: ("SLIDE TEXT", "docling")
    client = FakeClient([(_is_export, FakeResp(200, content=b"PPTXBYTES"))])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", SLIDES, "deck")
    assert ok and text == "SLIDE TEXT"
    assert client.calls[0]["params"]["mimeType"] == PPTX


def test_too_large_skips_cleanly():
    gc.route = lambda *a: ("", "failed")
    body = {"error": {"errors": [{"reason": "exportSizeLimitExceeded"}]}}
    client = FakeClient([(_is_export, FakeResp(403, json_body=body, text="exportSizeLimitExceeded"))])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", DOC, "huge")
    # Skipped, but the file is still accessible so the scan continues.
    assert text == "" and ok is True


def test_genuine_403_is_inaccessible():
    gc.route = lambda *a: ("", "failed")
    client = FakeClient([(_is_export, FakeResp(403, json_body={"error": {"errors": []}}, text="forbidden"))])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", DOC, "x")
    assert text == "" and ok is False


def test_office_empty_falls_back_to_text_export():
    # First export (Office) returns 200 but routes to empty; the fallback text
    # export then returns the body.
    gc.route = lambda data, mime, fname: ("", "failed")
    seq = [FakeResp(200, content=b"DOCXBYTES"), FakeResp(200, text="PLAIN BODY")]
    state = {"i": 0}

    class SeqClient(FakeClient):
        def get(self, url, headers=None, params=None):
            self.calls.append({"url": url, "params": params or {}})
            r = seq[min(state["i"], len(seq) - 1)]
            state["i"] += 1
            return r

    client = SeqClient([])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", DOC, "x")
    assert ok and text == "PLAIN BODY"


def test_binary_pdf_routes_media_download():
    captured = {}

    def fake_route(data, mime, fname):
        captured["mime"] = mime
        return ("PDF TEXT", "pymupdf4llm")

    gc.route = fake_route
    client = FakeClient([(lambda u, p: True, FakeResp(200, content=b"%PDF-1.4"))])
    text, ok = gc.drive_fetch_text(client, "tok", "fid", "application/pdf", "doc.pdf")
    assert ok and text == "PDF TEXT"
    assert captured["mime"] == "application/pdf"
    assert "alt" in client.calls[0]["params"]  # media download, not export


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} sidecar export tests passed")
