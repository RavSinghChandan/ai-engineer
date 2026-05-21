"""
Numerology RAG Retriever
========================
Loads FAISS index once (cached in-process) and retrieves the most
relevant book passages for a given query + optional filters.

Two retrieval modes used by the hybrid agent:
  retrieve_for_rag()     — top-k chunks for RAG context injection
  retrieve_for_ragless() — top-k chunks used to VERIFY / anchor the
                           RAGless LLM answer (hallucination guard)
"""
from __future__ import annotations
import json
import numpy as np
from functools import lru_cache
from pathlib import Path
from typing import Any

INDEX_DIR = Path(__file__).parent / "index"

# ── Lazy-loaded singletons ────────────────────────────────────────────────────
_index    = None
_metadata = None
_model    = None


def _load():
    global _index, _metadata, _model
    if _index is not None:
        return
    import faiss
    from sentence_transformers import SentenceTransformer
    _index    = faiss.read_index(str(INDEX_DIR / "faiss.index"))
    _metadata = json.loads((INDEX_DIR / "metadata.json").read_text())
    _model    = SentenceTransformer("all-MiniLM-L6-v2")


def retrieve(
    query: str,
    intent: str | None = None,
    numbers: list[int] | None = None,
    top_k: int = 5,
    min_score: float = 0.25,
) -> list[dict[str, Any]]:
    """
    Retrieve top-k relevant chunks from the numerology book corpus.

    Scoring:
      - Semantic similarity (FAISS cosine) is the primary score
      - Intent match adds +0.10 bonus
      - Number match adds +0.08 per matched number (max +0.16)

    Returns list of dicts: {text, book, score, intents, numbers}
    """
    _load()

    # Embed query
    q_vec = _model.encode([query], normalize_embeddings=True, convert_to_numpy=True)
    q_vec = q_vec.astype(np.float32)

    # FAISS search — retrieve 3x top_k for re-ranking
    fetch_k = min(top_k * 3, len(_metadata))
    scores, indices = _index.search(q_vec, fetch_k)
    scores  = scores[0].tolist()
    indices = indices[0].tolist()

    results = []
    for score, idx in zip(scores, indices):
        if idx < 0 or score < min_score:
            continue
        chunk = _metadata[idx]
        bonus = 0.0
        if intent and intent in chunk.get("intents", []):
            bonus += 0.10
        if numbers:
            matched = len(set(numbers) & set(chunk.get("numbers", [])))
            bonus += min(matched * 0.08, 0.16)
        results.append({
            "text":    chunk["text"],
            "book":    chunk["book"].replace("-", " ").replace("_", " "),
            "score":   round(score + bonus, 4),
            "intents": chunk.get("intents", []),
            "numbers": chunk.get("numbers", []),
        })

    # Sort by adjusted score, deduplicate by first 100 chars
    results.sort(key=lambda x: x["score"], reverse=True)
    seen, deduped = set(), []
    for r in results:
        key = r["text"][:100]
        if key not in seen:
            seen.add(key)
            deduped.append(r)
        if len(deduped) >= top_k:
            break

    return deduped


def retrieve_for_rag(
    life_path: int,
    intent: str,
    tradition: str,
    question: str,
    personal_year: int | None = None,
    top_k: int = 4,
) -> str:
    """
    Build a RAG context string for injection into the LLM synthesis prompt.
    Returns formatted text ready to paste into a prompt.
    """
    # Build a rich semantic query
    py_str = f"personal year {personal_year}" if personal_year else ""
    query = (
        f"Life Path {life_path} {intent} {tradition} numerology "
        f"{py_str} {question}"
    ).strip()

    chunks = retrieve(query, intent=intent, numbers=[life_path], top_k=top_k)

    if not chunks:
        return ""

    lines = ["=== BOOK KNOWLEDGE (from your numerology library) ==="]
    for i, c in enumerate(chunks, 1):
        lines.append(f"\n[Source {i}: {c['book']}]")
        lines.append(c["text"][:600])   # cap per chunk to control token cost
    return "\n".join(lines)


def retrieve_for_ragless_anchor(
    life_path: int,
    intent: str,
    question: str,
    top_k: int = 3,
) -> str:
    """
    Retrieve short anchor facts to ground the RAGless LLM answer.
    Used as verification context — not injected verbatim, just as facts.
    """
    query = f"Life Path {life_path} {intent} numerology key rules timing"
    chunks = retrieve(query, intent=intent, numbers=[life_path], top_k=top_k, min_score=0.20)
    if not chunks:
        return ""
    return "\n".join(c["text"][:400] for c in chunks)


def retrieve_remedy(
    life_path: int,
    intent: str,
    top_k: int = 3,
) -> str:
    """
    Retrieve remedy / spiritual practice passages from the numerology book corpus.
    Used by the storytelling agent to weave a RAG-sourced remedy into the narrative.
    Returns plain text ready to inject into the LLM prompt.
    """
    query = (
        f"Life Path {life_path} remedy mantra gemstone colour daily practice "
        f"spiritual habit {intent} numerology"
    )
    chunks = retrieve(query, intent=intent, numbers=[life_path], top_k=top_k, min_score=0.20)
    if not chunks:
        return ""
    parts = []
    for c in chunks:
        parts.append(c["text"][:400])
    return "\n\n".join(parts)
