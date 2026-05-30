import pickle
from pathlib import Path
from functools import lru_cache
from typing import Optional

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

INDEX_PATH = Path(__file__).parent / "index.faiss"
CHUNKS_PATH = Path(__file__).parent / "chunks.pkl"
MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _load() -> tuple[faiss.IndexFlatL2, list[str], SentenceTransformer]:
    if not INDEX_PATH.exists() or not CHUNKS_PATH.exists():
        raise RuntimeError(
            "FAISS index not found. Run: python -m rag.indexer"
        )
    index = faiss.read_index(str(INDEX_PATH))
    with open(CHUNKS_PATH, "rb") as f:
        chunks = pickle.load(f)
    model = SentenceTransformer(MODEL_NAME)
    return index, chunks, model


def retrieve(query: str, top_k: int = 3) -> list[str]:
    """Return the top_k most relevant corpus chunks for a query."""
    try:
        index, chunks, model = _load()
    except RuntimeError:
        return []

    embedding = model.encode([query], convert_to_numpy=True).astype(np.float32)
    distances, indices = index.search(embedding, min(top_k, len(chunks)))
    return [chunks[i] for i in indices[0] if i < len(chunks)]
