# Senior AI Engineer — Module 5
# Topic: Chat with PDF at Scale — Full Production Design

---

## 1. Intuition

"Chat with PDF" is the hello-world of RAG systems. Every candidate builds one.
What separates a senior AI engineer is designing it for 10,000 users, 50,000 PDFs, multi-tenancy, freshness, and sub-2-second responses.

---

## 2. Core Concept

The basic pipeline is known. The senior version adds: scale, multi-tenancy, access control, freshness, observability.

Basic:
```
PDF → extract text → chunk → embed → FAISS → user asks question → retrieve → LLM → answer
```

Production:
```
PDF uploaded → async ingestion job → S3 storage → chunk + embed → Pinecone (per-tenant namespace)
↓
User query → auth check → retrieve from tenant namespace → rerank → LLM with citation → response
↓
Logging → RAGAS eval → cost tracking → latency monitoring
```

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER                                                 │
│  PDF upload API → S3 → ingestion queue (SQS/Kafka)             │
│  → worker: extract text (PyMuPDF) → clean → chunk → embed       │
│  → Pinecone upsert (namespace = tenant_id + doc_id)             │
│  → metadata DB: doc_id, tenant_id, filename, uploaded_at,       │
│                  num_chunks, status, last_embedded_at            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  QUERY LAYER                                                     │
│  User query → auth (JWT) → rate limiter                         │
│  → embed query → Pinecone search (filter: tenant_id)            │
│  → reranker → top-5 chunks                                      │
│  → LLM (GPT-4o-mini) with citation instruction                  │
│  → response + source references                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  OBSERVABILITY                                                   │
│  Every query: log user_id, doc_ids, retrieved_chunks, answer,   │
│  faithfulness_score, latency, token_cost                        │
│  Dashboard: RAGAS metrics, cost/day, P95 latency               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Why / When

This system design covers most enterprise AI features: contract review, internal knowledge base, support documentation, HR policy chatbot.

Design decisions that differ from the demo:
- Async ingestion: uploading a 200-page PDF takes 30+ seconds to process. Never do this synchronously on the upload API call.
- Per-tenant namespace: strict data isolation — no user can retrieve another tenant's document content.
- Access control on chunks: even within a tenant, some documents may have role-based access (HR-only, finance-only).

---

## 5. Code Skeleton (Production-Grade)

```python
# Ingestion service
import boto3
import uuid
from fastapi import UploadFile, BackgroundTasks

s3 = boto3.client("s3")

async def upload_document(file: UploadFile, tenant_id: str, user_id: str, background_tasks: BackgroundTasks):
    doc_id = str(uuid.uuid4())
    s3_key = f"{tenant_id}/{doc_id}/{file.filename}"
    
    # Store raw file
    content = await file.read()
    s3.put_object(Bucket="documents-bucket", Key=s3_key, Body=content)
    
    # Record in metadata DB
    db.execute(
        "INSERT INTO documents (doc_id, tenant_id, user_id, filename, s3_key, status) VALUES (?, ?, ?, ?, ?, ?)",
        (doc_id, tenant_id, user_id, file.filename, s3_key, "pending")
    )
    
    # Queue async ingestion
    background_tasks.add_task(ingest_document, doc_id, tenant_id, s3_key)
    
    return {"doc_id": doc_id, "status": "processing"}

def ingest_document(doc_id: str, tenant_id: str, s3_key: str):
    try:
        # Download and extract text
        obj = s3.get_object(Bucket="documents-bucket", Key=s3_key)
        pdf_bytes = obj["Body"].read()
        text = extract_text_from_pdf(pdf_bytes)
        
        # Chunk
        chunks = chunk_document_standard(text, chunk_size=512, overlap=64)
        
        # Embed in batches
        chunk_texts = [c for c in chunks]
        embeddings = embed_batch(chunk_texts)
        
        # Upsert to Pinecone with tenant namespace
        vectors = [
            {
                "id": f"{doc_id}_{i}",
                "values": embedding,
                "metadata": {
                    "doc_id": doc_id,
                    "tenant_id": tenant_id,
                    "chunk_index": i,
                    "text": chunk_texts[i][:1000],  # store text in metadata for retrieval
                    "source": s3_key
                }
            }
            for i, embedding in enumerate(embeddings)
        ]
        pinecone_index.upsert(vectors=vectors, namespace=tenant_id)
        
        # Update status
        db.execute("UPDATE documents SET status='ready', num_chunks=? WHERE doc_id=?", (len(chunks), doc_id))
        
    except Exception as e:
        logger.error(f"Ingestion failed for {doc_id}: {e}")
        db.execute("UPDATE documents SET status='failed' WHERE doc_id=?", (doc_id,))

# Query service
def query_documents(query: str, tenant_id: str, doc_ids: list[str] = None) -> dict:
    # Embed query
    query_vector = embed_text(query)
    
    # Build filter — always scope to tenant
    filter_dict = {"tenant_id": {"$eq": tenant_id}}
    if doc_ids:
        filter_dict["doc_id"] = {"$in": doc_ids}
    
    # Retrieve
    results = pinecone_index.query(
        vector=query_vector,
        top_k=10,
        namespace=tenant_id,
        filter=filter_dict,
        include_metadata=True
    )
    
    # Filter by score threshold
    relevant = [r for r in results.matches if r.score >= 0.75]
    
    if not relevant:
        return {"answer": "No relevant information found in the provided documents.", "sources": []}
    
    # Build context with citations
    context_parts = []
    sources = []
    for i, match in enumerate(relevant[:5]):
        context_parts.append(f"[{i+1}] {match.metadata['text']}")
        sources.append({"ref": i+1, "doc_id": match.metadata["doc_id"], "source": match.metadata["source"]})
    
    context = "\n\n".join(context_parts)
    
    answer = call_llm(
        "Answer the question based on the provided context. Cite sources as [1], [2] etc.",
        f"Context:\n{context}\n\nQuestion: {query}"
    )
    
    return {"answer": answer, "sources": sources, "retrieved_count": len(relevant)}
```

---

## 6. Example — Interview Answer for "Design Chat with PDF"

When asked this in an interview, structure your answer in 5 minutes:

**Minute 1 — Clarify:**
"How many users? How many PDFs per user? Multi-tenant? Real-time indexing or batch? What latency SLA?"

**Minute 2 — Ingestion pipeline:**
"Upload to S3, async ingestion job: extract text → chunk at 512 tokens with 64 overlap → embed with text-embedding-3-small → upsert to Pinecone with tenant namespace. Status tracking in DB."

**Minute 3 — Query pipeline:**
"Embed query → Pinecone search filtered to tenant namespace → threshold at 0.75 → reranker → top-5 chunks → GPT-4o-mini with citation instruction → response + source refs."

**Minute 4 — Production hardening:**
"Async ingestion so upload API returns immediately. Per-tenant namespace for isolation. Faithfulness scoring before response. Cost tracking per query. RAGAS eval weekly."

**Minute 5 — Scale:**
"At 10K users × 100 docs × 50 queries/day: Pinecone serverless handles the vector scale. Ingestion workers scale horizontally via queue. LLM cost: 50K queries × 700 avg tokens × $0.15/1M = $5.25/day on mini."

---

## 7. Trade-offs

FAISS vs Pinecone for production:
FAISS: free, in-process, but no multi-tenancy, no persistence guarantees, no managed scaling.
Pinecone: $70+/month but managed, real-time updates, native namespaces, no ops overhead.
Decision: single-user demo → FAISS. Multi-tenant production → Pinecone or Qdrant.

Sync vs async ingestion:
Sync: simpler, user waits. Fails for large PDFs (timeout before indexing completes).
Async: always right for production. User gets immediate response, webhook/polling when indexing is done.

---

## 8. Interview Questions (Senior Level)

- Design a system where 10,000 users can each upload documents and query only their own files.

  **Answer:** Per-user namespace isolation in Pinecone (or per-tenant collection in Qdrant), asynchronous ingestion via queue (Celery + Redis) so upload API returns immediately with a job ID, and a metadata DB (Postgres) storing doc_id → user_id mapping for authorization checks on every query. The query flow adds a mandatory `tenant_id` filter on every vector search — even if a user somehow obtains another user's doc_id, the namespace filter ensures they cannot retrieve those vectors. The same pattern applies in Bench Resource Optimizer: every employee CV search is filtered by `org_id` before any vector similarity comparison runs.

- How do you handle a 500-page PDF upload without timing out?

  **Answer:** Async ingestion: the upload endpoint accepts the file, stores it in S3/object storage, queues an ingestion job, and returns a 202 Accepted with a job ID immediately. The ingestion worker processes the PDF in the background: extract text with PyMuPDF, chunk, embed in batches, upsert to vector store. For 500 pages at ~500 tokens/page = 250K tokens of embedding calls — at batch size 100, this takes 30-60 seconds on the worker, never touching the upload timeout. The user polls or receives a webhook notification when indexing is complete. Sync ingestion for 500 pages will always timeout at any normal HTTP gateway.

- How do you ensure a user cannot retrieve another user's documents?

  **Answer:** Three-layer isolation: (1) namespace or collection per user/tenant in the vector store — searches are scoped at the store level; (2) metadata filter on every query enforcing `user_id = current_user` even within a shared namespace; (3) authorization check in the application layer before the vector search runs, verifying the queried doc_id belongs to the requesting user. Defense in depth: any single layer failing doesn't expose data because two other layers still enforce isolation. In Bench Resource Optimizer, the employee CV search enforces `org_id` filtering at all three levels.

- How do you keep query latency under 2 seconds end-to-end?

  **Answer:** Latency budget: embedding 100ms + vector search 50ms + LLM TTFT 1,500ms + buffer 350ms = 2,000ms. Use streaming so the user sees the first token at 1,500ms even if total generation takes longer. Add L1 (exact match) and L2 (semantic similarity) cache in Redis — repeated queries return in < 10ms. Pre-embed common queries if your traffic has predictable patterns. In Bench Resource Optimizer, the semantic cache (L1 SHA-256 exact + L2 cosine ≥ 0.92) handles repeated role matching queries; fresh queries hit the 1,800ms budget with DeepSeek streaming.

- What is the monthly LLM cost for this system at 10,000 active daily users?

  **Answer:** 10,000 users × 10 queries/day = 100K queries/day × 700 avg tokens (300 prompt + 400 completion) = 70M tokens/day. On GPT-4o-mini: 70M × $0.15/1M input + 40M × $0.60/1M output = $10.50 + $24 = $34.50/day = ~$1,050/month. With semantic caching at 30% hit rate: $735/month. This is the calculation I'd present to stakeholders — not "it depends" but a concrete number with assumptions stated. Adding 10K document uploads/month at 250K tokens each = 2.5B embedding tokens × $0.02/1M = $50/month additional for embedding.

---

## 9. Answer Framework

Structure every system design answer: Clarify → Ingestion → Query → Production hardening → Scale → Cost.

Never start drawing the architecture before asking clarification questions — scale, tenancy, and latency SLA change everything.

---

## 10. Advanced Follow-ups

Q1: How do you handle PDFs with tables, images, and complex formatting?

Answer:
Standard text extraction (PyMuPDF, pdfplumber) handles text well but loses table structure and ignores images.
For tables: use pdfplumber's table extraction to get structured rows/columns → convert to a text representation with headers preserved → embed as a single chunk with a "Table: [description]" prefix.
For images: use a vision model (GPT-4o Vision, Claude) to caption images — "This image shows a bar chart of quarterly revenue..." → embed the caption as a chunk with metadata linking to the page number.
For complex layouts (multi-column, footnotes): use a document AI service (AWS Textract, Azure Form Recognizer) to extract with layout awareness before chunking.
The decision depends on the document type: plain text PDFs use simple extraction. Technical reports with tables/charts need layout-aware extraction. The cost difference is significant — factor this into the ingestion pipeline design.

Q2: How do you handle document updates? A user uploads a new version of a PDF.

Answer:
Treat it as a two-phase operation: delete old vectors, ingest new version.
First: identify all vectors from the old document version. In Pinecone, filter by doc_id and delete them from the namespace.
Second: run the full ingestion pipeline on the new version, using the same doc_id (so existing DB records are updated, not duplicated).
Atomicity concern: there is a window where old vectors are deleted and new ones are not yet ingested. During this window, queries on this document return no results.
Mitigation: ingest new version first (with a versioned ID), then swap the active version flag in the metadata DB, then delete old vectors. The swap is atomic at the DB level.
For versioning: some use cases need to keep old versions (legal, compliance) — store with version suffix in the namespace and expose version filtering in the query API.

Q3: How would the architecture change if documents must be queryable within 5 seconds of upload?

Answer:
5-second SLA means the ingestion pipeline must run in under 5 seconds — which is challenging for large PDFs.
For the 5-second SLA, two optimizations:
First: process only the first N pages synchronously for immediate availability, then continue background ingestion of remaining pages. User can query the first 50 pages within 5 seconds.
Second: pre-warm the embedding pipeline — always have embedding workers idle and ready, not cold-starting. Cold start adds 2-5 seconds.
For genuinely large documents (200+ pages), 5 seconds is not achievable without compromising index quality. Negotiate the SLA to "first sections available in 5 seconds, full document available in 60 seconds." Surface this as a progress bar in the UI.
If the requirement is hard: accept only smaller documents (< 50 pages) for the fast-index feature. Route larger documents to an async pipeline.

Q4: How do you ensure the system stays within a $500/month LLM budget?

Answer:
Work backward from the budget.
$500/month ÷ 30 days = $16.67/day budget.
With GPT-4o-mini at $0.15/1M input + $0.60/1M output:
For a RAG query with avg 600 input tokens + 200 output tokens: cost = ($0.15 × 600 + $0.60 × 200) / 1,000,000 = $0.0002 per query.
$16.67 / $0.0002 = 83,350 queries/day budget on mini.
Controls to enforce: daily token spend tracking with alert at 80% of daily budget. If budget is approaching limit, either rate-limit heavy users or switch to an even cheaper model for the day.
For embedding costs: text-embedding-3-small at $0.02/1M tokens. 10K documents × 100 chunks × 200 tokens = 200M tokens → $4 one-time embedding cost. Incremental updates are negligible.
The expensive scenario is GPT-4o for every query. At $5/1M input: same query costs $0.003 = 16× more. 83K queries/day becomes 5,500 queries/day on GPT-4o within the same budget. This is why model tiering is critical.

Q5: How does your Java/backend experience make you more effective in designing this system?

Answer:
Three direct mappings.
First, async ingestion = event-driven Spring Batch jobs. I have built document processing pipelines in Spring Batch — the same patterns apply: job definitions, chunk-oriented processing, retry on failure, status tracking in a job repository.
Second, multi-tenancy = a pattern I know from Java SaaS development. Row-level security, tenant_id scoping in queries, namespace isolation — these are standard SaaS database patterns. I apply them to the vector DB the same way I would apply them to a PostgreSQL schema.
Third, cost monitoring = same as monitoring downstream service call costs. I use Prometheus metrics and Grafana dashboards to track costs, latency, and error rates — same tooling I use for microservice monitoring, applied to LLM API calls.
The infrastructure thinking is identical. The AI-specific parts are the chunking strategy, the embedding model choice, and the RAGAS evaluation. Everything around it is standard production engineering.

---

## ★ YOUR 5 PROJECTS — PDF Handling at Scale

| Project | PDF handling | Detail |
|---------|-------------|--------|
| **AstroIntel 360°** | No PDF ingestion | Readings are form-based inputs, not documents. No PDF in main flow. |
| **Bench Resource Optimizer** | CV as PDF (user upload) | `utils/file_parser.py` extracts text. G2 injection guard runs on raw text BEFORE any parsing. Profile stored in SQLite. Admin uploads internal training docs (PDF) → chunked → FAISS. |
| **RunbookAI** | Runbook as PDF — vectorless | LLM extracts structured JSON at ingest. No chunking — one extraction call per PDF. Result stored as rows in `runbook_steps`. `commands_source: "database"` forever. Not RAG — structured extraction. |
| **Agentic Growth OS** | No PDF | Campaign data is form input, not documents. |
| **Universal Agent** | Knowledge base PDFs (optional) | `source_dir` in YAML points to folder of PDFs/Markdown. Chunked and embedded at startup when `knowledge_base.enabled: true`. |

**Interview line:** "RunbookAI handles PDFs differently from every other system — there's no chunking, no embedding, no vector store. The LLM reads the PDF once at ingest and extracts a structured JSON of steps. After that, the PDF is never read again. Every query hits SQL, not the PDF. This is the vectorless PDF architecture: extract once, serve forever."
