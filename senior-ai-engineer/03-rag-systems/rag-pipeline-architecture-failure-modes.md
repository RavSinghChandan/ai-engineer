# Senior AI Engineer — Module 3
# Topic: RAG Pipeline — Full Architecture + Failure Modes

---

## 1. Intuition

RAG is the most important pattern in production AI engineering today. Almost every enterprise AI feature is a RAG system underneath.

Junior engineers implement the happy path. Senior engineers design for failure — what happens when retrieval returns nothing, when the context is too long, when the LLM ignores the context entirely.

---

## 2. Core Concept

RAG (Retrieval Augmented Generation):
Instead of relying on the LLM's training knowledge (which may be outdated or wrong), inject relevant documents into the context at query time.

The core loop:
```
User Query
    ↓
Embed query → search vector DB → retrieve top-K chunks
    ↓
Build prompt: system + retrieved context + user query
    ↓
LLM generates answer grounded in retrieved context
    ↓
Return response (optionally with source citations)
```

### Two phases — ingestion and query:

Ingestion (offline, run once or on document updates):
```
Raw Documents (PDF, HTML, DB, API)
    ↓ Document Loader
    ↓ Text Cleaner (remove noise, normalize)
    ↓ Chunker (split into retrieval units)
    ↓ Embedding Model (text → vector)
    ↓ Vector Store (upsert vectors + metadata)
    ↓ Metadata Store (map chunk_id → original text, source, timestamp)
```

Query (online, per user request):
```
User Query
    ↓ Embed query
    ↓ Vector similarity search → top-K chunks
    ↓ (Optional) Reranker → reorder by relevance
    ↓ Context assembly → build prompt
    ↓ LLM call → generate answer
    ↓ (Optional) Faithfulness check
    ↓ Return answer + citations
```

---

## 3. Why / When to Use

Use RAG when:
- Domain knowledge changes frequently (product docs, policies, pricing)
- LLM training data does not cover your domain (internal company data)
- You need source attribution ("answer based on policy document v3.2")
- You cannot fine-tune (cost, time, compliance)

Do NOT use RAG when:
- The task is pure reasoning with no external facts needed
- The corpus is small enough to fit in system prompt directly
- Real-time data is needed (RAG adds retrieval latency — consider direct DB query instead)

---

## 4. How It Works — Failure Modes (Senior Focus)

### Failure Mode 1 — Retrieval Failure (Nothing Relevant Retrieved)
Symptom: LLM says "I don't have information about that" even though the document exists.
Causes: poor chunking (split a key sentence across chunks), wrong embedding model, query not similar to document phrasing.
Fix: hybrid search (vector + keyword), query rewriting, HyDE (generate hypothetical answer to use as retrieval query).

### Failure Mode 2 — Retrieval Hallucination (Wrong Chunks Retrieved)
Symptom: LLM answers confidently but from a wrong document.
Causes: similarity threshold too low, similar-sounding but unrelated documents in corpus.
Fix: raise similarity threshold, add reranker, add source verification.

### Failure Mode 3 — Context Ignored (LLM Uses Training Knowledge Instead)
Symptom: retrieved context is correct but LLM ignores it and answers from memory.
Causes: weak system prompt, high temperature, context placed poorly in prompt.
Fix: explicit system prompt "answer ONLY from provided context", place context before user query, temperature 0.1.

### Failure Mode 4 — Context Overflow (Too Many Chunks)
Symptom: quality degrades on long documents, "lost in the middle" effect.
Causes: too many retrieved chunks, context size approaching limit.
Fix: reduce top-K, add reranker to keep only highest-relevance chunks, compress chunks.

### Failure Mode 5 — Stale Data (Documents Updated but Index Not)
Symptom: LLM answers with outdated information.
Causes: ingestion pipeline ran once at setup, no incremental update mechanism.
Fix: event-driven re-ingestion on document updates, track last_indexed_at vs last_modified_at.

---

## 5. Code Skeleton (Production-Grade)

```python
from dataclasses import dataclass
from typing import Optional
import logging

logger = logging.getLogger(__name__)

@dataclass
class RAGResponse:
    answer: str
    sources: list[dict]
    faithfulness_score: Optional[float]
    retrieval_count: int
    fallback_used: bool

class ProductionRAGPipeline:
    def __init__(self, vector_store, embedding_model, llm_client, reranker=None):
        self.vector_store = vector_store
        self.embedding_model = embedding_model
        self.llm = llm_client
        self.reranker = reranker
        self.similarity_threshold = 0.75
        self.max_context_chunks = 5
    
    def query(self, user_query: str, top_k: int = 10) -> RAGResponse:
        # Step 1: Embed query
        query_vector = self.embedding_model.embed(user_query)
        
        # Step 2: Retrieve
        raw_results = self.vector_store.search(query_vector, top_k=top_k)
        
        # Step 3: Filter by similarity threshold
        relevant = [r for r in raw_results if r["score"] >= self.similarity_threshold]
        
        if not relevant:
            logger.warning(f"No relevant chunks found for query: {user_query[:100]}")
            return RAGResponse(
                answer="I don't have information about that in my knowledge base.",
                sources=[], faithfulness_score=None, retrieval_count=0, fallback_used=True
            )
        
        # Step 4: Rerank if available
        if self.reranker:
            relevant = self.reranker.rerank(user_query, relevant)[:self.max_context_chunks]
        else:
            relevant = relevant[:self.max_context_chunks]
        
        # Step 5: Build context
        context = self._build_context(relevant)
        
        # Step 6: LLM call
        system_prompt = """You are a precise assistant. Answer ONLY using the provided context.
If the answer is not in the context, say "I don't have that information."
Never invent or assume information not present in the context."""
        
        user_message = f"""Context:
{context}

Question: {user_query}

Answer based only on the above context:"""
        
        answer = self.llm.complete(system_prompt, user_message)
        
        # Step 7: Faithfulness check (production gate)
        faithfulness = self._check_faithfulness(user_query, answer, context)
        
        if faithfulness < 0.7:
            logger.warning(f"Low faithfulness {faithfulness:.2f} — returning safe fallback")
            return RAGResponse(
                answer="I found some information but cannot provide a reliable answer. Please consult the source document directly.",
                sources=[r["metadata"] for r in relevant],
                faithfulness_score=faithfulness,
                retrieval_count=len(relevant),
                fallback_used=True
            )
        
        return RAGResponse(
            answer=answer,
            sources=[r["metadata"] for r in relevant],
            faithfulness_score=faithfulness,
            retrieval_count=len(relevant),
            fallback_used=False
        )
    
    def _build_context(self, chunks: list[dict]) -> str:
        parts = []
        for i, chunk in enumerate(chunks, 1):
            source = chunk["metadata"].get("source", "Unknown")
            parts.append(f"[Source {i}: {source}]\n{chunk['text']}")
        return "\n\n".join(parts)
    
    def _check_faithfulness(self, query: str, answer: str, context: str) -> float:
        # Simplified: check if answer contains key phrases from context
        # Production: use RAGAS faithfulness metric
        context_sentences = set(s.strip().lower() for s in context.split('.') if len(s) > 20)
        answer_sentences = answer.lower().split('.')
        grounded = sum(1 for s in answer_sentences if any(c[:30] in s for c in context_sentences))
        return grounded / max(len(answer_sentences), 1)
```

---

## 6. Example (From Your Projects)

**LangChain Service RAG:**
- Ingestion: PDF → PyPDFLoader → RecursiveCharacterTextSplitter (1000 chars, 200 overlap) → OpenAI embeddings → FAISS
- Query: user question → embed → FAISS similarity search → top-4 chunks → GPT-4 with RetrievalQA chain

What I would add for production:
1. Similarity threshold filter (currently returns top-K regardless of relevance)
2. Faithfulness scoring before returning answer
3. Fallback message when no relevant chunks found instead of hallucinating
4. Citation metadata in response so user can verify the source

In interview: "The basic LangChain RAG demo works for a happy path. For production, I add three things: a similarity threshold gate so irrelevant retrieval is caught early, a faithfulness check before the response is returned, and an event-driven re-ingestion pipeline so the index stays current as documents update."

---

## 7. Trade-offs

Dense retrieval (embedding-only):
+ Handles synonyms and paraphrases, semantic understanding
- Misses exact terminology (product codes, identifiers), requires embedding model

Sparse retrieval (BM25/keyword-only):
+ Fast, exact matches, no embedding cost
- Misses semantic similarity, breaks on paraphrases

Hybrid (dense + sparse):
+ Best of both worlds, highest recall
- More complex query pipeline, slightly higher latency

Higher top-K retrieval:
+ Less chance of missing relevant chunk
- More noise in context, higher token cost, "lost in the middle" risk

Reranking:
+ Dramatically improves precision of final context
- Adds 100-300ms latency, additional model call cost

---

## 8. Interview Questions (Senior Level)

- Walk me through a production RAG pipeline end-to-end including failure handling.

  **Answer:** Ingestion: document → chunking (512 tokens, recursive, with overlap) → embedding model → vector store upsert, with metadata (source, updated_at, text_hash). Query: user question → embed query → hybrid search (BM25 + vector, RRF merge) → similarity threshold gate (reject below 0.7) → reranker → top-4 chunks → LLM generation with source attribution → faithfulness check before returning. Failure handling at each stage: if embedding fails, retry with backoff; if retrieval returns nothing, return a "no relevant context" message rather than hallucinating; if LLM call fails, circuit breaker kicks in and serves cached response. In Bench Resource Optimizer, the CRAG quality scoring layer sits between retrieval and generation — if retrieved chunks score below threshold, we route to web search or refuse to answer.

- What are the most common ways RAG systems fail in production?

  **Answer:** Five failure modes in order of frequency: (1) poor chunking splits key facts across boundaries — retrieval looks good by score but the retrieved content is incomplete; (2) the query is a paraphrase that doesn't match the vocabulary in chunks — semantic search misses it; (3) the vector index is stale — document was updated but re-embedding hasn't run; (4) top-K retrieval returns irrelevant chunks above the relevance threshold — no similarity filter — and the LLM hallucinates to fill the gap; (5) the LLM ignores the context and answers from training data when the context doesn't clearly contain the answer. I address these with hybrid search (fixes 2), a similarity threshold gate (fixes 4), event-driven re-embedding (fixes 3), and a faithfulness check (detects 5).

- How do you handle a query where no relevant documents are retrieved?

  **Answer:** Return a clean "I don't have information about this in the provided documents" response rather than letting the LLM answer from its training data. Implement a similarity threshold gate — if the highest-scoring retrieved chunk is below 0.7 cosine similarity, treat retrieval as failed and return the fallback. Never send empty or low-relevance context to the LLM and expect it to say "I don't know" — models hallucinate when given no relevant context to work with. Log these no-retrieval events as they indicate coverage gaps in your document corpus.

- How do you keep your RAG index fresh when underlying documents change frequently?

  **Answer:** Event-driven re-embedding triggered by document updates — whenever a document changes in the CMS or database, emit an event to a queue; the embedding worker processes it and upserts the new vector, replacing the old one by document ID. Track `text_hash` per chunk so the worker skips re-embedding if content hasn't actually changed. For batch updates, run a nightly reconciliation job that compares source document checksums against stored hash values and re-embeds any that have drifted. FAISS cannot handle this cleanly — it's another reason production RAG systems move to pgvector or Pinecone where upsert is a first-class operation.

- What is the difference between recall and precision in retrieval and how do you tune the trade-off?

  **Answer:** Recall = of all relevant documents in the corpus, what fraction did retrieval return. Precision = of all retrieved documents, what fraction were actually relevant. High K (retrieve more chunks) improves recall but hurts precision — you return more irrelevant context and inflate the prompt. Adding a reranker after retrieval recovers precision without sacrificing recall: retrieve top-20 for high recall, rerank to top-4 for high precision. In Bench Resource Optimizer, we tune this by evaluating LLM-as-judge scores on generated plans — if the judge scores drop, we increase K or adjust the reranker threshold.

---

## 9. Answer Framework

Step 1 — Define the architecture:
"RAG has two phases: ingestion (documents → chunks → embeddings → vector DB) and query (user question → embed → retrieve → context assembly → LLM → answer)."

Step 2 — Cover failure modes proactively:
"The three most common failures I design against: no relevant chunks retrieved, stale index, and LLM ignoring retrieved context."

Step 3 — From your project:
"In the LangChain service, I implemented the standard RAG pipeline with FAISS. For AstroIntel, each agent had a specialized prompt instead of RAG — the birth profile was the context, not retrieved documents."

Step 4 — Production hardening:
"In production, I add a similarity threshold gate, a faithfulness score before returning the answer, and an event-driven re-ingestion pipeline for document updates."

Step 5 — Scale consideration:
"At scale, hybrid search (vector + BM25) and reranking are the two highest-ROI improvements to retrieval quality. They add latency but the precision gain is significant."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: How do you decide what chunk size to use?

Answer:
Chunk size is a retrieval-quality trade-off, not a fixed answer.
Small chunks (256-512 tokens): high precision — each chunk is focused on one topic. Risk: a key sentence that spans a chunk boundary is split and neither chunk retrieves reliably.
Large chunks (1024-2048 tokens): higher recall — less chance of splitting a key idea. Risk: each chunk covers multiple topics, the retrieval returns noisy context.
In practice: start with 512 tokens and 10-20% overlap. Evaluate retrieval quality (context precision and recall via RAGAS). Adjust based on your corpus structure — short policy documents need smaller chunks, long technical manuals need larger ones.
The overlap (10-20%) is non-negotiable for production — it ensures that sentences near chunk boundaries appear in at least one chunk's full context.

---

Q2: A user asks a question that requires combining information from 3 different documents. How does standard RAG handle this?

Answer:
Standard RAG struggles with multi-hop questions because it retrieves top-K chunks by similarity to the single query — it does not reason about which combination of documents answers the question.
What happens: if the answer requires facts from Documents A, B, and C, the top-K retrieval may surface only one or two of the relevant documents, producing an incomplete or wrong answer.
Solutions:
First, multi-query retrieval: generate 2-3 rephrased versions of the query, retrieve for each, merge the results. Higher chance of surfacing all relevant documents.
Second, iterative retrieval: answer the question in steps — retrieve for part 1, use that answer to generate a follow-up query, retrieve for part 2. This is closer to agentic RAG.
Third, graph-based RAG: build a knowledge graph over your documents. Multi-hop questions traverse the graph instead of doing isolated vector searches.
For most production systems: multi-query retrieval is the simplest and most effective fix for multi-document questions.

---

Q3: How do you measure and improve RAG retrieval quality?

Answer:
Measure with RAGAS metrics: context precision (were the retrieved chunks actually relevant?) and context recall (was all the relevant information retrieved?).
Improve retrieval quality in this order:
First: fix chunking — bad chunk boundaries cause both low precision and low recall.
Second: add hybrid search — keyword search catches exact matches that semantic search misses.
Third: add a reranker — cross-encoder rerankers significantly improve the ordering of retrieved chunks.
Fourth: query rewriting — rephrase the user's query before embedding (users write conversationally, documents are written formally — closing this gap improves retrieval).
Fifth: HyDE — generate a hypothetical answer and use its embedding as the retrieval query, not the question's embedding.
In production: track context precision and recall weekly. If either drops below your baseline after a deployment, check what changed in ingestion, embedding, or query processing.

---

Q4: How do you add source citation to RAG responses?

Answer:
Store source metadata (document name, page number, section, URL) alongside each vector in the index.
When chunks are retrieved, pass the metadata to the LLM along with the text.
Instruct the LLM in the system prompt: "When using information from the provided context, cite the source in your answer using [Source N] notation."
After the response, extract citations, validate they reference real retrieved sources (not hallucinated sources), and return them alongside the answer.
Production consideration: if a user can click a citation and see the source document, they will catch errors. This is a feature, not a risk — it creates a feedback loop where wrong citations get reported and improve your system.

---

Q5: How does your Java/microservices experience help you design a better RAG ingestion pipeline?

Answer:
Significantly — in ways that pure ML engineers typically miss.
First, event-driven ingestion: I naturally think in terms of event producers and consumers. Document created/updated → emit event → ingestion consumer re-embeds → vector DB updated. This is a standard messaging pattern I built many times in Spring Boot + Kafka before touching AI.
Second, idempotency: the ingestion pipeline must be idempotent — running it twice on the same document should not create duplicate vectors. I design with document ID as the primary key and upsert semantics.
Third, observability: I instrument the ingestion pipeline with metrics — documents processed per hour, embedding latency P95, queue depth, failure rate. If the pipeline falls behind, I want an alert before users notice stale results.
Fourth, schema versioning: when the embedding model changes, I treat it like a DB schema migration — version the index, run the migration job, validate before switching traffic. Same discipline as Flyway/Liquibase migrations in Java.
These are production engineering habits that make the difference between a RAG pipeline that works in a demo and one that runs reliably at 3am.

---

## ★ YOUR 5 PROJECTS — RAG Pipeline Decisions

| Project | RAG? | Architecture | Latency |
|---------|------|-------------|---------|
| **AstroIntel 360°** | Partial RAG | FAISS for domain knowledge enrichment. Multi-query expansion for ambiguous spiritual terms. CRAG-equivalent: if domain agent confidence < threshold, escalate to broader query. | SSE streaming — TTFT < 2s |
| **Bench Resource Optimizer** | Full 5-layer RAG | `query → BM25+FAISS → RRF → HyDE → CRAG quality gate → cross-encoder reranker → LLM`. Top-20 after fusion, top-5 after reranker. Recall: FAISS 60% → full stack 83%+. | Full pipeline ~3s, L1 cache < 1ms |
| **RunbookAI** | **RAGless** | No RAG. SQL: `SELECT steps FROM runbook_steps WHERE category=? AND severity=?`. Deterministic. `commands_source: "database"` on every response. | < 100ms — no embedding, no LLM |
| **Agentic Growth OS** | No RAG | Campaign memory via JSON + string similarity. No vector retrieval in any agent node. | ~3–5s full pipeline (5 LLM calls) |
| **Universal Agent** | Optional RAG | `knowledge_base.enabled: false` (default) = vectorless. `true` = FAISS top-k retrieval. Toggle in YAML, no code change. | Chat ~1–3s; locked = instant |

**Interview line:** "Bench is my most complete RAG implementation — every advanced pattern applied and measured: BM25 for exact skill name recall, HyDE for role description style matching, CRAG for poor retrieval fallback, cross-encoder reranker for precision. RunbookAI is the opposite extreme — RAGless — and it's actually more reliable for its domain."
