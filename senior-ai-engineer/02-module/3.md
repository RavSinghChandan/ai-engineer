# Senior AI Engineer — Module 2
# Topic: Embeddings — Choosing Models, Drift, and Refresh Strategy

---

## 1. Intuition

Embeddings are the bridge between human language and math. They convert text into vectors so computers can measure semantic similarity.

Junior engineers use whatever embedding model is default. Senior engineers ask: which model for this domain, what happens when documents update, and how do I detect when embedding quality degrades?

---

## 2. Core Concept

- Embedding: a fixed-size numerical vector representation of text that captures semantic meaning
- Similar meaning → vectors close in high-dimensional space (high cosine similarity)
- Different meaning → vectors far apart (low cosine similarity)

### How embeddings are generated:
```
"How do I reset my password?" 
    ↓ Embedding model (e.g., text-embedding-3-small)
    ↓ Forward pass through transformer encoder
[0.021, -0.147, 0.089, ...] ← vector of 1536 dimensions
```

### Key embedding models:

| Model | Dimensions | Context | Cost | Best For |
|---|---|---|---|---|
| text-embedding-3-small | 1536 | 8K tokens | $0.02/1M tokens | General use, cost-efficient |
| text-embedding-3-large | 3072 | 8K tokens | $0.13/1M tokens | High-accuracy retrieval |
| text-embedding-ada-002 | 1536 | 8K tokens | $0.10/1M tokens | Legacy — prefer 3-small |
| all-MiniLM-L6-v2 | 384 | 256 tokens | Free (local) | Low-latency, local deployment |
| E5-large, BGE-large | 1024 | 512 tokens | Free (local) | High accuracy, open source |

### Cosine similarity:
```python
similarity = dot_product(vec_a, vec_b) / (magnitude(vec_a) × magnitude(vec_b))
# Range: -1 (opposite) to 1 (identical)
# Typical RAG threshold: > 0.75 for relevance
```

---

## 3. Why / When It Matters

Embedding choice matters because:
- Different models have different semantic spaces — you cannot mix embeddings from different models
- Domain-specific text (medical, legal, code) benefits from domain-tuned models
- Longer chunks require a model with larger context window
- Local models avoid API cost and latency for high-volume embedding

Embedding drift happens when:
- You update documents but re-embed only some of them (mixed model versions)
- You switch embedding models without re-embedding all existing documents
- Document language or content changes significantly from what was embedded

---

## 4. How It Works (Production Embedding Pipeline)

```
Ingestion Pipeline:
  Document → Chunker → Embedding model → Vector DB → Metadata store

Query Pipeline:
  User query → Same embedding model → Vector similarity search → Top-K chunks

Critical rule: ingestion and query MUST use the same embedding model.
Changing the model requires re-embedding ALL documents — partial updates create mixed-model vectors that break retrieval.
```

### Refresh strategy for live document stores:
```
Option 1 — Full re-embed:
  On any model change or major document update, re-embed the entire corpus
  Simple, correct, expensive for large corpora

Option 2 — Incremental re-embed:
  Track last_embedded_at timestamp per document
  Nightly job: re-embed documents modified since last_embedded_at
  New documents: embed immediately on ingestion

Option 3 — Dual-index migration:
  Run old and new embedding models in parallel
  New queries hit both indexes, blend results
  Retire old index after full re-embed completes
```

---

## 5. Code Skeleton (Production-Grade)

```python
from openai import OpenAI
import numpy as np
from datetime import datetime

client = OpenAI()

def embed_text(text: str, model: str = "text-embedding-3-small") -> list[float]:
    # Truncate to model's token limit — embedding silently truncates, you want to control this
    if len(text) > 30_000:  # rough character limit for 8K tokens
        text = text[:30_000]
    
    response = client.embeddings.create(input=text, model=model)
    return response.data[0].embedding

def embed_batch(texts: list[str], model: str = "text-embedding-3-small") -> list[list[float]]:
    # Batch embedding — much cheaper than one call per text
    response = client.embeddings.create(input=texts, model=model)
    return [item.embedding for item in response.data]

def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a, b = np.array(vec_a), np.array(vec_b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# Production document store with version tracking
class EmbeddingStore:
    def __init__(self, model: str = "text-embedding-3-small"):
        self.model = model
        self.model_version = model  # track which model was used
    
    def embed_document(self, doc_id: str, text: str) -> dict:
        vector = embed_text(text, self.model)
        return {
            "doc_id": doc_id,
            "vector": vector,
            "model_version": self.model_version,
            "embedded_at": datetime.utcnow().isoformat(),
            "text_hash": hash(text)  # detect if doc changed
        }
    
    def needs_reembedding(self, stored_meta: dict, current_text: str) -> bool:
        # Re-embed if: model changed OR document content changed
        return (
            stored_meta["model_version"] != self.model_version or
            stored_meta["text_hash"] != hash(current_text)
        )
```

---

## 6. Example (From Your Projects)

**LangChain Service — FAISS + OpenAI embeddings:**

The LangChain RAG service used `text-embedding-ada-002` (legacy) for FAISS indexing.
For a modern rebuild, I would use `text-embedding-3-small`:
- 5x cheaper than ada-002
- Better performance on most benchmarks
- Same 1536 dimensions — drop-in replacement

Migration path from ada-002 to 3-small:
1. Build new FAISS index with 3-small embeddings (run in background)
2. A/B test: route 10% of queries to new index, compare retrieval quality (RAGAS context precision)
3. If quality meets or exceeds baseline: switch all traffic to new index
4. Decommission old index

This is zero-downtime embedding model migration — a pattern that applies any time you upgrade embedding models.

In interview: "We used FAISS with OpenAI embeddings. The key production decision was ensuring ingestion and query used the same model version — we stored model_version alongside each vector in metadata so we knew which documents needed re-embedding after a model upgrade."

---

## 7. Trade-offs

API embedding model (OpenAI, Cohere):
+ High quality, no infra to maintain, easy to use
- API cost accumulates at scale, latency on every embed call, data leaves your infrastructure

Local embedding model (MiniLM, BGE, E5):
+ Zero cost per call, low latency, data stays on-prem
- Lower quality than best API models, need GPU for fast batch embedding, model maintenance overhead

High-dimension embeddings (3072d):
+ More expressive, better recall on nuanced similarity
- More storage, slower search, higher API cost

Low-dimension embeddings (384d):
+ Faster search, less storage, lower cost
- Less semantic nuance — misses subtle similarity

Chunking large documents before embedding:
+ Each chunk has focused semantic meaning, fits model context window
- Information that spans chunk boundaries may not be retrieved together

---

## 8. Interview Questions (Senior Level)

- You switch from text-embedding-ada-002 to text-embedding-3-small. What breaks and how do you migrate?
- How do you detect embedding quality degradation in production?
- What is the difference between semantic similarity and keyword search and when do you use each?
- How do you embed a 200-page document for RAG retrieval?
- Why can't you mix embeddings from different models in the same vector store?

---

## 9. Answer Framework

Step 1 — Choose model based on requirements:
"For a general enterprise RAG system, I use text-embedding-3-small — best cost-to-quality ratio. For sensitive data that cannot leave our infrastructure, I use a local BGE or E5 model."

Step 2 — Explain the pipeline consistency requirement:
"Ingestion and query must use the same embedding model. Mixing models produces meaningless similarity scores — the vectors live in different semantic spaces."

Step 3 — Address refresh strategy:
"I track model_version and text_hash per document. Nightly job checks for documents where text changed or model version doesn't match current — those get re-embedded."

Step 4 — From your project:
"In the LangChain service, we used FAISS with OpenAI embeddings. When we upgraded the embedding model, we ran the full re-embed as a background job, tested with 10% traffic on the new index, then cut over."

Step 5 — Cost awareness:
"Embedding 1M documents at 500 tokens each = 500M tokens. At $0.02/1M tokens for 3-small = $10 for the full corpus. Very manageable — the ongoing cost is incremental updates only."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: How do you choose between semantic search and keyword search?

Answer:
They solve different problems.
Keyword search (BM25, Elasticsearch): finds documents that contain the exact words in the query. Precise, fast, interpretable. Fails when users paraphrase or use synonyms.
Semantic search (vector similarity): finds documents with similar meaning, regardless of exact words. Handles synonyms, paraphrases, cross-lingual queries. Fails when exact terminology matters (product codes, identifiers, error codes).
In production, the answer is almost always hybrid: run both in parallel, merge results, rerank.
Use case split: "password reset" → semantic finds "account recovery" documents. "Error code E-5021" → keyword search finds the exact error. A hybrid system handles both.

---

Q2: How does embedding drift affect RAG quality?

Answer:
Embedding drift happens when the document content changes but the stored vectors are not updated.
If a policy document is updated — "refund takes 5-7 days" becomes "refund takes 14 days" — the old embedding still represents the old content. A query about refund time will retrieve the document but the LLM sees the updated text, which contradicts what the embedding's similarity score implied was relevant.
This creates subtle hallucination-like errors: the retrieval seems to work (similarity score looks fine) but the content is stale.
Detection: track text_hash per document. If hash changes and embedding_updated_at hasn't changed since the hash change, that document has drifted.
Prevention: whenever a document is updated in the source system (CMS, database), emit an event to the embedding pipeline to re-embed that document immediately.

---

Q3: Why is cosine similarity preferred over Euclidean distance for text embeddings?

Answer:
For normalized vectors (which all modern embedding models produce), cosine similarity and Euclidean distance are mathematically equivalent — so technically, either works.
But practically: cosine similarity is invariant to vector magnitude. Two documents with the same meaning but different lengths produce vectors of different magnitudes. Cosine similarity captures "same direction = same meaning" regardless of how long each document was.
Euclidean distance would penalize longer documents whose vectors happen to have larger magnitude.
In implementation: FAISS supports both. Most libraries default to cosine similarity for text embeddings. Stick with the default unless you have a specific reason to change it.

---

Q4: How do you embed a document that is longer than the model's context window?

Answer:
You cannot embed a 200-page document as a single vector — the model's context limit (typically 8K tokens) prevents it, and even if it fit, a single vector for 200 pages loses granularity.
The correct approach is chunking before embedding.
Split the document into smaller chunks (512-1024 tokens with 10-20% overlap for continuity).
Embed each chunk independently — each chunk gets its own vector.
Store all vectors in the index with metadata pointing back to the source document and chunk position.
At query time: retrieve the top-K most relevant chunks (not documents) and pass them to the LLM.
The overlap between chunks ensures that a sentence at a chunk boundary is captured in at least one chunk's semantic representation.

---

Q5: How would you build an embedding pipeline that handles 10 million documents?

Answer:
At that scale, the bottleneck shifts from API calls to throughput and storage.
First, batch embedding: never embed one document at a time. OpenAI supports batching up to 2048 texts per API call — use it.
Second, parallelism: use a job queue (Celery, Kafka consumer group) to distribute embedding work across multiple workers. 10M documents / 1000 per batch / 10 workers = manageable throughput.
Third, vector storage: FAISS in-memory doesn't scale to 10M vectors. Use a managed vector DB: Pinecone, Weaviate, or pgvector with HNSW indexing. At 10M × 1536 dimensions × 4 bytes = ~60GB just for vectors — plan storage accordingly.
Fourth, incremental updates: design the pipeline as event-driven from day one. New document added → emit event → embedding worker picks it up → upserts vector in the index. Never do a full re-index unless changing the embedding model.
Fifth, monitoring: track embedding queue depth, failure rate, and P95 embedding latency. If the queue grows, scale workers horizontally.
