# Python for AI Engineering — Phase 4
# Lesson 3: Vector DB Python Integration — FAISS, Pinecone, Weaviate

---

## 1. Intuition (Java Anchor)

Java persistence: `EntityManager.persist()`, JDBC `PreparedStatement`, Spring Data `JpaRepository.save()`.
Vector DB persistence: same concept — store objects, retrieve by similarity instead of equality.

The key difference: SQL queries use `WHERE id = ?` (exact match). Vector DB queries use "find the K most similar vectors to this query vector" (approximate nearest neighbor search).

| Java Pattern | Vector DB Equivalent |
|---|---|
| `JpaRepository.save(entity)` | `index.add(vectors)` / `index.upsert(vectors)` |
| `findById(id)` | `index.reconstruct(id)` |
| `findAll(Pageable)` | `index.search(query_vector, k=100)` |
| `JdbcTemplate.batchUpdate()` | `index.add_with_ids(vectors, ids)` |
| `@Entity` with `@Id` | `(id, vector, metadata)` tuple |
| `SELECT ... WHERE score > 0.8` | Filter by cosine similarity threshold |
| H2 in-memory for tests | FAISS `IndexFlatL2` (no persistence) |
| PostgreSQL production | Pinecone / Weaviate cloud |

---

## 2. FAISS — In-Process Vector Search

```python
# FAISS: Facebook AI Similarity Search — runs in your Python process, no server needed
# Java analogy: H2 in-memory database — fast, no infra, but single-process only
# Use FAISS for: local dev, single-server deployments, < 1M vectors

import faiss
import numpy as np
from dataclasses import dataclass

EMBEDDING_DIM = 1536   # text-embedding-3-small output dimension

# Index types:
# IndexFlatL2    — exact search, L2 distance (Euclidean) — use for small datasets (< 100k)
# IndexFlatIP    — exact search, inner product (cosine if normalized) — use for similarity
# IndexIVFFlat   — approximate search, faster for large datasets (> 1M vectors)
# IndexHNSW      — approximate search, best recall/speed tradeoff in production

# Simple exact-search index:
index = faiss.IndexFlatL2(EMBEDDING_DIM)

# Cosine similarity: normalize vectors first, then use inner product
def normalize(vectors: np.ndarray) -> np.ndarray:
    """L2-normalize rows so inner product = cosine similarity."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.where(norms == 0, 1, norms)

# Add vectors (Java: PreparedStatement.executeBatch()):
vectors = np.random.randn(1000, EMBEDDING_DIM).astype(np.float32)
index.add(vectors)
print(index.ntotal)    # 1000 — vectors in index

# Search — find K nearest neighbors:
query = np.random.randn(1, EMBEDDING_DIM).astype(np.float32)
distances, indices = index.search(query, k=5)   # returns (distances, integer indices)
print(indices)    # [[42, 17, 891, 304, 55]]  — row indices of nearest neighbors
print(distances)  # [[0.12, 0.18, 0.21, 0.25, 0.31]]  — L2 distances (lower = more similar)
```

---

## 3. FAISS — Production Index with Metadata

```python
import faiss
import numpy as np
import json
from pathlib import Path
from dataclasses import dataclass

@dataclass
class VectorStore:
    """
    FAISS index + metadata store.
    Java: like a @Repository with two storage backends — one for vectors, one for metadata.
    """
    def __init__(self, dim: int = 1536, index_path: Path | None = None):
        self.dim = dim
        self._index = faiss.IndexFlatIP(dim)   # inner product — use with normalized vecs
        self._metadata: dict[int, dict] = {}   # int id → metadata dict
        self._next_id = 0

        if index_path and index_path.exists():
            self._load(index_path)

    def add(self, vectors: np.ndarray, metadata_list: list[dict]) -> list[int]:
        """Add vectors and their metadata. Returns assigned IDs."""
        assert vectors.shape[0] == len(metadata_list), "vectors and metadata must match"
        normed = normalize(vectors)
        faiss.normalize_L2(normed)   # FAISS in-place normalize

        ids = list(range(self._next_id, self._next_id + len(vectors)))
        self._next_id += len(vectors)

        self._index.add(normed)
        for i, meta in zip(ids, metadata_list):
            self._metadata[i] = meta

        return ids

    def search(self, query_vector: np.ndarray, k: int = 5) -> list[dict]:
        """Search for K most similar vectors. Returns metadata + scores."""
        query = query_vector.reshape(1, -1).astype(np.float32)
        faiss.normalize_L2(query)
        scores, indices = self._index.search(query, k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:   # FAISS returns -1 for empty slots
                continue
            results.append({
                "score": float(score),
                "metadata": self._metadata.get(int(idx), {}),
            })
        return results

    def save(self, path: Path) -> None:
        faiss.write_index(self._index, str(path / "index.faiss"))
        with open(path / "metadata.json", "w") as f:
            json.dump({"metadata": self._metadata, "next_id": self._next_id}, f)

    def _load(self, path: Path) -> None:
        self._index = faiss.read_index(str(path / "index.faiss"))
        with open(path / "metadata.json") as f:
            data = json.load(f)
            self._metadata = {int(k): v for k, v in data["metadata"].items()}
            self._next_id = data["next_id"]


# Usage:
store = VectorStore(dim=1536)
store.add(
    vectors=np.array([[0.1, 0.2, ...]], dtype=np.float32),
    metadata_list=[{"source": "ravi_cv.pdf", "chunk_index": 0, "text": "Python developer..."}],
)
results = store.search(query_vector=np.array([0.1, 0.2, ...], dtype=np.float32), k=5)
```

---

## 4. Pinecone — Managed Cloud Vector DB

```python
# Pinecone: managed vector DB — no FAISS process, no server setup
# Java analogy: managed PostgreSQL on RDS vs running your own Postgres on EC2
# Use Pinecone for: production, multi-server, > 1M vectors, metadata filtering

from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

# Create index (one-time setup — Java: CREATE TABLE equivalent):
pc.create_index(
    name="bench-optimizer",
    dimension=1536,
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)

# Get index handle:
index = pc.Index("bench-optimizer")

# Upsert vectors (Java: JpaRepository.saveAll()):
vectors_to_upsert = [
    {
        "id": "ravi_cv::chunk_0",
        "values": [0.1, 0.2, ...],    # 1536 floats
        "metadata": {
            "source": "ravi_cv.pdf",
            "chunk_index": 0,
            "text": "Senior Python developer with 5 years...",
            "role": "python-dev",
        },
    },
    # ... more vectors
]
index.upsert(vectors=vectors_to_upsert)   # batch upsert

# Query (Java: findTopKByEmbeddingSimilarity(queryVec, k)):
results = index.query(
    vector=[0.1, 0.2, ...],
    top_k=5,
    include_metadata=True,
    filter={"role": {"$eq": "python-dev"}},   # metadata filter — SQL: WHERE role = 'python-dev'
)

for match in results["matches"]:
    print(match["id"])            # "ravi_cv::chunk_0"
    print(match["score"])         # 0.89  — cosine similarity
    print(match["metadata"])      # {"source": "ravi_cv.pdf", "text": "..."}

# Delete (Java: JpaRepository.deleteById()):
index.delete(ids=["ravi_cv::chunk_0"])

# Stats:
stats = index.describe_index_stats()
print(stats["total_vector_count"])
```

---

## 5. Weaviate — Open-Source + Cloud Vector DB

```python
# Weaviate: open-source, runs locally or on cloud
# Java analogy: like using Elasticsearch — can self-host or use managed service
# Advantage over Pinecone: stores full objects (text + vectors), not just vectors + metadata

import weaviate
from weaviate.classes.config import Configure, Property, DataType

client = weaviate.connect_to_local()   # local Docker instance
# or: client = weaviate.connect_to_weaviate_cloud(cluster_url=..., auth_credentials=...)

# Create collection (Java: CREATE TABLE / @Entity):
client.collections.create(
    name="CVChunk",
    vectorizer_config=Configure.Vectorizer.none(),   # we supply vectors ourselves
    properties=[
        Property(name="source",      data_type=DataType.TEXT),
        Property(name="chunk_index", data_type=DataType.INT),
        Property(name="text",        data_type=DataType.TEXT),
        Property(name="role",        data_type=DataType.TEXT),
    ],
)

collection = client.collections.get("CVChunk")

# Insert with pre-computed vector (Java: entityManager.persist()):
collection.data.insert(
    properties={
        "source": "ravi_cv.pdf",
        "chunk_index": 0,
        "text": "Senior Python developer with 5 years...",
        "role": "python-dev",
    },
    vector=[0.1, 0.2, ...],    # pre-computed embedding
)

# Batch insert (Java: entityManager.persist() in transaction loop):
with collection.batch.dynamic() as batch:
    for chunk in embedded_chunks:
        batch.add_object(
            properties={"source": chunk.source, "text": chunk.text, "chunk_index": chunk.chunk_index},
            vector=chunk.embedding,
        )

# Search (Java: findTopKByEmbedding()):
results = collection.query.near_vector(
    near_vector=[0.1, 0.2, ...],
    limit=5,
    return_metadata=weaviate.classes.query.MetadataQuery(score=True),
)

for obj in results.objects:
    print(obj.properties["text"])
    print(obj.metadata.score)

client.close()
```

---

## 6. Retrieval Pattern — Query Embedding + Search

```python
from openai import OpenAI

client = OpenAI()

def retrieve_relevant_chunks(
    query: str,
    vector_store: VectorStore,   # FAISS-backed store
    k: int = 5,
    min_score: float = 0.7,
) -> list[dict]:
    """
    Embed query → search vector store → return top-k chunks.
    Java: like calling a search service that returns ranked results.
    """
    # Step 1: embed the query (same model as used for documents)
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=query,
    )
    query_vector = np.array(response.data[0].embedding, dtype=np.float32)

    # Step 2: search
    results = vector_store.search(query_vector, k=k)

    # Step 3: filter by minimum similarity score
    return [r for r in results if r["score"] >= min_score]

# Usage in RAG pipeline:
chunks = retrieve_relevant_chunks(
    query="Python developer with FastAPI experience",
    vector_store=store,
    k=5,
)
context = "\n---\n".join(c["metadata"]["text"] for c in chunks)
# Use context as part of LLM prompt
```

---

## 7. Provider Abstraction — Swap FAISS ↔ Pinecone

```python
# Java: interface VectorRepository { save(...); search(...); }
# Python: Protocol — duck typing, no explicit implements

from typing import Protocol
import numpy as np

class VectorRepository(Protocol):
    def upsert(self, vectors: np.ndarray, metadata_list: list[dict]) -> None: ...
    def search(self, query_vector: np.ndarray, k: int) -> list[dict]: ...

# FAISS implementation — local
class FAISSRepository:
    def __init__(self, dim: int):
        self._store = VectorStore(dim)

    def upsert(self, vectors: np.ndarray, metadata_list: list[dict]) -> None:
        self._store.add(vectors, metadata_list)

    def search(self, query_vector: np.ndarray, k: int) -> list[dict]:
        return self._store.search(query_vector, k)

# Pinecone implementation — cloud
class PineconeRepository:
    def __init__(self, index_name: str):
        from pinecone import Pinecone
        pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
        self._index = pc.Index(index_name)

    def upsert(self, vectors: np.ndarray, metadata_list: list[dict]) -> None:
        upsert_data = [
            {"id": m["chunk_id"], "values": v.tolist(), "metadata": m}
            for v, m in zip(vectors, metadata_list)
        ]
        self._index.upsert(vectors=upsert_data)

    def search(self, query_vector: np.ndarray, k: int) -> list[dict]:
        results = self._index.query(vector=query_vector.tolist(), top_k=k, include_metadata=True)
        return [{"score": m["score"], "metadata": m["metadata"]} for m in results["matches"]]

# Factory (Java: @ConditionalOnProperty):
def make_vector_repo(provider: str = "faiss") -> VectorRepository:
    if provider == "faiss":
        return FAISSRepository(dim=1536)
    elif provider == "pinecone":
        return PineconeRepository(index_name="bench-optimizer")
    raise ValueError(f"Unknown vector DB provider: {provider}")
```

---

## 8. Interview Anchor

**"How do you choose between FAISS, Pinecone, and Weaviate?"**

Say:
> "Three axes: scale, deployment model, and filtering needs. FAISS runs in-process — no network, sub-millisecond search, zero infra — it's my default for development and single-server deployments under a million vectors. The tradeoff: FAISS doesn't persist across restarts unless I serialize the index with `faiss.write_index`, and it can't scale horizontally. For production at scale I use Pinecone — fully managed, auto-scales, supports metadata filtering in the same query so I can do `WHERE role = 'python-dev'` alongside vector similarity. Weaviate is the open-source alternative when the team wants self-hosted infrastructure or tighter control over data residency — it stores full text objects rather than just ID+vector pairs, which simplifies the retrieval layer. In all cases I abstract behind a `VectorRepository` protocol so the service code never imports FAISS or Pinecone directly — I can swap the backend by changing one factory function."

---

## 9. Quick Reference

```python
import faiss, numpy as np

# FAISS
index = faiss.IndexFlatL2(1536)           # exact L2 search
index = faiss.IndexFlatIP(1536)           # exact inner product (cosine if normalized)
index.add(vectors)                         # add np.ndarray (float32)
D, I = index.search(query, k=5)           # D=distances, I=indices
index.ntotal                               # vector count
faiss.write_index(index, "file.faiss")
index = faiss.read_index("file.faiss")

# Normalize for cosine similarity
faiss.normalize_L2(vectors)               # in-place L2 normalize

# Pinecone
from pinecone import Pinecone
pc = Pinecone(api_key=...)
index = pc.Index("name")
index.upsert(vectors=[{"id":..., "values":..., "metadata":...}])
index.query(vector=..., top_k=5, include_metadata=True, filter={...})
index.delete(ids=[...])

# Weaviate
client = weaviate.connect_to_local()
col = client.collections.get("Name")
col.data.insert(properties={...}, vector=[...])
col.query.near_vector(near_vector=[...], limit=5)

# Java comparison
# index.add()              → JpaRepository.saveAll()
# index.search(query, k)   → findTopK() — but by similarity, not equality
# index.delete()           → JpaRepository.deleteById()
# IndexFlatL2              → H2 in-memory (no persistence, exact)
# Pinecone                 → managed RDS (persistent, scalable)
# filter={"role": "dev"}   → WHERE role = 'dev'
```
