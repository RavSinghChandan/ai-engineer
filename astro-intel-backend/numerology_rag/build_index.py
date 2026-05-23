"""
Step 2 — Embed all chunks and build FAISS index.
Saves: numerology_rag/index/  (faiss.index + metadata.json)
Uses: sentence-transformers all-MiniLM-L6-v2 (fast, good quality, free)
"""
from __future__ import annotations
import json
import numpy as np
from pathlib import Path

import faiss
from sentence_transformers import SentenceTransformer

CORPUS_DIR = Path(__file__).parent / "corpus"
INDEX_DIR  = Path(__file__).parent / "index"
INDEX_DIR.mkdir(parents=True, exist_ok=True)

MODEL_NAME = "all-MiniLM-L6-v2"   # 384-dim, fast, runs on CPU, ~80MB

def main():
    # Load chunks
    chunks_path = CORPUS_DIR / "all_chunks.jsonl"
    chunks = [json.loads(l) for l in chunks_path.read_text().splitlines() if l.strip()]
    print(f"Loaded {len(chunks)} chunks")

    # Load embedding model
    print(f"Loading embedding model: {MODEL_NAME} ...")
    model = SentenceTransformer(MODEL_NAME)

    # Embed all chunks (batch for speed)
    texts = [c["text"] for c in chunks]
    print(f"Embedding {len(texts)} chunks ...")
    embeddings = model.encode(texts, batch_size=64, show_progress_bar=True,
                               convert_to_numpy=True, normalize_embeddings=True)

    print(f"Embedding shape: {embeddings.shape}")

    # Build FAISS index (Inner Product = cosine similarity since embeddings are normalized)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings.astype(np.float32))
    print(f"FAISS index built: {index.ntotal} vectors, dim={dim}")

    # Save index
    faiss.write_index(index, str(INDEX_DIR / "faiss.index"))

    # Save metadata (parallel to index — same order)
    metadata = [{
        "chunk_id":   c["chunk_id"],
        "book":       c["book"],
        "intents":    c["intents"],
        "numbers":    c["numbers"],
        "word_count": c["word_count"],
        "text":       c["text"],
    } for c in chunks]
    (INDEX_DIR / "metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )

    print(f"\nIndex saved to: {INDEX_DIR / 'faiss.index'}")
    print(f"Metadata saved to: {INDEX_DIR / 'metadata.json'}")
    print("Done.")


if __name__ == "__main__":
    main()
