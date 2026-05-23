"""
Shared embedding model singleton for semantic cache.
Lazy-loaded on first use — no cost at import time.
Controlled by SEMANTIC_CACHE_ENABLED=true (default: false).
"""
from __future__ import annotations

_model = None


def get_model():
    global _model
    if _model is not None:
        return _model
    from sentence_transformers import SentenceTransformer
    _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed(text: str):
    """Return a normalised numpy float32 vector for text."""
    import numpy as np
    model = get_model()
    vec = model.encode([text], normalize_embeddings=True, convert_to_numpy=True)
    return vec[0].astype("float32")
