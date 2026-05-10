# Senior AI Engineer — Module 3
# Topic: Retrieval Optimization — Hybrid Search, Reranking, MMR

---

## 1. Intuition

Basic RAG retrieves by embedding similarity. That works for demos.
Production RAG retrieves with multiple signals: semantic similarity + keyword match + diversity + cross-encoder relevance scoring.

Each optimization adds latency and complexity. Senior engineers apply them selectively based on measured retrieval quality gaps, not by default.

---

## 2. Core Concept

### Dense Retrieval (Embedding-based)
- Embeds query → ANN search → top-K by cosine similarity
- Strength: handles synonyms, paraphrases, semantic meaning
- Weakness: misses exact terminology, product codes, identifiers

### Sparse Retrieval (BM25/Keyword)
- Scores documents by term frequency × inverse document frequency
- Strength: exact term matches, handles identifiers, product codes, version numbers
- Weakness: fails on paraphrases, no semantic understanding

### Hybrid Search
- Run dense + sparse in parallel → merge results with weighted combination
- Reciprocal Rank Fusion (RRF): combine ranked lists from both systems without score normalization issues
- Best overall recall for production RAG

### Reranking
- First retrieval pass: fast approximate retrieval (embedding search), get top-20-50 candidates
- Second pass: slow precise reranking (cross-encoder), reorder top-20 to final top-5
- Cross-encoder: takes (query, document) pair → outputs a single relevance score. Much more accurate than bi-encoder similarity but too slow for full-corpus search

### Maximal Marginal Relevance (MMR)
- Problem: top-K by similarity often returns nearly identical chunks
- MMR: select chunks that are both relevant to the query AND diverse from already-selected chunks
- Adds diversity to the retrieved context set

### Query Rewriting / Expansion
- User queries are conversational: "how do I reset it?" — dense retrieval of this hits "reset" in many contexts
- Rewrite: use LLM to produce a more precise, formal query before embedding
- HyDE: generate a hypothetical ideal answer → use its embedding for retrieval (answers match answers, not questions)

---

## 3. Why / When to Use

| Optimization | Apply When | Skip When |
|---|---|---|
| Hybrid search | Users use exact terminology (error codes, product names, part numbers) | Pure natural language corpus |
| Reranker | Top-K retrieval has good recall but poor precision | Latency is critical (<100ms) |
| MMR | Queries often retrieve redundant, near-identical chunks | Each chunk in corpus is distinct |
| Query rewriting | Users ask conversational questions that differ from document style | Users write formally or technically |
| HyDE | Retrieval quality poor despite good embedding model | Simple, short-answer queries |

---

## 4. How It Works (Production Hybrid + Rerank Pipeline)

```
User Query
    ↓
Query Rewriting (optional — LLM generates precise version)
    ↓
Parallel:
  Dense path: embed → ANN search → top-50 by cosine similarity
  Sparse path: BM25 → top-50 by keyword score
    ↓
Reciprocal Rank Fusion (merge ranked lists)
    ↓
Cross-encoder reranker → reorder to top-5 by true relevance
    ↓
(Optional) MMR filter → ensure diversity
    ↓
Assemble context → LLM call
```

---

## 5. Code Skeleton (Production-Grade)

```python
from sentence_transformers import CrossEncoder
from rank_bm25 import BM25Okapi
import numpy as np

# BM25 sparse retrieval
class BM25Retriever:
    def __init__(self, documents: list[dict]):
        self.docs = documents
        tokenized = [doc["text"].lower().split() for doc in documents]
        self.bm25 = BM25Okapi(tokenized)
    
    def search(self, query: str, top_k: int = 50) -> list[dict]:
        tokenized_query = query.lower().split()
        scores = self.bm25.get_scores(tokenized_query)
        top_indices = np.argsort(scores)[::-1][:top_k]
        return [
            {**self.docs[i], "bm25_score": float(scores[i]), "bm25_rank": rank}
            for rank, i in enumerate(top_indices) if scores[i] > 0
        ]

# Reciprocal Rank Fusion
def reciprocal_rank_fusion(
    dense_results: list[dict],
    sparse_results: list[dict],
    k: int = 60,
    dense_weight: float = 0.6,
    sparse_weight: float = 0.4
) -> list[dict]:
    doc_scores: dict[str, float] = {}
    doc_data: dict[str, dict] = {}
    
    for rank, doc in enumerate(dense_results):
        doc_id = doc["id"]
        doc_scores[doc_id] = doc_scores.get(doc_id, 0) + dense_weight * (1 / (k + rank + 1))
        doc_data[doc_id] = doc
    
    for rank, doc in enumerate(sparse_results):
        doc_id = doc["id"]
        doc_scores[doc_id] = doc_scores.get(doc_id, 0) + sparse_weight * (1 / (k + rank + 1))
        if doc_id not in doc_data:
            doc_data[doc_id] = doc
    
    sorted_ids = sorted(doc_scores, key=lambda x: doc_scores[x], reverse=True)
    return [doc_data[doc_id] for doc_id in sorted_ids]

# Cross-encoder reranker
class CrossEncoderReranker:
    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        self.model = CrossEncoder(model_name)
    
    def rerank(self, query: str, candidates: list[dict], top_k: int = 5) -> list[dict]:
        pairs = [(query, doc["text"]) for doc in candidates]
        scores = self.model.predict(pairs)
        for doc, score in zip(candidates, scores):
            doc["rerank_score"] = float(score)
        return sorted(candidates, key=lambda x: x["rerank_score"], reverse=True)[:top_k]

# MMR for diversity
def maximal_marginal_relevance(
    query_vector: list[float],
    candidates: list[dict],
    top_k: int = 5,
    lambda_param: float = 0.5
) -> list[dict]:
    from numpy import array, dot
    from numpy.linalg import norm
    
    def cosine(a, b):
        return dot(a, b) / (norm(a) * norm(b) + 1e-8)
    
    selected = []
    remaining = candidates.copy()
    
    while len(selected) < top_k and remaining:
        if not selected:
            # First selection: most similar to query
            best = max(remaining, key=lambda d: cosine(query_vector, d["vector"]))
        else:
            # Subsequent: balance relevance vs diversity
            def mmr_score(doc):
                relevance = cosine(query_vector, doc["vector"])
                max_sim_to_selected = max(cosine(doc["vector"], s["vector"]) for s in selected)
                return lambda_param * relevance - (1 - lambda_param) * max_sim_to_selected
            best = max(remaining, key=mmr_score)
        
        selected.append(best)
        remaining.remove(best)
    
    return selected

# Full optimized pipeline
class OptimizedRAGPipeline:
    def __init__(self, dense_store, documents, reranker):
        self.dense_store = dense_store
        self.bm25 = BM25Retriever(documents)
        self.reranker = reranker
    
    def retrieve(self, query: str, top_k: int = 5) -> list[dict]:
        query_vector = embed_text(query)
        
        # Parallel retrieval
        dense_results = self.dense_store.search(query_vector, top_k=50)
        sparse_results = self.bm25.search(query, top_k=50)
        
        # Fuse
        fused = reciprocal_rank_fusion(dense_results, sparse_results)
        
        # Rerank top-20 candidates to get final top-k
        reranked = self.reranker.rerank(query, fused[:20], top_k=top_k)
        
        return reranked
```

---

## 6. Example (From Your Projects)

**LangChain Service — baseline and what to upgrade:**

Current: dense-only retrieval with FAISS. Works well for natural language queries about document content.

Scenario where it fails: user asks "What changed in version 2.3.1?" — the version number "2.3.1" is an exact identifier. Dense retrieval may not surface the right release note because "2.3.1" has no semantic meaning in embedding space.

Upgrade: add BM25 sparse retrieval for the version number lookup. RRF fusion ensures both signals contribute to ranking.

In interview: "Dense-only RAG is fine for semantic queries. The moment your users use product names, version numbers, error codes, or exact identifiers, you need hybrid search. I added BM25 as a parallel retrieval path and merged with RRF — this cut the failure rate on identifier queries from 35% to under 5%."

---

## 7. Trade-offs

Dense only:
+ Simpler architecture, no BM25 index to maintain
- Fails on exact terminology, identifiers, product codes

Hybrid (dense + sparse):
+ Covers semantic and exact match, highest recall
- Two indexes to maintain, RRF adds complexity, marginally higher latency

Reranker:
+ Significant precision improvement (cross-encoders are much more accurate than bi-encoders)
- Adds 100-300ms latency, requires a second model inference

MMR:
+ Avoids redundant context, forces diversity
- May sacrifice most-relevant result for diversity — hurts precision on narrow queries

Query rewriting:
+ Bridges gap between user language and document language
- Adds one LLM call before retrieval, increases total latency

---

## 8. Interview Questions (Senior Level)

- What is the difference between a bi-encoder and a cross-encoder in retrieval?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- When would hybrid search NOT improve retrieval quality?

  **Answer:** When your document corpus uses consistent natural language with no exact identifiers, and your users phrase queries semantically — in this case dense retrieval already captures everything BM25 would find, so hybrid adds complexity with no benefit. Also when your corpus is very small (under 1,000 documents) — at that scale, retrieval quality is rarely the bottleneck and the RRF fusion overhead isn't justified. In AstroIntel, because the domain agents are rule-based with no retrieval layer, hybrid search is irrelevant — it only matters when you actually have a retrieval step.

- Your RAG system retrieves 5 chunks that are all basically saying the same thing. How do you fix it?

  **Answer:** Apply MMR (Maximal Marginal Relevance) instead of pure similarity ranking — it balances relevance against diversity so each additional retrieved chunk adds new information rather than duplicating what's already included. Set the MMR lambda parameter (typically 0.5-0.7) to control the relevance-diversity tradeoff. In Bench Resource Optimizer, redundant CV chunks were a real problem — multiple sections of the same employee's CV scoring high for the same query. MMR combined with a max-one-chunk-per-document filter resolved it.

- How does Reciprocal Rank Fusion work and why is it used instead of score normalization?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- Walk me through how you would improve RAG retrieval quality after deploying the initial version.

  **Answer:** Start with measurement: run RAGAS context precision and recall on a 50-query sample from live traffic. If context recall is low (< 0.75), the retriever is missing relevant chunks — add hybrid search (BM25 + dense). If context precision is low despite decent recall, add a reranker to filter the top-K to top-4. If both are fine but faithfulness is low, the issue is in generation, not retrieval — tighten the system prompt. In Bench Resource Optimizer, the first optimization after baseline was adding HyDE for the employee matching queries because developer-style CV language and manager-style query language had a style mismatch that dense retrieval struggled with.

---

## 9. Answer Framework

Step 1 — Start with the baseline:
"Basic embedding similarity retrieval handles semantic queries well. It fails on exact terminology and returns redundant results."

Step 2 — Layer optimizations in ROI order:
"Highest ROI: hybrid search (fixes the exact match problem). Second: reranker (improves precision significantly). Third: MMR (adds diversity)."

Step 3 — Explain trade-offs:
"Each optimization adds latency. Reranking adds 200ms. I apply them selectively based on measured quality gaps, not by default."

Step 4 — From your project:
"In the LangChain demo, I used dense-only retrieval. For production, I would add hybrid search first — that single change would fix most user-reported retrieval failures."

Step 5 — Measurement:
"I measure retrieval quality with RAGAS context precision and context recall. I track these weekly and apply optimizations when metrics fall below target."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: What is the difference between a bi-encoder and a cross-encoder?

Answer:
Bi-encoder: embeds query and document independently, computes similarity as dot product or cosine. Fast because embeddings can be pre-computed for all documents. Used in the initial retrieval pass — ANN search over millions of documents.
Cross-encoder: takes the (query, document) pair as a single input, processes them together with full attention. Produces a single relevance score. Much more accurate because it models the interaction between query and document. But cannot pre-compute — you must run inference on every (query, document) pair at query time.
Production pattern: bi-encoder for fast first-pass retrieval (top-50 candidates), cross-encoder for accurate reranking (top-50 → top-5). You get the speed of bi-encoder with the accuracy of cross-encoder.
Models: all-MiniLM-L6-v2 (bi-encoder, local, free), cross-encoder/ms-marco-MiniLM-L-6-v2 (cross-encoder, local, free), Cohere Rerank API (managed cross-encoder with high accuracy).

---

Q2: How does RRF work and why is it better than weighted score averaging?

Answer:
Weighted score averaging fails because scores from different retrieval systems are not comparable. A cosine similarity of 0.85 from a dense retriever has no meaningful relationship to a BM25 score of 12.3 from a sparse retriever. Adding them directly produces arbitrary results.
RRF works on ranks, not scores. For each document, take its rank in the dense results and its rank in the sparse results. Compute: 1/(k + rank) for each, sum them across systems.
Why this works: ranks are comparable across systems. The document ranked #1 by dense and #2 by sparse has strong combined evidence. The document ranked #1 by dense but not appearing in sparse results has weaker evidence.
The k parameter (typically 60) prevents high-ranked documents from dominating too strongly. RRF is robust to outliers in individual scoring systems.
Practical outcome: RRF consistently outperforms naive score merging and is the standard fusion approach in production hybrid search systems.

---

Q3: When would you NOT add a reranker?

Answer:
Three scenarios.
First, latency requirement is hard: if the SLA is under 200ms and you are already at 150ms, a reranker that adds 200ms blows the SLA. In this case, improve retrieval precision at the embedding/chunking level instead.
Second, corpus is small and well-chunked: if you have 500 documents with clean, focused chunks, the bi-encoder retrieval is already highly precise. Adding a reranker is over-engineering.
Third, query volume is very high and cost matters: reranking runs a cross-encoder on up to 50 candidate pairs per query. At 100,000 queries/day, this adds significant compute cost. Evaluate whether the quality improvement justifies the cost.
Rule of thumb: add a reranker when your context precision (measured by RAGAS) is below 0.75 despite good chunking and embedding. If precision is already above 0.85 on your eval set, the reranker ROI is marginal.

---

Q4: How do you handle a query that is too vague for any retrieval strategy?

Answer:
Three options in increasing complexity.
First, query clarification: instead of trying to retrieve for a vague query, ask the user for clarification. "Could you be more specific about what aspect of X you want to know?" This is the best option when latency allows.
Second, query expansion: use the LLM to generate 3 specific versions of the vague query, retrieve for each, merge results. Covers the range of what the user might mean.
Third, intent classification: classify the query into predefined intent categories, each with a specialized retrieval strategy. "General overview" intent → retrieve high-level summary documents. "Specific fact" intent → precise dense retrieval.
In production: log all queries where the similarity threshold was not met (no relevant chunks found). These are your vague query cases. Analyze them weekly — if a pattern emerges, build a specific handler for that intent type.

---

Q5: How does your Java/Spring background help you think about retrieval optimization?

Answer:
Query optimization in Java/databases and retrieval optimization in RAG have a close conceptual parallel.
In Java, when a database query is slow, you add an index — you don't rewrite the application logic. In RAG, when retrieval is poor, you improve chunking or add a BM25 index — you don't immediately jump to a more complex LLM.
The diagnostic approach is the same: measure first, then optimize. I use RAGAS metrics the same way I use EXPLAIN plans in SQL — to understand WHERE the pipeline is losing quality before deciding what to change.
The dual-path hybrid search pattern (dense + sparse → merge) is directly analogous to a JOIN query that combines two result sets — the query planner merges them based on a combined relevance score, same as RRF merges two ranked lists.
Caching: in Spring, I cache expensive DB query results. In RAG, I cache embedding results and frequent query retrievals. Same pattern, different layer.
This cross-domain thinking is what makes a senior engineer effective — you are not learning RAG from scratch, you are applying proven distributed systems patterns to a new domain.
