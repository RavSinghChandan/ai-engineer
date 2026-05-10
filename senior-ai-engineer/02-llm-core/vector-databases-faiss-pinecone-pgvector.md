# Senior AI Engineer — Module 2
# Topic: Vector Databases — FAISS vs Pinecone vs pgvector (When to Use What)

---

## 1. Intuition

Vector databases are where your embeddings live. Choosing the wrong one costs you either engineering time or money.

Junior engineers default to whatever the tutorial uses. Senior engineers choose based on scale, operational overhead, latency requirements, and whether the team can maintain it.

---

## 2. Core Concept

- Vector database: a storage system optimized for storing and searching high-dimensional vectors (embeddings) by similarity
- The core operation: given a query vector, find the K most similar vectors in the store
- This is called Approximate Nearest Neighbor (ANN) search — exact search is too slow at scale

### Key vector DBs in production:

| System | Type | Scale | Latency | Cost | Best For |
|---|---|---|---|---|---|
| FAISS | In-memory library | Up to ~10M vectors | Sub-millisecond | Free | Demos, single-node, controlled environments |
| pgvector | PostgreSQL extension | Up to ~1M vectors efficiently | 5-50ms | Free (infra cost only) | Teams already on Postgres, transactional + vector in one DB |
| Pinecone | Managed cloud service | Billions of vectors | 10-100ms | $70+/month | Production at scale, no ops overhead |
| Weaviate | Self-hosted or cloud | Billions of vectors | 5-50ms | Free (self-host) / paid cloud | Multi-modal, hybrid search built-in |
| Qdrant | Self-hosted or cloud | Billions of vectors | 5-20ms | Free (self-host) / paid cloud | High performance, open source, Rust-based |
| ChromaDB | Self-hosted | Up to ~1M vectors | 5-30ms | Free | Local dev, prototyping |

### Core search algorithms:
- HNSW (Hierarchical Navigable Small World): used by most production vector DBs — high recall, fast search
- IVF (Inverted File Index): FAISS default — clusters vectors, searches only nearest clusters
- Flat (brute force): exact search, used only for small indexes (<100K vectors)

---

## 3. Why / When to Use

Decision framework:

**Use FAISS when:**
- Building a demo or proof of concept
- Dataset fits comfortably in memory (< 5M vectors)
- No multi-tenancy, no persistence requirement
- You want zero cost and full control

**Use pgvector when:**
- You are already running PostgreSQL
- You need transactional consistency: update a document and its vector atomically
- Data volume is moderate (< 1M vectors with good performance)
- You want to avoid operational complexity of a separate vector store

**Use Pinecone when:**
- You need managed infrastructure — no ops team, no maintenance
- Data volume is large (> 1M vectors) or growing unpredictably
- You need multi-tenancy (namespaces per customer)
- Budget allows: $70-700+/month depending on tier

**Use Weaviate or Qdrant when:**
- You need hybrid search (vector + keyword) built in
- You want self-hosted with production-grade performance
- You need multi-modal (images + text in same index)
- Open source is a requirement

---

## 4. How It Works (Production Architecture)

```
Ingestion:
  Document → Chunker → Embedding model → vector_db.upsert(id, vector, metadata)

Query:
  User query → Embedding model → vector_db.query(query_vector, top_k=5)
             → [(chunk_id, score, metadata), ...]
             → Retrieve chunk text from metadata store
             → Build RAG context for LLM

Metadata strategy:
  Store chunk text in the vector DB metadata (Pinecone, Qdrant support this)
  OR store only IDs in vector DB, retrieve text from a separate DB (Postgres, S3)
  → Separate store is better for large text; avoids size limits on metadata
```

---

## 5. Code Skeleton (Production-Grade)

```python
import faiss
import numpy as np
import pickle
from pathlib import Path

# FAISS — simple production wrapper
class FAISSVectorStore:
    def __init__(self, dimension: int = 1536):
        self.dimension = dimension
        self.index = faiss.IndexFlatIP(dimension)  # Inner Product = cosine similarity on normalized vectors
        self.id_to_text: dict[int, str] = {}
        self.id_to_metadata: dict[int, dict] = {}
        self._next_id = 0
    
    def add(self, text: str, vector: list[float], metadata: dict = None) -> int:
        vec = np.array([vector], dtype=np.float32)
        faiss.normalize_L2(vec)  # normalize for cosine similarity
        self.index.add(vec)
        doc_id = self._next_id
        self.id_to_text[doc_id] = text
        self.id_to_metadata[doc_id] = metadata or {}
        self._next_id += 1
        return doc_id
    
    def search(self, query_vector: list[float], top_k: int = 5) -> list[dict]:
        vec = np.array([query_vector], dtype=np.float32)
        faiss.normalize_L2(vec)
        scores, indices = self.index.search(vec, top_k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            results.append({
                "id": idx,
                "score": float(score),
                "text": self.id_to_text[idx],
                "metadata": self.id_to_metadata[idx]
            })
        return results
    
    def save(self, path: str):
        faiss.write_index(self.index, f"{path}.faiss")
        with open(f"{path}.meta", "wb") as f:
            pickle.dump({"texts": self.id_to_text, "meta": self.id_to_metadata, "next_id": self._next_id}, f)
    
    def load(self, path: str):
        self.index = faiss.read_index(f"{path}.faiss")
        with open(f"{path}.meta", "rb") as f:
            data = pickle.load(f)
        self.id_to_text = data["texts"]
        self.id_to_metadata = data["meta"]
        self._next_id = data["next_id"]


# pgvector — using SQLAlchemy
from sqlalchemy import text

def pgvector_search(query_vector: list[float], top_k: int = 5, db_session) -> list[dict]:
    vector_str = "[" + ",".join(map(str, query_vector)) + "]"
    result = db_session.execute(text(f"""
        SELECT id, content, metadata, 1 - (embedding <=> '{vector_str}'::vector) AS similarity
        FROM document_chunks
        ORDER BY embedding <=> '{vector_str}'::vector
        LIMIT :top_k
    """), {"top_k": top_k})
    return [{"id": r.id, "text": r.content, "metadata": r.metadata, "score": r.similarity} for r in result]
```

---

## 6. Example (From Your Projects)

**LangChain Service — FAISS choice justified:**

Used FAISS for the RAG demo service because:
- Single-tenant demo — no multi-user separation needed
- Dataset: ~500 documents, well within in-memory FAISS capacity
- Zero managed service cost — demo project, no recurring spend
- Full control: serialize/deserialize FAISS index to disk for persistence across restarts

If this were a production enterprise system:
- 1 tenant, < 500K documents → pgvector (already have Postgres, avoid new managed service)
- 1 tenant, > 500K documents or growing → Pinecone or Qdrant
- Multi-tenant SaaS → Pinecone namespaces or Qdrant collections per tenant

In interview: "I used FAISS because this was a demo — the entire corpus fit in memory, there was no multi-tenancy requirement, and I wanted zero operational overhead. In a production system with 50 customers and 2M documents, I would migrate to Pinecone with one namespace per customer for isolation."

---

## 7. Trade-offs

FAISS:
+ Free, fast, no network latency (in-process), full control
- In-memory only (or manual persistence), no built-in metadata filtering, single-node, no API

pgvector:
+ Transactional consistency, SQL queries + vector search in one DB, no new infra if on Postgres
- Performance degrades above 1M vectors without aggressive index tuning, not purpose-built for ANN

Pinecone:
+ Fully managed, auto-scales, multi-tenancy built-in, real-time updates
- $70-700+/month, data leaves your infra (compliance concern), vendor lock-in

Weaviate/Qdrant:
+ Open source, self-hosted, hybrid search built-in, no vendor lock-in
- Operational overhead: you run it, you maintain it, you scale it

---

## 8. Interview Questions (Senior Level)

- You have 5 million documents and 200 enterprise customers. Which vector DB and why?

  **Answer:** Pinecone or Qdrant with namespace-per-tenant isolation. At 5M documents × 200 tenants = up to 1B potential vectors, this exceeds pgvector's practical range without serious optimization and is too large and multi-tenant for FAISS. Pinecone handles this with managed namespaces, automatic scaling, and real-time upserts — the operational overhead stays low. In Bench Resource Optimizer, even at a smaller scale, we chose FAISS for MVP but the path to production for a multi-tenant enterprise system always involves moving to a managed vector store.

- What is HNSW and why is it used instead of exact nearest neighbor search?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- How do you ensure vector search returns fresh results when documents are frequently updated?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- How does pgvector compare to a dedicated vector database for an application already on PostgreSQL?

  **Answer:** *(Already covered in Advanced Follow-ups Q5 — skipped to avoid duplication.)*

- Your FAISS index works in development but you need to scale to production. Walk me through the migration.

  **Answer:** Export all document texts and metadata from FAISS, batch re-upsert to Pinecone or pgvector (whichever your production target is), validate retrieval quality on a held-out eval set comparing FAISS vs new store, then cut over with dual-read during the transition window. The key risk is that FAISS's flat index gives exact results while HNSW-based stores give approximate results — run your RAGAS context recall metric on both to confirm quality is equivalent before switching live traffic over.

---

## 9. Answer Framework

Step 1 — Ask about scale and operational constraints:
"Before choosing a vector DB, I ask: how many vectors, how many tenants, what's the team's operational capacity, and are there data residency requirements?"

Step 2 — Map requirements to options:
"For a single-tenant demo, FAISS. For a team already on Postgres with moderate scale, pgvector. For multi-tenant production at scale, Pinecone or Qdrant."

Step 3 — From your project:
"In the LangChain service demo, I used FAISS — it was the right tool: small corpus, no multi-tenancy, zero cost."

Step 4 — Show migration thinking:
"FAISS to Pinecone migration: export FAISS index, batch re-upsert vectors to Pinecone, update query path, test retrieval quality, cut over. Zero downtime with dual-read during migration."

Step 5 — Close with the principle:
"The best vector DB is the simplest one that meets the requirements. Adding operational complexity for a 10K document demo would be premature optimization."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: What is HNSW and why does it outperform brute-force search?

Answer:
HNSW stands for Hierarchical Navigable Small World. It is a graph-based ANN algorithm.
The idea: build a multi-layer graph where each node connects to its nearest neighbors. The top layers are sparse (long-range connections for fast traversal), bottom layers are dense (precise local connections).
At query time: start at the top layer, greedily walk toward the nearest neighbor, descend to lower layers for precision — like a binary search but in vector space.
Why it beats brute force: brute force scans all N vectors for every query — O(N) per query. At 10M vectors, that's 10M similarity computations per query. HNSW queries in O(log N) — at 10M vectors, roughly 23 comparisons instead of 10M.
Trade-off: HNSW is approximate, not exact. You might miss 1-5% of the truly closest vectors. For RAG, this is acceptable — you are retrieving relevant context, not running a banking transaction.

---

Q2: How do you handle real-time updates to a vector index?

Answer:
Different systems handle this differently.
FAISS: does not support deletion or update natively. The workaround is to maintain a delete list and filter out deleted IDs at query time, then periodically rebuild the index without deleted items. Expensive for high-update scenarios.
Pinecone: supports real-time upsert and delete with eventual consistency — updated vectors are searchable within seconds.
pgvector: supports transactional updates — UPDATE a row's embedding column atomically with the document text. Strong consistency guarantee.
Qdrant: supports real-time upserts with payload updates.
For your architecture decision: if documents change frequently (more than 5% of the corpus daily), FAISS is the wrong choice. Use pgvector or Pinecone where updates are first-class operations.

---

Q3: How do you implement multi-tenancy in a vector database?

Answer:
Four isolation patterns:
First, namespace per tenant (Pinecone): each customer gets their own namespace — searches are scoped automatically. Best managed option, no cross-tenant leakage.
Second, collection per tenant (Qdrant, Weaviate): each tenant gets their own collection. Strong isolation, slightly more overhead per collection.
Third, metadata filter per tenant (any system): all tenants share one collection, each vector has a tenant_id in metadata. Filter on tenant_id at query time. Simple but requires trusting your filter logic — a bug leaks data across tenants.
Fourth, separate DB per tenant: maximum isolation, maximum operational overhead. Only for compliance-heavy scenarios where logical isolation is not sufficient.
My recommendation: metadata filter for small numbers of tenants (< 100), namespace/collection per tenant for SaaS with many customers. Never share a collection without tenant_id filtering.

---

Q4: How does vector search quality degrade and how do you detect it?

Answer:
Three degradation scenarios.
First, stale vectors: documents updated but embeddings not refreshed. Retrieval returns outdated content. Detection: track text_hash per document, alert when hash changes without a corresponding re-embed.
Second, embedding model mismatch: query uses a different model than index. Cosine similarity scores look plausible but are meaningless. Prevention: store model_version in index metadata, assert at query time that versions match.
Third, HNSW index degradation: after many updates and deletes, the graph becomes less connected. Periodic index rebuild (nightly for active indexes) maintains search quality.
Monitoring: track average_similarity_score for top-K results over time. A drop in average score means retrieval is returning less relevant results — investigate above three causes.

---

Q5: FAISS vs pgvector — a team asks which to use for their new RAG feature. What questions do you ask?

Answer:
Five questions in order.
First: "Are you already running PostgreSQL?" If yes, pgvector is probably right — no new service to operate.
Second: "How many vectors?" Under 500K, pgvector handles it well with proper indexing. Above 1M, a purpose-built vector DB starts to outperform pgvector.
Third: "Do you need transactional consistency between document text and its embedding?" If yes, pgvector — update both in one transaction. If no, either works.
Fourth: "What are your latency requirements?" Sub-5ms → FAISS in-process. 5-50ms acceptable → pgvector. Both have lower latency than a remote Pinecone call.
Fifth: "Is this a demo or production?" Demo → FAISS, zero setup. Production with growth potential → start with pgvector, migrate to dedicated vector DB when you exceed its performance envelope.
The pattern I recommend for most teams: start with pgvector (or FAISS for demos), migrate to Pinecone/Qdrant when the data grows beyond what Postgres handles comfortably. Do not over-engineer from day one.
