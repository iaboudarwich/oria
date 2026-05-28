"""
Embedding service — MiniLM-L6-v2 via sentence-transformers.

Model: sentence-transformers/all-MiniLM-L6-v2
Dimensions: 384
Normalised: L2 (cosine similarity = dot product on normalised vectors)

Singleton pattern: model is loaded once at import time, then reused.
"""

from __future__ import annotations

import logging
from typing import Sequence

logger = logging.getLogger(__name__)

_model = None  # lazy-loaded


def _get_model():
    global _model
    if _model is None:
        logger.info("Loading sentence-transformers/all-MiniLM-L6-v2 …")
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        logger.info("Model loaded.")
    return _model


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """
    Encode a list of strings → list of 384-dim float vectors (L2-normalised).
    Returns an empty list if texts is empty.
    """
    if not texts:
        return []
    model = _get_model()
    vectors = model.encode(
        list(texts),
        normalize_embeddings=True,
        batch_size=32,
        show_progress_bar=False,
    )
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    """Embed a single query string."""
    results = embed_texts([text])
    return results[0] if results else []
