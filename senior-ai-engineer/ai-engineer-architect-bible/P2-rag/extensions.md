# P2 — Extensions
### When something new comes to RAG, add it here. This file is your living changelog.

← [Back to README](./README.md)

---

## How to use this file

When you learn something new that applies to RAG:
1. Pick the right section below (or add a new one)
2. Add your entry with: what it is, when to use it, 3–5 lines of code
3. Update `flow.md` if it changes the architecture diagram
4. Update `cheatsheet.md` if it produces a new interview question

---

## SECTION A — Vector Databases

### ✅ FAISS — current default (local / development)
```python
import faiss, numpy as np
index = faiss.IndexFlatIP(1536)   # inner product = cosine after L2 norm
faiss.normalize_L2(vecs)
index.add(vecs)
scores, indices = index.search(query_vec, k=5)
```
**When to use:** local dev, small datasets (<1M vectors), no external service needed.

### ➕ Pinecone — add for production scale
```python
import pinecone
pc = pinecone.Pinecone(api_key=os.environ["PINECONE_API_KEY"])
index = pc.Index("my-rag-index")
index.upsert(vectors=[(id, vec, metadata) for ...])
results = index.query(vector=query_vec, top_k=5, include_metadata=True)
```
**When to use:** millions of vectors, multi-tenant, managed service.

### ➕ Chroma — add for lightweight persistent store
```python
import chromadb
client = chromadb.PersistentClient(path="./chroma_db")
collection = client.get_or_create_collection("docs")
collection.add(documents=texts, embeddings=vecs, ids=ids)
results = collection.query(query_embeddings=[q_vec], n_results=5)
```
**When to use:** local persistence without FAISS complexity, small-medium scale.

---

## SECTION B — Embedding Models

### ✅ OpenAI text-embedding-3-small — current default
```python
resp = await llm.embeddings.create(model="text-embedding-3-small", input=[text])
vec = resp.data[0].embedding   # 1536 dimensions
```

### ➕ OpenAI text-embedding-3-large — higher quality
```python
resp = await llm.embeddings.create(model="text-embedding-3-large", input=[text])
# 3072 dimensions — better quality, 2x cost, 2x memory
```
**When to use:** high-precision retrieval where quality > cost.

### ➕ Local embedding (sentence-transformers) — no API cost
```python
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-small-en-v1.5")
vec = model.encode([text], normalize_embeddings=True)
```
**When to use:** offline, cost-sensitive, or data privacy requirements.

---

## SECTION C — Retrieval Improvements

### ✅ Vector search — current default

### ✅ Cross-encoder reranking — in code.py
```python
from sentence_transformers import CrossEncoder
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
scores = reranker.predict([(query, chunk) for chunk in chunks])
```

### ➕ Hybrid search (BM25 + vector)
Combine keyword search (BM25) with semantic search (vector). Use Reciprocal Rank Fusion to merge.
```python
from rank_bm25 import BM25Okapi

# BM25 keyword search
bm25 = BM25Okapi([doc.split() for doc in corpus])
bm25_scores = bm25.get_scores(query.split())

# Merge with vector scores via RRF
def reciprocal_rank_fusion(rankings: list[list[int]], k=60):
    scores = {}
    for ranking in rankings:
        for rank, idx in enumerate(ranking):
            scores[idx] = scores.get(idx, 0) + 1 / (k + rank + 1)
    return sorted(scores, key=scores.get, reverse=True)
```
**When to use:** legal documents, code search, exact phrase matching needed.

### ➕ HyDE (Hypothetical Document Embedding)
Generate a hypothetical answer, embed it, use that embedding as the search query.
```python
async def hyde_search(query: str, llm, store) -> list:
    # Step 1: Generate a fake document that would answer the query
    hyp_doc = await llm.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": f"Write a short document that answers: {query}"}],
    )
    hypothetical = hyp_doc.choices[0].message.content
    # Step 2: Embed the HYPOTHETICAL document, not the query
    hyp_vec = await embed_query(hypothetical, llm)
    return store.search(hyp_vec, top_k=5)
```
**When to use:** short or vague queries where query embedding is weak.

---

## SECTION D — Chunking Strategies

### ✅ Fixed-size with overlap — current default (chunk_size=800, overlap=150)

### ➕ Sentence-aware chunking
Split at sentence boundaries instead of character count.
```python
import nltk
nltk.download('punkt')
sentences = nltk.sent_tokenize(text)
# group sentences until chunk_size is reached
```
**When to use:** prose documents where splitting mid-sentence loses meaning.

### ➕ Semantic chunking
Split when topic changes (cosine similarity drops between adjacent sentences).
```python
# Embed each sentence, find big drops in similarity → split there
```
**When to use:** mixed-topic documents, structured reports.

---

## SECTION E — Future patterns that grow out of P2

| What you add to P2 | It becomes |
|---|---|
| + Tool to search the vector store | → P3 (RAG as a tool in an agent) |
| + Memory of past queries per user | → P4 (personalized RAG) |
| + Stream the RAG answer token by token | → P5 (streaming RAG) |

---

← [Back to README](./README.md) | [→ Cheatsheet](./cheatsheet.md)
