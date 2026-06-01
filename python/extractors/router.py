"""
Extraction router — picks the right tool per MIME type.

Routing table (matches user spec exactly):
  Excel / CSV              → pandas / openpyxl
  Native/selectable PDF    → PyMuPDF4LLM
  Complex PDF / layouts    → Docling (fallback if PyMuPDF4LLM yields < 100 chars)
  Scanned / image docs     → Tesseract (Mistral OCR reserved for future cloud path)
  DOCX / PPTX / HTML       → Docling first, MarkItDown fallback
  Plain text               → passthrough
"""

from __future__ import annotations

import io
import logging
import re
import tempfile
import os
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

ExtractionMethod = Literal[
    "pymupdf4llm",
    "docling",
    "pandas",
    "markitdown",
    "tesseract",
    "passthrough",
    "failed",
]


def route(data: bytes, mime_type: str, filename: str) -> tuple[str, ExtractionMethod]:
    """
    Return (extracted_text, method_name).
    Never raises — returns ("", "failed") on unrecoverable error.
    """
    mime = (mime_type or "").lower().strip()
    ext = Path(filename).suffix.lower()

    # ── Excel / CSV ──────────────────────────────────────────────────────────
    if mime in (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv",
        "application/csv",
    ) or ext in (".xlsx", ".xls", ".csv"):
        return _extract_spreadsheet(data, mime, filename)

    # ── PDF ──────────────────────────────────────────────────────────────────
    if mime == "application/pdf" or ext == ".pdf":
        return _extract_pdf(data, filename)

    # ── DOCX ─────────────────────────────────────────────────────────────────
    if mime in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ) or ext in (".docx", ".doc"):
        return _extract_office(data, filename, "docx")

    # ── PPTX ─────────────────────────────────────────────────────────────────
    if mime in (
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
    ) or ext in (".pptx", ".ppt"):
        return _extract_office(data, filename, "pptx")

    # ── HTML ─────────────────────────────────────────────────────────────────
    if mime in ("text/html", "application/xhtml+xml") or ext in (".html", ".htm"):
        return _extract_html(data)

    # ── Images (scans) ───────────────────────────────────────────────────────
    if mime.startswith("image/") or ext in (".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".gif", ".webp"):
        return _extract_image_ocr(data, filename)

    # ── Plain text ───────────────────────────────────────────────────────────
    if mime.startswith("text/") or ext in (".txt", ".md", ".rst", ".log"):
        try:
            return data.decode("utf-8", errors="replace"), "passthrough"
        except Exception:
            return "", "failed"

    logger.warning("No extractor for mime=%s ext=%s", mime, ext)
    return "", "failed"


# ── Spreadsheets ─────────────────────────────────────────────────────────────

def _extract_spreadsheet(data: bytes, mime: str, filename: str) -> tuple[str, ExtractionMethod]:
    try:
        import pandas as pd

        if "csv" in mime or filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(data), encoding_errors="replace")
            return _df_to_text(df, filename), "pandas"

        # Excel — read all sheets
        xl = pd.ExcelFile(io.BytesIO(data))
        parts: list[str] = []
        for sheet in xl.sheet_names:
            df = xl.parse(sheet)
            parts.append(f"## Sheet: {sheet}\n\n{_df_to_text(df, sheet)}")
        return "\n\n".join(parts), "pandas"

    except Exception as exc:
        logger.error("Spreadsheet extraction failed: %s", exc)
        return "", "failed"


def _df_to_text(df, name: str) -> str:
    """Convert a DataFrame to a readable Markdown-ish table."""
    try:
        return df.to_string(index=False, max_rows=2000, max_cols=50)
    except Exception:
        return ""


# ── PDFs ─────────────────────────────────────────────────────────────────────

def _extract_pdf(data: bytes, filename: str) -> tuple[str, ExtractionMethod]:
    # Try PyMuPDF4LLM first (native/selectable PDFs)
    try:
        import pymupdf4llm
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            # page_chunks=True returns one entry per page so we can emit
            # "## Page N" markers. The TS chunker detects these and tags each
            # chunk with { page_number }, enabling per-page retrieval/citation.
            pages = pymupdf4llm.to_markdown(tmp, page_chunks=True)
            if isinstance(pages, list):
                parts = []
                for i, pg in enumerate(pages):
                    text = pg.get("text", "") if isinstance(pg, dict) else str(pg)
                    if text and text.strip():
                        parts.append(f"## Page {i + 1}\n\n{text.strip()}")
                md_text = "\n\n".join(parts)
            else:
                md_text = pages
        finally:
            os.unlink(tmp)

        if md_text and len(md_text.strip()) >= 100:
            return md_text, "pymupdf4llm"

        logger.info("PyMuPDF4LLM yielded %d chars — falling back to Docling", len(md_text.strip()))
    except Exception as exc:
        logger.warning("PyMuPDF4LLM failed (%s) — falling back to Docling", exc)

    # Docling fallback (complex layouts, tables, multi-column)
    return _docling_extract(data, filename)


# ── Office documents ─────────────────────────────────────────────────────────

def _extract_office(data: bytes, filename: str, kind: str) -> tuple[str, ExtractionMethod]:
    # Docling handles DOCX/PPTX natively with layout awareness
    text, method = _docling_extract(data, filename)
    if text and len(text.strip()) >= 50:
        return text, method

    # MarkItDown fallback
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        with tempfile.NamedTemporaryFile(suffix=f".{kind}", delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            result = md.convert(tmp)
            return result.text_content or "", "markitdown"
        finally:
            os.unlink(tmp)
    except Exception as exc:
        logger.error("MarkItDown fallback failed: %s", exc)
        return "", "failed"


# ── HTML ─────────────────────────────────────────────────────────────────────

def _extract_html(data: bytes) -> tuple[str, ExtractionMethod]:
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            result = md.convert(tmp)
            return result.text_content or "", "markitdown"
        finally:
            os.unlink(tmp)
    except Exception as exc:
        logger.warning("MarkItDown HTML failed (%s) — falling back to BS4", exc)

    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(data, "lxml")
        return soup.get_text(separator="\n", strip=True), "passthrough"
    except Exception as exc:
        logger.error("BS4 HTML fallback failed: %s", exc)
        return "", "failed"


# ── Image OCR ────────────────────────────────────────────────────────────────

def _extract_image_ocr(data: bytes, filename: str) -> tuple[str, ExtractionMethod]:
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(img, lang="eng+fra+ara")
        return text.strip(), "tesseract"
    except Exception as exc:
        logger.error("Tesseract OCR failed: %s", exc)
        return "", "failed"


# ── Docling helper ────────────────────────────────────────────────────────────

def _docling_extract(data: bytes, filename: str) -> tuple[str, ExtractionMethod]:
    try:
        from docling.document_converter import DocumentConverter
        ext = Path(filename).suffix or ".bin"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            converter = DocumentConverter()
            result = converter.convert(tmp)
            md = result.document.export_to_markdown()
            return md or "", "docling"
        finally:
            os.unlink(tmp)
    except Exception as exc:
        logger.error("Docling extraction failed: %s", exc)
        return "", "failed"
