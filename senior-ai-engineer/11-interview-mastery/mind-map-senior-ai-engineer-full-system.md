# Senior AI Engineer — Module 11
# Topic: Mind Map — Senior AI Engineer Full System View

---

## 1. Intuition

This module is a single-page mental model of the entire Senior AI Engineer knowledge space. Use it as:
- A pre-interview review (15 minutes to scan the whole map)
- A gap checker (which areas feel uncertain?)
- A conversation anchor (can you speak to every node?)

---

## 2. The Full System Map

```
SENIOR AI ENGINEER — FULL SYSTEM VIEW
═══════════════════════════════════════════════════════════════════════

1. LANGUAGE MODELS (the foundation)
   ├── Architecture: transformer, attention, autoregressive decoding
   ├── Key models: GPT-4o, Claude 3.5, Gemini Pro, Llama 3, Mistral
   ├── Token economics: cost per token, model tiers, cost optimization
   ├── Context window: sliding window, summarization, map-reduce
   └── Alignment: RLHF → SFT → reward model → PPO | DPO (simpler)

2. PROMPT ENGINEERING
   ├── Versioning: prompts/v1/, v2/ — treat prompts as code
   ├── Structured output: JSON mode, Pydantic validators, repair fallback
   ├── Chain-of-Thought: step-by-step → better reasoning, more tokens
   ├── Few-shot: 3-10 examples inline → consistent format
   └── Security: injection guards, hardened system prompt, output sanitization

3. EMBEDDINGS & VECTOR SEARCH
   ├── Models: text-embedding-3-small ($0.02/1M) vs ada-002 ($0.10/1M)
   ├── Dimensions: 1536 (ada-002), 1536 (3-large), 3072 (3-large max)
   ├── Vector stores:
   │   ├── FAISS: in-process, no infra, 1-5ms, no metadata filter
   │   ├── pgvector: SQL joins, tenant isolation, HNSW index
   │   └── Pinecone: managed, namespaces, billions of vectors
   ├── Search types: dense (ANN), sparse (BM25), hybrid (RRF)
   └── Drift: cosine similarity distribution shift → trigger re-embed

4. RAG (Retrieval Augmented Generation)
   ├── Pipeline: chunk → embed → store → retrieve → augment → generate
   ├── Chunking: fixed (512t), recursive, semantic, hierarchical
   ├── Retrieval: similarity search → reranker (CrossEncoder) → MMR
   ├── Advanced: HyDE, Multi-query, CRAG, Self-RAG
   ├── Evaluation: RAGAS (faithfulness, relevancy, precision, recall)
   └── Failure modes: precision↓ → irrelevant chunks | recall↓ → missing chunks | faithfulness↓ → hallucination

5. AGENTS & ORCHESTRATION
   ├── Agent types: ReAct, Plan-and-Execute, Tree-of-Thought
   ├── Patterns: Supervisor, Parallel Map-Reduce, Hierarchical
   ├── LangGraph: StateGraph, conditional edges, interrupt/resume, checkpointing
   ├── LangChain: document loaders, LCEL, escape hatches for production
   ├── Tool use: Pydantic validators, retry decorator, SafeToolExecutor
   └── State management: in-context, episodic (Redis), semantic, procedural

6. PRODUCTION RELIABILITY
   ├── Retry: exponential backoff + jitter (Resilience4j analogy)
   ├── Circuit breaker: 5 failures → open 60s → half-open probe
   ├── Fallback chain: GPT-4o → GPT-4o-mini → Claude Haiku
   ├── Rate limits: TPM/RPM tracking, proactive routing before 429
   └── Guardrails: injection detection, output validation, faithfulness gate

7. ASYNC & EVENT-DRIVEN
   ├── Kafka: producer → topic → consumer group (document ingestion)
   ├── AstroIntel Kafka: acks="all", gzip, retry+jitter, DLQ, 3 consumer workers
   ├── Job store: write-through Redis DB1, recovery on miss, increment_retry()
   ├── Celery + Redis: async tasks, retry, DLQ, priority queues
   ├── Pattern: submit → task_id → worker processes → SSE progress
   └── Long-running: checkpoint per step, background execution, status API

8. STREAMING
   ├── SSE: FastAPI StreamingResponse → Nginx (X-Accel-Buffering:no) → Angular EventSource
   ├── Token streaming: stream=True → delta.content accumulation
   ├── Tool call streaming: buffer until finish_reason=tool_calls → parse → execute
   ├── TTFT: time to first token (target < 500ms — bottleneck is retrieval, not LLM)
   └── Angular: signals + EventSource → reactive DOM updates

9. SERVING & MLOPS
   ├── FastAPI: production REST API, async endpoints, health check
   ├── vLLM: open source LLM serving, OpenAI-compatible, continuous batching
   ├── BentoML: ML service packaging, model registry
   ├── Monitoring: latency histogram, cost counter, faithfulness gauge, drift detector
   ├── Versioning: pin model dates, prompt versioning, embedding model tracking
   └── Feedback loops: thumbs up/down → DPO training data → fine-tune cycle

10. FINE-TUNING
    ├── When: format/style/behavior (fine-tune) vs external facts (RAG)
    ├── LoRA: low-rank adapters, ~1% parameter update, single GPU
    ├── QLoRA: 4-bit base model, fits on 16GB GPU, $3-8 to train 7B model
    ├── DPO: preference pairs → no reward model needed → simpler than RLHF
    └── Dataset: 100-1000 examples, JSONL, train/val split 90/10

11. SECURITY
    ├── Prompt injection: regex guards, injection pattern detection
    ├── Jailbreaks: hardened system prompt, output classifier
    ├── Data leakage: tenant isolation in retrieval, no PII in prompts
    └── Defense in depth: input sanitize → permission filter → output validate

12. COST OPTIMIZATION (5 levers)
    ├── Model tiering: gpt-4o-mini for format tasks (~10x cheaper)
    ├── Semantic caching: cache by query embedding similarity (60-70% hit rate)
    ├── Prompt compression: remove filler, shorter context
    ├── max_tokens: cap output length based on use case
    └── Batching: batch embedding calls (100x cheaper than per-item)

13. JAVA/SPRING BRIDGE (your differentiator)
    ├── Resilience4j ↔ LLM retry/circuit breaker patterns
    ├── Spring Batch ↔ Celery task chains (step-level restart)
    ├── Kafka consumer ↔ LLM ingestion worker (same pattern, different payload)
    ├── Spring Boot REST ↔ FastAPI (same concepts: DI, middleware, health check)
    └── @Async ↔ Celery/asyncio (non-blocking LLM task execution)
```

---

## 3. Decision Trees (Quick Reference)

### Choosing a Vector Store
```
Need managed SaaS, > 10M vectors → Pinecone
Already on PostgreSQL, < 5M vectors → pgvector
Prototype / on-prem / single tenant → FAISS
High-performance self-hosted, need payload filters → Qdrant
```

### Fine-tuning vs RAG
```
Knowledge changes frequently → RAG
Need source attribution → RAG
Behavior/style/format consistency → Fine-tune
Data privacy (can't send to OpenAI) → LoRA on self-hosted
Both: factual grounding + consistent format → RAG + Fine-tune
```

### Sync vs Async Processing
```
Response time < 3s, single user → Sync
Response time 3-30s, moderate load → Sync with SSE progress
Response time > 30s, any load → Async (Celery task queue)
Batch processing (documents, reports) → Async always
```

### LangChain vs LangGraph vs Direct
```
Simple RAG pipeline, demo → LangChain
Multi-step agent with loops → LangGraph
Human-in-the-loop → LangGraph (interrupt/resume)
Production with cost tracking → Direct OpenAI SDK
```

---

## 4. Numbers Reference Card

LLM Pricing (approximate):
- GPT-4o: $2.50 input / $10 output per 1M tokens
- GPT-4o-mini: $0.15 input / $0.60 output per 1M tokens
- Claude Sonnet 4.6: $3.00 input / $15 output per 1M tokens
- Claude Haiku 4.5: $0.08 input / $0.40 output per 1M tokens
- text-embedding-3-small: $0.02 per 1M tokens
- text-embedding-ada-002: $0.10 per 1M tokens

Latency Targets:
- Embedding (single call): 50-100ms
- FAISS search (10K vectors): 1-5ms
- pgvector search (100K vectors): 5-20ms
- Pinecone query: 10-50ms
- GPT-4o (500 tokens): 2-5s
- GPT-4o-mini (500 tokens): 0.5-2s
- TTFT target: < 500ms
- Total RAG latency target: < 3s

AstroIntel Reference Numbers:
- 8-node LangGraph StateGraph (security→question→domain→meta→hallucination→remedy→admin→grammar)
- 8-10 DeepSeek LLM calls per analysis (max_tokens=250, HTTP timeout=8s)
- Pipeline latency: ~4s (from 78s — 3 optimization rounds)
- Cost per analysis: ~$0.000137 (DeepSeek pricing)
- 3-tier cache: L1 in-memory + L2 Redis DB0 + L3 semantic similarity
- Enterprise Kafka: 3 consumer workers, acks=all, gzip, retry+DLQ+graceful shutdown
- Job persistence: write-through Redis DB1, recovery on miss
- Test suite: 82/82 Kafka+Redis tests passing

---

## 5. The One-Paragraph Self-Introduction

Memorize this. Deliver it in 45 seconds.

"I'm a Senior Full Stack Engineer with 6+ years in Java, Spring Boot, Angular, DevOps, and cloud architecture. In the last year, I've built two production AI systems: AstroIntel, a multi-agent astrological analysis platform — 8-node LangGraph StateGraph, 5 parallel domain agents, enterprise Kafka async pipeline with 3 consumer workers and DLQ, 3-tier Redis cache, G1–G5 production guardrails, and human-in-the-loop admin review. The pipeline runs in ~4s (optimized from 78s) at $0.000137/analysis. My second project is a LangChain AI Service demonstrating RAG, agent tool use, and LCEL streaming pipelines. My backend background gives me a unique angle — I apply distributed system patterns (circuit breakers, Kafka consumer groups, Redis connection pooling) directly to AI infrastructure. I'm targeting Senior AI Engineer roles where I can architect and ship production-grade AI systems, not just prototype them."

---

## 6. The Closing Statement

Use this when asked "do you have any questions?" — it signals you're thinking at the system level.

"I do have one question: what's the hardest technical problem your AI team is solving right now? Is it latency at scale, cost optimization, hallucination reduction, or something else? I ask because I want to understand where the real engineering challenges are — the ones that don't show up in job descriptions."

This question:
1. Shows you understand the hard problems in AI engineering
2. Signals you're evaluating them as much as they're evaluating you
3. Often leads to a genuine technical conversation that lets you demonstrate deeper knowledge
