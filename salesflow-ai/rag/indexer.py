"""
Build the FAISS index from corpus text files.
Run once: python -m rag.indexer
"""
import os
import pickle
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

CORPUS_DIR = Path(__file__).parent / "corpus"
INDEX_PATH = Path(__file__).parent / "index.faiss"
CHUNKS_PATH = Path(__file__).parent / "chunks.pkl"
MODEL_NAME = "all-MiniLM-L6-v2"
CHUNK_SEPARATOR = "\n---\n"


def load_corpus() -> list[str]:
    chunks = []
    for fpath in sorted(CORPUS_DIR.glob("*.txt")):
        text = fpath.read_text(encoding="utf-8")
        for chunk in text.split(CHUNK_SEPARATOR):
            chunk = chunk.strip()
            if chunk:
                chunks.append(chunk)
    return chunks


def build_index(chunks: list[str], model: SentenceTransformer) -> faiss.IndexFlatL2:
    embeddings = model.encode(chunks, show_progress_bar=True, convert_to_numpy=True)
    embeddings = embeddings.astype(np.float32)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    return index


def save(index: faiss.IndexFlatL2, chunks: list[str]) -> None:
    faiss.write_index(index, str(INDEX_PATH))
    with open(CHUNKS_PATH, "wb") as f:
        pickle.dump(chunks, f)
    print(f"Saved index ({index.ntotal} vectors) → {INDEX_PATH}")
    print(f"Saved {len(chunks)} chunks → {CHUNKS_PATH}")


if __name__ == "__main__":
    print("Loading corpus…")
    chunks = load_corpus()
    print(f"  {len(chunks)} chunks found")
    print("Encoding with SentenceTransformer…")
    model = SentenceTransformer(MODEL_NAME)
    index = build_index(chunks, model)
    save(index, chunks)
    print("Done.")
