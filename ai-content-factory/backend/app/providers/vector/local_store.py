"""Local vector store — TF-IDF cosine similarity, persisted as JSON.

Local-first stand-in for Qdrant behind the same VectorStorePort.
No embedding API needed (DeepSeek has none) and no server to run.
The Qdrant adapter replaces this class without touching any agent.
"""
import asyncio
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

from app.providers.ports import VectorHit

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


class LocalVectorStore:
    def __init__(self, storage_path: Path):
        self._path = storage_path
        self._lock = asyncio.Lock()
        self._collections: dict[str, list[dict[str, Any]]] = {}
        if self._path.exists():
            try:
                self._collections = json.loads(self._path.read_text())
            except json.JSONDecodeError:
                self._collections = {}

    async def add(self, collection: str, texts: list[str], metadatas: list[dict[str, Any]]) -> None:
        async with self._lock:
            docs = self._collections.setdefault(collection, [])
            for text, metadata in zip(texts, metadatas, strict=True):
                docs.append({"text": text, "metadata": metadata})
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(self._collections, ensure_ascii=False))

    async def search(self, collection: str, query: str, k: int = 5) -> list[VectorHit]:
        docs = self._collections.get(collection, [])
        if not docs:
            return []
        query_counts = Counter(_tokenize(query))
        n_docs = len(docs)
        doc_tokens = [Counter(_tokenize(d["text"])) for d in docs]
        doc_freq: Counter[str] = Counter()
        for tokens in doc_tokens:
            doc_freq.update(tokens.keys())

        def idf(term: str) -> float:
            return math.log(1 + n_docs / (1 + doc_freq.get(term, 0)))

        def score(tokens: Counter[str]) -> float:
            dot = sum(query_counts[t] * tokens[t] * idf(t) ** 2 for t in query_counts if t in tokens)
            q_norm = math.sqrt(sum((c * idf(t)) ** 2 for t, c in query_counts.items()))
            d_norm = math.sqrt(sum((c * idf(t)) ** 2 for t, c in tokens.items()))
            return dot / (q_norm * d_norm) if q_norm and d_norm else 0.0

        scored = sorted(
            (
                VectorHit(text=doc["text"], score=score(tokens), metadata=doc["metadata"])
                for doc, tokens in zip(docs, doc_tokens, strict=True)
            ),
            key=lambda hit: hit.score,
            reverse=True,
        )
        return [hit for hit in scored[:k] if hit.score > 0]
