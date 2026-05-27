# Python for AI Engineering — Phase 4
# Lesson 2: Embedding Pipelines — Chunking, Batching, Preprocessing, Vector Creation

---

## 1. Intuition (Java Anchor)

Java ETL pipeline: read source → transform records → write to sink. An embedding pipeline is the same pattern: read documents → chunk text → preprocess → batch-embed → store vectors.

The difference: Java ETL operates on structured rows. Embedding pipelines operate on unstructured text, and the chunking strategy directly affects retrieval quality in RAG.

| Java Pattern | Embedding Pipeline Equivalent |
|---|---|
| Read file → process line by line | Load document → split into chunks |
| `String.split("\n")` | `RecursiveCharacterTextSplitter` |
| `List<String> batch = new ArrayList<>()` | `chunks[i:i+batch_size]` |
| `ExecutorService.submit(task)` | `asyncio.gather(*embed_tasks)` |
| Jackson `ObjectMapper.writeValue(file, obj)` | `json.dump(chunk_data, f)` |
| `PreparedStatement.executeBatch()` | `client.embeddings.create(input=batch)` |
| Repository pattern `save(List<Entity>)` | Vector DB `upsert(vectors)` |

---

## 2. Text Chunking — Core Strategy

```python
# Why chunk? LLMs and embedding models have token limits.
# A 50-page PDF must be split into retrievable pieces.
# Chunk size and overlap are the most important tuning parameters.

# Strategy 1: Fixed-size character chunking (simplest)
def chunk_by_characters(text: str, size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks of fixed character length."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap   # overlap: slide back by 'overlap' chars
    return chunks

# Strategy 2: Sentence-aware chunking (better for retrieval)
import re

def chunk_by_sentences(text: str, max_chars: int = 1000, overlap_sentences: int = 1) -> list[str]:
    """Split at sentence boundaries — preserves semantic coherence."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks = []
    current_chunk = []
    current_len = 0

    for sentence in sentences:
        if current_len + len(sentence) > max_chars and current_chunk:
            chunks.append(" ".join(current_chunk))
            # Keep last N sentences as overlap (Java: subList for overlap)
            current_chunk = current_chunk[-overlap_sentences:]
            current_len = sum(len(s) for s in current_chunk)

        current_chunk.append(sentence)
        current_len += len(sentence)

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks

# Strategy 3: Paragraph chunking (best for structured documents)
def chunk_by_paragraphs(text: str, max_chars: int = 1500) -> list[str]:
    """Split on double newlines — preserves document structure."""
    paragraphs = re.split(r"\n\n+", text.strip())
    chunks = []
    current = []
    current_len = 0

    for para in paragraphs:
        if current_len + len(para) > max_chars and current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(para)
        current_len += len(para)

    if current:
        chunks.append("\n\n".join(current))

    return chunks
```

---

## 3. Document Preprocessing — Clean Before Embedding

```python
import re

# Raw text from PDF extractors is noisy — clean it before embedding
# Java analogy: data cleansing before loading into a data warehouse

def preprocess_document(raw_text: str) -> str:
    """Normalize document text for consistent embeddings."""
    # Remove excessive whitespace
    text = re.sub(r"[ \t]+", " ", raw_text)        # collapse spaces/tabs
    text = re.sub(r"\n{3,}", "\n\n", text)          # max 2 consecutive newlines

    # Remove page numbers / headers (PDF artifacts)
    text = re.sub(r"^\s*\d+\s*$", "", text, flags=re.MULTILINE)   # lines with only numbers
    text = re.sub(r"Page \d+ of \d+", "", text, flags=re.IGNORECASE)

    # Normalize unicode characters (curly quotes → straight)
    text = text.replace("‘", "'").replace("’", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-")

    return text.strip()

def extract_metadata(filename: str, chunk_index: int, total_chunks: int) -> dict:
    """Build metadata dict to store alongside each chunk vector."""
    return {
        "source": filename,
        "chunk_index": chunk_index,
        "total_chunks": total_chunks,
        "chunk_id": f"{filename}::{chunk_index}",
    }
```

---

## 4. Batched Embedding — Efficient API Usage

```python
from openai import OpenAI, AsyncOpenAI
from typing import Iterator
import asyncio

client    = OpenAI()
async_client = AsyncOpenAI()

# BAD — one API call per chunk (100 chunks = 100 API calls):
def embed_one_by_one(chunks: list[str]) -> list[list[float]]:
    return [
        client.embeddings.create(model="text-embedding-3-small", input=chunk)
        .data[0].embedding
        for chunk in chunks
    ]

# GOOD — batch API call (100 chunks = 1 API call, 100x cheaper):
def embed_batch(chunks: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    """Embed a list of chunks in one API call. Returns embeddings in input order."""
    response = client.embeddings.create(model=model, input=chunks)
    # Sort by index — API guarantees order but defensive sort is cheap:
    return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]

# Chunked batching — OpenAI limit is 2048 inputs per call, ~8192 tokens per input:
def embed_in_batches(
    chunks: list[str],
    batch_size: int = 100,
    model: str = "text-embedding-3-small",
) -> list[list[float]]:
    """Process large document sets in batches — Java: process list in sublists."""
    all_embeddings = []
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        embeddings = embed_batch(batch, model)
        all_embeddings.extend(embeddings)
    return all_embeddings

# Async batching with concurrency control:
async def embed_batches_async(
    chunks: list[str],
    batch_size: int = 100,
    max_concurrent: int = 5,          # rate limit guard
    model: str = "text-embedding-3-small",
) -> list[list[float]]:
    semaphore = asyncio.Semaphore(max_concurrent)   # Java: Semaphore(5)

    async def embed_one_batch(batch: list[str]) -> list[list[float]]:
        async with semaphore:
            response = await async_client.embeddings.create(model=model, input=batch)
            return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]

    batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]
    results = await asyncio.gather(*[embed_one_batch(b) for b in batches])

    # Flatten list of lists (Java: Stream.flatMap):
    return [emb for batch_result in results for emb in batch_result]
```

---

## 5. Full Pipeline — Document to Stored Vectors

```python
import json
from pathlib import Path
from dataclasses import dataclass, asdict
from openai import OpenAI
import numpy as np

client = OpenAI()

@dataclass
class EmbeddedChunk:
    chunk_id: str
    source: str
    chunk_index: int
    text: str
    embedding: list[float]

def build_embedding_pipeline(
    document_text: str,
    source_name: str,
    chunk_size: int = 1000,
    overlap: int = 200,
    model: str = "text-embedding-3-small",
) -> list[EmbeddedChunk]:
    """
    Full pipeline: raw text → preprocessed → chunked → embedded.
    Returns list of EmbeddedChunk ready for vector store upsert.
    """
    # Step 1: preprocess
    clean_text = preprocess_document(document_text)

    # Step 2: chunk
    chunks = chunk_by_characters(clean_text, size=chunk_size, overlap=overlap)

    # Step 3: batch embed
    embeddings = embed_in_batches(chunks, batch_size=100, model=model)

    # Step 4: package with metadata
    return [
        EmbeddedChunk(
            chunk_id=f"{source_name}::{i}",
            source=source_name,
            chunk_index=i,
            text=chunk,
            embedding=emb,
        )
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]

# Persist to disk (to avoid re-embedding on restart):
def save_embedded_chunks(chunks: list[EmbeddedChunk], path: Path) -> None:
    data = [asdict(c) for c in chunks]
    with open(path, "w") as f:
        json.dump(data, f)

def load_embedded_chunks(path: Path) -> list[EmbeddedChunk]:
    with open(path) as f:
        return [EmbeddedChunk(**item) for item in json.load(f)]

# Extract numpy matrix for FAISS:
def to_numpy_matrix(chunks: list[EmbeddedChunk]) -> np.ndarray:
    return np.array([c.embedding for c in chunks], dtype=np.float32)
```

---

## 6. Token-Aware Chunking

```python
# OpenAI embedding model: max 8192 tokens per input
# Characters are NOT tokens — 1 token ≈ 4 characters in English
# For safety: chunk by estimated tokens, not raw characters

import tiktoken

def count_tokens(text: str, model: str = "text-embedding-3-small") -> int:
    """Count exact tokens for a string (Java: no built-in — must use tiktoken)."""
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))

def chunk_by_tokens(
    text: str,
    max_tokens: int = 512,
    overlap_tokens: int = 50,
    model: str = "text-embedding-3-small",
) -> list[str]:
    """Token-aware chunking — guarantees no chunk exceeds model limit."""
    enc = tiktoken.encoding_for_model(model)
    tokens = enc.encode(text)
    chunks = []
    start = 0

    while start < len(tokens):
        end = min(start + max_tokens, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(enc.decode(chunk_tokens))
        start += max_tokens - overlap_tokens

    return chunks

# Common settings:
# RAG retrieval: 256–512 tokens (smaller = more precise retrieval)
# Summarization context: 2048–4096 tokens (larger = more coherent summaries)
# CV analysis: 512 tokens (paragraphs of experience fit cleanly)
```

---

## 7. Pipeline with Progress Tracking

```python
import time
import logging

logger = logging.getLogger(__name__)

def run_pipeline_with_metrics(
    documents: list[tuple[str, str]],   # (source_name, raw_text)
    output_dir: Path,
    chunk_size: int = 1000,
) -> dict:
    """
    Process multiple documents with token and cost tracking.
    Java: like a batch job with progress counters.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    total_chunks = 0
    total_tokens = 0
    start = time.perf_counter()

    for source_name, raw_text in documents:
        chunks_path = output_dir / f"{source_name}_chunks.json"

        if chunks_path.exists():
            logger.info(f"Skipping {source_name} — already embedded")
            continue

        embedded = build_embedding_pipeline(raw_text, source_name, chunk_size)
        save_embedded_chunks(embedded, chunks_path)

        # Approximate token cost: 1 token ≈ 4 chars, $0.00002/1K tokens
        approx_tokens = sum(len(c.text) // 4 for c in embedded)
        total_chunks += len(embedded)
        total_tokens += approx_tokens

        logger.info(
            "embedded source=%s chunks=%d approx_tokens=%d",
            source_name, len(embedded), approx_tokens,
        )

    elapsed = time.perf_counter() - start
    return {
        "documents": len(documents),
        "total_chunks": total_chunks,
        "approx_tokens": total_tokens,
        "approx_cost_usd": total_tokens / 1_000_000 * 0.02,
        "elapsed_seconds": round(elapsed, 2),
    }
```

---

## 8. Interview Anchor

**"How do you build an embedding pipeline for a production RAG system?"**

Say:
> "Four stages. First, preprocess: clean the raw text — collapse whitespace, remove PDF artifacts, normalize unicode — so the embedding model sees consistent input. Second, chunk: I use sentence-aware or token-aware chunking with 512 tokens and 50-token overlap — smaller chunks improve retrieval precision, the overlap ensures a sentence split at a boundary doesn't lose context. Third, batch embed: OpenAI's embedding API takes up to 2048 inputs per call, so I never embed one-by-one — I batch in groups of 100, and if processing many documents in parallel I use `asyncio.gather` with a Semaphore to cap concurrency and avoid hitting rate limits. Fourth, persist: I serialize the chunks and embeddings to disk so I don't re-embed the same document on every restart — Parquet or JSON depending on the size. The metric I track is cost: 1 token ≈ 4 characters, text-embedding-3-small is $0.02/million tokens — for 10,000 CVs that's roughly $5 total, so batching matters for cost, not just speed."

---

## 9. Quick Reference

```python
# Chunking
chunks = chunk_by_characters(text, size=1000, overlap=200)
chunks = chunk_by_sentences(text, max_chars=1000, overlap_sentences=1)
chunks = chunk_by_tokens(text, max_tokens=512, overlap_tokens=50)

# Single batch embed
embeddings = embed_batch(chunks)          # list[list[float]]

# Large document embed (in batches)
embeddings = embed_in_batches(chunks, batch_size=100)

# Async parallel embed
embeddings = await embed_batches_async(chunks, batch_size=100, max_concurrent=5)

# Full pipeline
embedded_chunks = build_embedding_pipeline(raw_text, "cv_ravi", chunk_size=1000)

# Persist / load
save_embedded_chunks(embedded_chunks, Path("data/ravi_chunks.json"))
embedded_chunks = load_embedded_chunks(Path("data/ravi_chunks.json"))

# To numpy for FAISS
matrix = to_numpy_matrix(embedded_chunks)   # shape: (N, 1536)

# Token count
n = count_tokens(text, model="text-embedding-3-small")

# Java comparison
# chunk_by_characters()     → String.substring() with sliding window
# embed_in_batches()        → PreparedStatement.executeBatch()
# asyncio.Semaphore(5)      → new Semaphore(5) for concurrency control
# save_embedded_chunks()    → objectMapper.writeValue(file, list)
# to_numpy_matrix()         → double[][] from List<double[]>
```
