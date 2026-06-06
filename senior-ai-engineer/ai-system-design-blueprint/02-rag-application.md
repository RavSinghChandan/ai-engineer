# Architecture 2 — RAG Application
## Golden Memory: `Document → Chunk → Embed → Store` · `Query → Embed → Retrieve → Context → LLM`

**Use for:** enterprise chatbot · document Q&A · policy assistant · knowledge bot

---

## Architecture Flow

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INGESTION PIPELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Document Upload
   ↓
FastAPI Upload Endpoint
   ↓
File Validation
   ↓
Store Raw File (S3 / Local)
   ↓
Document Parser
   ├── PDF
   ├── DOCX
   ├── HTML
   └── TXT
   ↓
Extract Text
   ↓
Text Cleaning
   ↓
Chunking
   ├── fixed chunk
   ├── semantic chunk
   └── overlap chunks
   ↓
Embedding Model
   ↓
Vector Generation
   ↓
Vector Database Insert
   ├── Pinecone
   ├── Qdrant
   ├── Chroma
   └── pgvector

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUERY PIPELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query
   ↓
FastAPI Endpoint (/ask)
   ↓
DTO Validation
   ↓
Authentication
   ↓
Query Embedding
   ↓
Vector Similarity Search
   ↓
Top K Relevant Chunks
   ↓
(optional) Reranker
   ↓
Context Builder
   ↓
Prompt Assembly
   ├── user question
   ├── retrieved context
   └── instructions
   ↓
LLM API
   ↓
Answer Generation
   ↓
Source Attribution
   ↓
Response JSON
```

---

## Production Code

```python
# ============================================================
# RAG APPLICATION — COMPLETE PRODUCTION CODE
# Stack: FastAPI + OpenAI SDK + FAISS + Pydantic
# Pattern A (Ingestion): Document → Chunk → Embed → Store
# Pattern B (Query):     Query → Embed → Retrieve → Context → LLM
# ============================================================

import os, re, json, hashlib, tempfile, logging
from pathlib import Path
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, asdict

import numpy as np
import faiss
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request as Req
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ── 1. DOMAIN MODELS ─────────────────────────────────────────

@dataclass
class Chunk:
    chunk_id: str
    source: str
    text: str
    embedding: list[float] = field(default_factory=list)

class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)

class AskResponse(BaseModel):
    answer: str
    sources: list[str]
    tokens_used: int

# ── 2. STARTUP ────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm    = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3)
    app.state.index  = faiss.IndexFlatIP(1536)   # inner product = cosine (after normalizing)
    app.state.chunks: list[Chunk] = []            # parallel list to FAISS rows
    yield

app = FastAPI(title="RAG App", lifespan=lifespan)

# ── 3. TEXT CLEANING & CHUNKING ───────────────────────────────

def clean_text(raw: str) -> str:
    text = re.sub(r"[ \t]+", " ", raw)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def chunk_text(text: str, size: int = 1000, overlap: int = 200) -> list[str]:
    """Fixed-size character chunks with overlap."""
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += size - overlap
    return chunks

# ── 4. EMBEDDING ──────────────────────────────────────────────

async def embed_texts(texts: list[str], llm: AsyncOpenAI) -> np.ndarray:
    """Batch embed — one API call for all texts."""
    response = await llm.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    vecs = np.array(
        [item.embedding for item in sorted(response.data, key=lambda x: x.index)],
        dtype=np.float32,
    )
    faiss.normalize_L2(vecs)   # normalize for cosine similarity
    return vecs

# ── 5. INGESTION ENDPOINT ─────────────────────────────────────

@app.post("/ingest", status_code=202)
async def ingest_document(
    file: UploadFile = File(...),
    request: Req = None,
) -> dict:

    # File Validation
    if not file.filename.endswith((".txt", ".pdf")):
        raise HTTPException(400, "Only .txt and .pdf supported")

    # Extract text (simplified — real: use pdfplumber for PDF)
    content = await file.read()
    raw_text = content.decode("utf-8", errors="ignore")

    # Text Cleaning
    clean = clean_text(raw_text)

    # Chunking
    chunks_text = chunk_text(clean, size=1000, overlap=200)

    # Embedding (batch — not one-by-one)
    vectors = await embed_texts(chunks_text, request.app.state.llm)

    # Store in FAISS + metadata list
    request.app.state.index.add(vectors)
    for i, (text, vec) in enumerate(zip(chunks_text, vectors)):
        chunk = Chunk(
            chunk_id=f"{file.filename}::{i}",
            source=file.filename,
            text=text,
            embedding=vec.tolist(),
        )
        request.app.state.chunks.append(chunk)

    logger.info("ingested source=%s chunks=%d", file.filename, len(chunks_text))
    return {"status": "ingested", "chunks": len(chunks_text), "source": file.filename}

# ── 6. QUERY ENDPOINT ─────────────────────────────────────────

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2)) -> dict:
    from jose import jwt, JWTError
    try:
        return jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid token")

@app.post("/ask", response_model=AskResponse)
async def ask(
    req: AskRequest,
    request: Req,
    user: dict = Depends(get_current_user),
) -> AskResponse:

    index: faiss.IndexFlatIP = request.app.state.index
    chunks: list[Chunk]       = request.app.state.chunks
    llm: AsyncOpenAI          = request.app.state.llm

    if index.ntotal == 0:
        raise HTTPException(400, "No documents ingested yet")

    # Query Embedding
    q_vec = await embed_texts([req.question], llm)   # shape (1, 1536)

    # Vector Similarity Search — Top K
    scores, indices = index.search(q_vec, k=req.top_k)

    # Retrieve chunks
    retrieved = [chunks[i] for i in indices[0] if i < len(chunks)]

    # (Optional) Reranker — sort by score descending
    ranked = sorted(
        zip(scores[0], retrieved),
        key=lambda x: x[0], reverse=True
    )

    # Context Builder
    context = "\n\n---\n\n".join(chunk.text for _, chunk in ranked)
    sources  = list({chunk.source for _, chunk in ranked})

    # Prompt Assembly
    system = (
        "You are a helpful assistant. Answer ONLY using the provided context. "
        "If the context does not contain the answer, say 'I don't know'."
    )
    user_message = f"Context:\n{context}\n\nQuestion: {req.question}"

    # LLM API
    response = await llm.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user_message},
        ],
        temperature=0.2,
    )

    answer = response.choices[0].message.content.strip()
    tokens = response.usage.total_tokens

    logger.info("rag user=%s question=%.40s sources=%s tokens=%d",
                user.get("sub"), req.question, sources, tokens)

    return AskResponse(answer=answer, sources=sources, tokens_used=tokens)


# ── INTERVIEW CHEAT SHEET ─────────────────────────────────────
# Q: "Walk me through a RAG system."
#
# INGESTION:
# "Upload hits FastAPI, text is extracted, cleaned, chunked at 1000 chars
#  with 200-char overlap so sentences aren't cut at boundaries.
#  Batch embed with text-embedding-3-small — one API call for all chunks.
#  Vectors are L2-normalized then stored in FAISS IndexFlatIP so inner
#  product equals cosine similarity."
#
# QUERY:
# "User query is embedded with the same model.
#  FAISS returns top-K by cosine similarity.
#  (Optional) reranker re-scores by relevance — CrossEncoder is common.
#  Context is assembled from retrieved chunk texts.
#  System prompt instructs LLM to answer ONLY from context — this is
#  the hallucination guard. LLM generates the answer with source attribution."
#
# Metrics: faithfulness (RAGAS), retrieval precision, latency, cost/query.
```
