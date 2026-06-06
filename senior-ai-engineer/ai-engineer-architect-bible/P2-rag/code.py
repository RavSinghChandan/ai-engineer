"""
P2 — RAG APPLICATION
Golden Memory: Retrieve → Rank → Augment → Generate
Stack: FastAPI + AsyncOpenAI + FAISS + sentence-transformers (reranker)
================================================================
HOW TO USE THIS FILE:
  - Each section is labelled. Read top to bottom once.
  - Copy any section directly into your project.
  - INGESTION PIPELINE: Sections 1-5
  - QUERY PIPELINE:     Sections 6-10
  - To ADD a new vector DB: replace Section 4 (Vector Store)
  - To ADD a new reranker:  replace Section 7 (Reranker)
================================================================
"""

import os, io, json, logging
from pathlib import Path
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import faiss
import redis.asyncio as aioredis
from fastapi import FastAPI, Depends, HTTPException, Request as Req, UploadFile, File
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ================================================================
# SECTION 1 — REQUEST / RESPONSE MODELS (Pydantic DTOs)
# ================================================================

class IngestResponse(BaseModel):
    status:         str
    filename:       str
    chunks_created: int

class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)

class SourceChunk(BaseModel):
    text:   str
    source: str
    score:  float

class QueryResponse(BaseModel):
    answer:  str
    sources: list[SourceChunk]

ALLOWED_TYPES = {".txt", ".pdf", ".docx", ".md"}
MAX_FILE_SIZE  = 20 * 1024 * 1024   # 20 MB
EMBEDDING_MODEL = "text-embedding-3-small"  # MUST be same for ingest + query


# ================================================================
# SECTION 2 — DOCUMENT PARSER
# ================================================================
# Extracts plain text from PDF, DOCX, or text files.

async def parse_document(content: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception as e:
            raise HTTPException(422, f"PDF parse error: {e}")
    elif ext == ".docx":
        try:
            from docx import Document
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
        except Exception as e:
            raise HTTPException(422, f"DOCX parse error: {e}")
    else:
        return content.decode("utf-8", errors="ignore")


# ================================================================
# SECTION 3 — TEXT CHUNKER
# ================================================================
# Splits text into overlapping chunks.
# Overlap preserves context at chunk boundaries.

@dataclass
class Chunk:
    text:   str
    index:  int
    source: str

def chunk_text(
    text:       str,
    source:     str,
    chunk_size: int = 800,
    overlap:    int = 150,
) -> list[Chunk]:
    """
    Split text into chunks with overlap.
    overlap=150 means the last 150 chars of chunk N
    are also the first 150 chars of chunk N+1.
    This prevents losing context at boundaries.
    """
    chunks = []
    start  = 0
    idx    = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(Chunk(text=text[start:end], index=idx, source=source))
        start += chunk_size - overlap
        idx   += 1
    return chunks


# ================================================================
# SECTION 4 — VECTOR STORE (FAISS)
# ================================================================
# Stores and searches chunk embeddings.
# To swap to Pinecone/Weaviate: replace this class.

class VectorStore:
    """
    In-process FAISS vector store.
    For production scale: replace with Pinecone, Weaviate, or pgvector.
    """

    def __init__(self, dim: int = 1536):
        self.index: faiss.Index         = faiss.IndexFlatIP(dim)
        self.metadata: list[dict]       = []  # stores text + source per vector

    def upsert(self, embeddings: list[list[float]], chunks: list[Chunk]) -> None:
        vecs = np.array(embeddings, dtype=np.float32)
        faiss.normalize_L2(vecs)          # L2 norm → inner product = cosine
        self.index.add(vecs)
        for c in chunks:
            self.metadata.append({"text": c.text, "source": c.source})

    def search(self, query_vec: np.ndarray, top_k: int = 5) -> list[dict]:
        faiss.normalize_L2(query_vec)
        scores, indices = self.index.search(query_vec, top_k)
        results = []
        for j, i in enumerate(indices[0]):
            if i < len(self.metadata):
                results.append({
                    "text":   self.metadata[i]["text"],
                    "source": self.metadata[i]["source"],
                    "score":  float(scores[0][j]),
                })
        return results

    @property
    def size(self) -> int:
        return self.index.ntotal


# ================================================================
# SECTION 5 — EMBEDDING HELPER
# ================================================================
# To change model: update EMBEDDING_MODEL constant at the top.
# MUST use the same model for ingestion and query.

async def embed_texts(texts: list[str], llm: AsyncOpenAI, batch_size: int = 100) -> list[list[float]]:
    embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        resp  = await llm.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        embeddings.extend([d.embedding for d in resp.data])
    return embeddings

async def embed_query(text: str, llm: AsyncOpenAI) -> np.ndarray:
    resp = await llm.embeddings.create(model=EMBEDDING_MODEL, input=[text])
    vec  = np.array([resp.data[0].embedding], dtype=np.float32)
    faiss.normalize_L2(vec)
    return vec


# ================================================================
# SECTION 6 — RERANKER (cross-encoder)
# ================================================================
# Re-scores retrieved chunks by relevance to the FULL query.
# Vector search = recall. Reranker = precision.
# To use a different model: change the model name below.

def get_reranker():
    """Lazy-load the cross-encoder so it doesn't block startup."""
    from sentence_transformers import CrossEncoder
    return CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

_reranker = None

def rerank(query: str, results: list[dict], top_n: int = 3) -> list[dict]:
    global _reranker
    if _reranker is None:
        _reranker = get_reranker()
    pairs  = [(query, r["text"]) for r in results]
    scores = _reranker.predict(pairs)
    for r, s in zip(results, scores):
        r["rerank_score"] = float(s)
    return sorted(results, key=lambda x: x["rerank_score"], reverse=True)[:top_n]


# ================================================================
# SECTION 7 — CONTEXT BUILDER  ← YOUR SKILL
# ================================================================
# Assembles retrieved chunks into the LLM prompt.
# The grounding instruction is the most important line.

def build_rag_messages(query: str, chunks: list[dict]) -> list[dict]:
    """
    Build the messages list for a RAG LLM call.

    CRITICAL: always include the 'ONLY' and 'I don't know' instructions.
    Without them the LLM will use training data and hallucinate.
    """
    context_lines = []
    for i, c in enumerate(chunks, 1):
        score = c.get("rerank_score", c.get("score", 0.0))
        context_lines.append(
            f"[Source {i}: {c['source']} | score={score:.2f}]\n{c['text']}"
        )
    context = "\n\n".join(context_lines)

    return [
        {
            "role":    "system",
            "content": (
                "Answer the question using ONLY the context below. "
                "If the answer is not in the context, say 'I don't know.' "
                "Always cite which source you used.\n\n"
                f"CONTEXT:\n{context}"
            ),
        },
        {"role": "user", "content": query},
    ]


# ================================================================
# SECTION 8 — APP STARTUP
# ================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm   = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3, timeout=60.0)
    app.state.store = VectorStore()
    yield

app = FastAPI(title="RAG App", lifespan=lifespan)


# ================================================================
# SECTION 9 — AUTH
# ================================================================

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")


# ================================================================
# SECTION 10 — INGESTION ENDPOINT
# ================================================================

@app.post("/ingest", response_model=IngestResponse)
async def ingest_document(
    file:    UploadFile = File(...),
    request: Req        = None,
    user:    dict       = Depends(get_current_user),
) -> IngestResponse:

    # Validate
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {ALLOWED_TYPES}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large (max 20 MB)")

    # Parse → Chunk → Embed → Store
    text      = await parse_document(content, file.filename)
    chunks    = chunk_text(text, source=file.filename)
    texts     = [c.text for c in chunks]
    embeddings = await embed_texts(texts, request.app.state.llm)
    request.app.state.store.upsert(embeddings, chunks)

    logger.info("ingested file=%s chunks=%d user=%s", file.filename, len(chunks), user.get("sub"))

    return IngestResponse(status="success", filename=file.filename, chunks_created=len(chunks))


# ================================================================
# SECTION 11 — QUERY ENDPOINT
# ================================================================

@app.post("/query", response_model=QueryResponse)
async def query_rag(
    req:     QueryRequest,
    request: Req,
    user:    dict = Depends(get_current_user),
) -> QueryResponse:

    store = request.app.state.store
    llm   = request.app.state.llm

    if store.size == 0:
        raise HTTPException(400, "No documents indexed. Upload documents first via POST /ingest")

    # Embed query → Vector search → Rerank
    q_vec   = await embed_query(req.question, llm)
    results = store.search(q_vec, top_k=5)
    ranked  = rerank(req.question, results, top_n=3)

    # Build RAG prompt → LLM call
    messages = build_rag_messages(req.question, ranked)

    try:
        response = await llm.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.0,    # factual — no creativity
            max_tokens=1024,
        )
    except Exception as e:
        logger.error("LLM error: %s", e)
        raise HTTPException(502, "LLM unavailable")

    answer = (response.choices[0].message.content or "").strip()
    if not answer:
        raise HTTPException(500, "Empty LLM response")

    logger.info("query user=%s question_len=%d sources=%d", user.get("sub"), len(req.question), len(ranked))

    sources = [SourceChunk(text=r["text"], source=r["source"], score=r.get("rerank_score", r["score"])) for r in ranked]
    return QueryResponse(answer=answer, sources=sources)


# ================================================================
# SECTION 12 — VARIANTS
# ================================================================

# VARIANT A: HYBRID SEARCH (BM25 + vector)
# Use when keyword matching matters (legal, code search)
# ─────────────────────────────────────────────────────

# from rank_bm25 import BM25Okapi
#
# class HybridVectorStore(VectorStore):
#     def __init__(self, *args, **kwargs):
#         super().__init__(*args, **kwargs)
#         self.corpus: list[str] = []
#
#     def upsert(self, embeddings, chunks):
#         super().upsert(embeddings, chunks)
#         self.corpus.extend([c.text for c in chunks])
#
#     def hybrid_search(self, query: str, query_vec: np.ndarray, top_k: int = 5) -> list[dict]:
#         # BM25 keyword scores
#         bm25 = BM25Okapi([doc.split() for doc in self.corpus])
#         bm25_scores = bm25.get_scores(query.split())
#
#         # Vector scores
#         vector_results = self.search(query_vec, top_k=top_k * 2)
#
#         # Merge with RRF (Reciprocal Rank Fusion)
#         # ... merge logic here ...
#         return vector_results


# VARIANT B: STRUCTURED QUERY RESPONSE
# Returns typed source citations
# ─────────────────────────────────────

# class DetailedSourceChunk(BaseModel):
#     text:          str
#     source:        str
#     vector_score:  float
#     rerank_score:  float
#     chunk_index:   int
