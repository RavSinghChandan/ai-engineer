# Senior AI Engineer — Module 5
# Topic: RAG at Scale — Latency Budget, Caching, CDN, DB Design

---

## 1. Intuition

A RAG system that returns answers in 8 seconds is not production-ready. Users abandon after 3 seconds.
Scaling RAG is not about making the LLM faster — you cannot. It is about eliminating unnecessary latency everywhere around the LLM.

Senior engineers budget latency like they budget money: every component gets an allocation, and nothing is free.

---

## 2. Core Concept

### Latency Budget for RAG Query (Target: < 2 seconds)

```
Component                  Target        Notes
─────────────────────────────────────────────────────────────────
API gateway + auth         < 20ms        JWT validation, cached
Query embedding            < 100ms       text-embedding-3-small
Vector search              < 50ms        Pinecone / pgvector
Reranker (optional)        < 200ms       skip if latency critical
LLM call (streaming)       < 1500ms      to first token (TTFT)
Response assembly          < 30ms        citation formatting
─────────────────────────────────────────────────────────────────
Total (without reranker)   ~1700ms       achievable with small model
Total (with reranker)      ~1900ms       borderline on 2s SLA
```

The LLM call dominates. Every optimization elsewhere is about buying back budget for the LLM.

### Caching Layers

**Semantic cache (application layer):**
Cache LLM responses keyed by semantic similarity of the query embedding.
Hit when a similar query was already answered (cosine similarity > 0.92).
Hit rate: 25-40% on enterprise chatbots where users ask similar questions.

**AstroIntel 3-tier cache (actually implemented):**
```
L1 in-memory:  dict-based, O(1) lookup, evicted on restart
L2 Redis DB0:  ConnectionPool(max_connections=20, health_check_interval=30)
               Profile TTL = 30 days (birth chart is mathematically immutable)
               Session TTL = 20 minutes
               Pub/sub invalidation: channel astrointel:cache:invalidate
               Batch: redis_mget() for multi-key lookups, redis_pipeline_set() for writes
L3 semantic:   SentenceTransformer embedding, cosine ≥ 0.92 threshold
               Catches: "career in 2025" vs "job prospects this year" (same cache hit)

Cache hit rate: ~35% on repeat users → 35% of analyses cost $0 in LLM calls
Cache dedup fix: key = profile+question hash only (user_id removed) → same person, any session = same cache entry
```

**Embedding cache:**
Cache query embeddings keyed by exact query text.
Same user asking the same question twice = free embedding.

**Retrieval cache:**
Cache top-K retrieval results keyed by query embedding + filter hash.
Short TTL (5-15 minutes) to handle document updates.

**CDN for static assets:**
LLM-generated content that is the same for all users (static FAQ answers, generated docs) can be served from CDN.

---

## 3. Architecture

```
User Query
    ↓
[L1 Cache check: exact query match] → HIT → return cached response
    ↓ MISS
[L2 Cache check: semantic similarity] → HIT → return cached response
    ↓ MISS
Embed query (100ms)
    ↓
[L3 Cache check: retrieval cache] → HIT → skip vector search
    ↓ MISS
Vector search (50ms)
    ↓
Reranker (200ms, optional)
    ↓
LLM call with streaming (TTFT 500-1500ms)
    ↓
Store in L1 + L2 + L3 caches
    ↓
Return streaming response
```

---

## 4. DB Design for RAG at Scale

```sql
-- Documents table (metadata, not content)
CREATE TABLE documents (
    doc_id UUID PRIMARY KEY,
    tenant_id VARCHAR NOT NULL,
    filename VARCHAR NOT NULL,
    s3_key VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'pending',   -- pending, indexing, ready, failed
    num_chunks INTEGER,
    file_size_bytes BIGINT,
    content_hash VARCHAR,               -- detect duplicate uploads
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_indexed_at TIMESTAMPTZ,
    embedding_model_version VARCHAR,    -- track which model embedded this
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_status ON documents(status);

-- Query logs (for eval and cost tracking)
CREATE TABLE query_logs (
    query_id UUID PRIMARY KEY,
    tenant_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    query_text TEXT NOT NULL,
    retrieved_doc_ids TEXT[],
    answer_text TEXT,
    faithfulness_score FLOAT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost_usd FLOAT,
    latency_ms INTEGER,
    cache_hit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_logs_tenant_date ON query_logs(tenant_id, created_at DESC);

-- Semantic cache table (alternative to Redis for teams on Postgres)
CREATE TABLE semantic_cache (
    cache_id UUID PRIMARY KEY,
    query_embedding VECTOR(1536),
    query_text TEXT,
    response_text TEXT,
    tenant_id VARCHAR,
    doc_filter_hash VARCHAR,
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_semantic_cache_embedding ON semantic_cache 
    USING ivfflat (query_embedding vector_cosine_ops) WITH (lists=100);
```

---

## 5. Code Skeleton (Production-Grade)

```python
import hashlib
import numpy as np
from datetime import datetime, timedelta

class RAGCacheLayer:
    def __init__(self, redis_client, db_session, similarity_threshold: float = 0.92):
        self.redis = redis_client
        self.db = db_session
        self.similarity_threshold = similarity_threshold
    
    # L1: exact match cache (Redis, 1-hour TTL)
    def get_exact(self, query: str, tenant_id: str) -> str | None:
        key = f"exact:{tenant_id}:{hashlib.sha256(query.lower().strip().encode()).hexdigest()}"
        return self.redis.get(key)
    
    def set_exact(self, query: str, tenant_id: str, response: str, ttl: int = 3600):
        key = f"exact:{tenant_id}:{hashlib.sha256(query.lower().strip().encode()).hexdigest()}"
        self.redis.setex(key, ttl, response)
    
    # L2: semantic cache (pgvector)
    def get_semantic(self, query_vector: list[float], tenant_id: str) -> str | None:
        vector_str = "[" + ",".join(map(str, query_vector)) + "]"
        result = self.db.execute("""
            SELECT response_text, 1 - (query_embedding <=> %s::vector) AS similarity
            FROM semantic_cache
            WHERE tenant_id = %s
              AND expires_at > NOW()
              AND 1 - (query_embedding <=> %s::vector) > %s
            ORDER BY query_embedding <=> %s::vector
            LIMIT 1
        """, (vector_str, tenant_id, vector_str, self.similarity_threshold, vector_str)).fetchone()
        
        if result:
            # Increment hit count
            self.db.execute("UPDATE semantic_cache SET hit_count = hit_count + 1 WHERE ...")
            return result["response_text"]
        return None
    
    def set_semantic(self, query_vector: list[float], query: str, tenant_id: str,
                     response: str, ttl_hours: int = 24):
        vector_str = "[" + ",".join(map(str, query_vector)) + "]"
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        self.db.execute("""
            INSERT INTO semantic_cache (cache_id, query_embedding, query_text, response_text, tenant_id, expires_at)
            VALUES (gen_random_uuid(), %s::vector, %s, %s, %s, %s)
        """, (vector_str, query, response, tenant_id, expires_at))

class LatencyMonitor:
    """Track per-component latency for SLA monitoring"""
    def __init__(self):
        self.timings = {}
    
    def start(self, component: str):
        self.timings[component] = {"start": datetime.utcnow()}
    
    def stop(self, component: str) -> int:
        elapsed = (datetime.utcnow() - self.timings[component]["start"]).microseconds // 1000
        self.timings[component]["elapsed_ms"] = elapsed
        return elapsed
    
    def report(self) -> dict:
        return {k: v.get("elapsed_ms", 0) for k, v in self.timings.items()}

# Full production query pipeline with caching and latency tracking
def query_rag_at_scale(query: str, tenant_id: str, user_id: str) -> dict:
    monitor = LatencyMonitor()
    cache = RAGCacheLayer(redis_client, db_session)
    
    # L1: exact cache
    monitor.start("cache_l1")
    cached = cache.get_exact(query, tenant_id)
    monitor.stop("cache_l1")
    if cached:
        log_query(query, tenant_id, user_id, cached, cache_hit=True, timings=monitor.report())
        return {"answer": cached, "cache_hit": True, "cache_level": "exact"}
    
    # Embed
    monitor.start("embedding")
    query_vector = embed_text(query)
    monitor.stop("embedding")
    
    # L2: semantic cache
    monitor.start("cache_l2")
    cached = cache.get_semantic(query_vector, tenant_id)
    monitor.stop("cache_l2")
    if cached:
        log_query(query, tenant_id, user_id, cached, cache_hit=True, timings=monitor.report())
        return {"answer": cached, "cache_hit": True, "cache_level": "semantic"}
    
    # Retrieve
    monitor.start("retrieval")
    chunks = retrieve_chunks(query_vector, tenant_id, top_k=10)
    monitor.stop("retrieval")
    
    # LLM
    monitor.start("llm")
    context = build_context(chunks[:5])
    answer = call_llm("Answer from context.", f"Context: {context}\nQuestion: {query}")
    monitor.stop("llm")
    
    # Store in cache
    cache.set_exact(query, tenant_id, answer)
    cache.set_semantic(query_vector, query, tenant_id, answer)
    
    timings = monitor.report()
    log_query(query, tenant_id, user_id, answer, cache_hit=False, timings=timings)
    
    # Alert if total latency exceeded SLA
    total_ms = sum(timings.values())
    if total_ms > 2000:
        logger.warning(f"SLA breach: {total_ms}ms | tenant={tenant_id} | timings={timings}")
    
    return {"answer": answer, "cache_hit": False, "latency_ms": total_ms}
```

---

## 6. Example (From Your Projects — Senior Framing)

**AstroIntel — latency optimization:**

Parallel agent execution (ThreadPoolExecutor) was round 1 of three latency optimizations — 78s → 15s. Round 2: switched from GPT-4o to DeepSeek (15s → ~8s, cost 50x cheaper). Round 3: 3-tier cache (L1 in-memory + L2 Redis DB0 + L3 semantic) → fresh queries ~4s, cache hits <50ms.

For the query side (if RAG were added):
- Cache birth profile embeddings (same profile asked multiple times → embedding is free)
- Cache analysis results per (birth_profile_hash × question_hash) — if the same person asks the same question twice, return the cached analysis
- Translation caching — if English analysis was previously translated to Hindi, serve from cache

In interview: "The biggest latency win in AstroIntel was parallelizing the agents. That is the general principle: find the sequential bottleneck, make it parallel. For query latency in RAG, the LLM call is the bottleneck — you cannot parallelize it, so you cache aggressively around it."

---

## 7. Trade-offs

Semantic cache:
+ 25-40% cache hit rate on typical enterprise traffic, dramatically reduces LLM cost
- Stale cached responses when underlying documents update — TTL must balance freshness vs cost

High TTL on cache:
+ More cache hits, lower cost
- Users see outdated answers after document updates

Low TTL:
+ Answers always fresh
- Higher cost, lower cache hit rate

Aggressive reranker:
+ Better answer quality
- 200ms added latency — may bust 2-second SLA on complex queries

---

## 8. Interview Questions (Senior Level)

- How do you achieve sub-2-second end-to-end RAG response time?

  **Answer:** Allocate a latency budget per component: embedding 100ms, retrieval 50ms, reranking 150ms, LLM TTFT 1,500ms — leaving 200ms buffer for serialization and network. Cache at L1 (exact match, < 5ms) and L2 (semantic similarity, < 50ms) to eliminate the LLM call entirely on cache hits. Use streaming so the user sees the first token in ~1,500ms even if total generation takes longer. In Bench Resource Optimizer, the semantic cache handles repeated role queries; TTFT for fresh queries is reduced by using DeepSeek which has faster TTFT than GPT-4o on comparable tasks.

- Semantic cache returns a stale answer after a document is updated. How do you handle this?

  **Answer:** *(Already covered in Advanced Follow-ups Q1 — skipped to avoid duplication.)*

- How do you monitor latency regressions in a RAG pipeline?

  **Answer:** *(Already covered in Advanced Follow-ups Q2 — skipped to avoid duplication.)*

- At what point does a semantic cache stop being helpful and start causing more problems?

  **Answer:** When hit rate drops below ~15% — at that point you're paying embedding cost (to compute the query vector for cache lookup) on every request and only saving the LLM call 15% of the time. The embedding lookup plus cache search overhead (20-50ms) may exceed the net latency saving at low hit rates. Also when document update frequency is high — if 30% of your corpus changes daily, cached answers go stale rapidly and the TTL must be so short that effective hit rate collapses. Monitor hit rate and stale-serve rate as dashboard metrics; if hit rate falls below 20%, evaluate whether the cache complexity is still justified.

- How do you balance retrieval quality (more chunks = better) with latency (more chunks = slower)?

  **Answer:** Retrieve larger K (top-20) for recall, then apply a fast reranker to compress to top-4 before LLM context injection — the reranker adds ~150ms but enables high recall retrieval without inflating the LLM context window. The alternative is a two-stage budget: start with top-5, check faithfulness of the generated answer, and if faithfulness is low, re-retrieve with top-20 and regenerate. This adaptive approach keeps P50 latency low (most queries work with top-5) while handling edge cases with more context. In Bench Resource Optimizer, top-10 retrieval with CRAG quality scoring handles the balance — poor quality chunks are discarded before the LLM call regardless of how many were retrieved.

---

## 9. Answer Framework

Step 1 — Latency budget:
"I allocate a latency budget: embedding 100ms, retrieval 50ms, LLM TTFT 1500ms. If the LLM is the bottleneck, I optimize around it — smaller model, streaming, caching."

Step 2 — Caching strategy:
"Three cache layers: exact match (Redis), semantic similarity (pgvector), and retrieval cache (short TTL). At 30% cache hit rate, 30% of queries return in < 50ms instead of 2 seconds."

Step 3 — From your project:
"In AstroIntel, the latency win came from parallelizing the agents. For RAG systems, the equivalent win is semantic caching — reducing the LLM call frequency."

Step 4 — Scale:
"At 50K queries/day, a 30% cache hit rate saves 15K LLM calls/day. At $0.0002/call on mini, that's $3/day or $90/month — significant savings for a minor engineering investment."

Step 5 — Monitoring:
"I track per-component latency in every query log. If embedding time spikes, it signals an embedding API issue. If retrieval time spikes, it signals vector DB overload. Component-level tracking enables targeted optimization."

---

## 10. Advanced Follow-ups

Q1: How do you invalidate the semantic cache when source documents are updated?

Answer:
TTL-based invalidation is the simplest approach — set cache entries to expire in 15-60 minutes. Documents updated within that window will have stale cache entries for at most the TTL duration. Acceptable for most use cases.
Event-based invalidation for stricter freshness: when a document is re-ingested, emit an event. A cache invalidation worker receives the event and deletes all cache entries associated with that document's queries.
Implementation: store document IDs in the cache metadata. On document update, query the cache for all entries with that doc_id in their metadata and delete them.
The trade-off: TTL is simpler but allows brief staleness. Event-based is real-time but adds engineering complexity. For most enterprise use cases where documents update daily, 60-minute TTL is acceptable. For real-time pricing or policy documents where even 1 hour of staleness causes user harm, use event-based invalidation.

Q2: How do you detect and handle latency regressions in production?

Answer:
Track P50 and P95 latency per pipeline component in your metrics dashboard.
Set alerts: if embedding P95 exceeds 300ms (normal is 100ms), page the on-call engineer. If LLM P95 exceeds 4 seconds (normal is 1.5s), alert and check model provider status.
Regression detection: compare rolling 1-hour P95 against rolling 24-hour P95. If current P95 > 24h P95 × 1.5, trigger an alert.
Automated response: if vector DB P95 latency exceeds threshold, scale up the vector DB tier. If LLM latency is high, check if a different provider is available and route there.
Post-deployment check: run a canary test after every deployment — 5% of traffic to the new version, compare latency profile against the stable version. If the canary shows 20% higher P95, roll back before promoting.

Q3: How does streaming help with perceived latency even though total token generation time is the same?

Answer:
Without streaming: user waits N seconds for the full response, then sees everything at once. If N=5, user waits 5 seconds staring at a loading spinner.
With streaming: user sees the first token in 500ms (TTFT), then content appears progressively over the next 4.5 seconds. Perceived wait time is 500ms, even though total time is the same 5 seconds.
Implementation in FastAPI: return a StreamingResponse that yields tokens as they arrive from the LLM.
Implementation in Angular: subscribe to a Server-Sent Events stream and update the UI incrementally using Angular's change detection.
The UX difference is dramatic. For anything over 1 second, streaming is non-negotiable for a production UI. This is exactly the pattern used in AstroIntel — agents stream their outputs progressively to the frontend.

Q4: How do you design the DB schema to support cost reporting by tenant?

Answer:
The query_logs table is the foundation. Every query logs: tenant_id, input_tokens, output_tokens, cost_usd, model_used, timestamp.
Monthly tenant cost report:
```sql
SELECT 
    tenant_id,
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS total_queries,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(cost_usd) AS total_cost_usd,
    AVG(latency_ms) AS avg_latency_ms,
    COUNT(CASE WHEN cache_hit THEN 1 END)::FLOAT / COUNT(*) AS cache_hit_rate
FROM query_logs
GROUP BY tenant_id, month
ORDER BY month DESC, total_cost_usd DESC;
```
This powers: per-tenant billing for SaaS, cost anomaly detection, budget alerts, and ROI analysis per tenant.

Q5: How do you handle peak traffic (e.g., 10× normal traffic during a product launch)?

Answer:
Design for peak, not average.
Infrastructure side: the LLM API has rate limits — pre-negotiate higher limits with OpenAI/Anthropic before the event. Queue requests and process at the API's maximum sustainable rate.
Application side: queue-based request handling with priority tiers. Paid users get higher priority than trial users during overload.
Cache pre-warming: before a known peak event, identify the most common queries and pre-generate cached responses. A product launch chatbot can pre-cache answers to the top-50 anticipated questions.
Graceful degradation: if the queue is backing up, route to a simpler, faster model (GPT-4o-mini instead of GPT-4o) at the cost of quality. Users experience slightly lower quality instead of timeouts.
Rate limiting per user: if one user is flooding the system, cap them at N requests per minute. This prevents one heavy user from degrading experience for everyone.
These are standard distributed systems traffic management patterns — the same things you would do for a Spring Boot service under load, with the additional lever of model tier selection.

---

## ★ YOUR 5 PROJECTS — Latency Budget & Caching

| Project | Latency profile | Caching |
|---------|----------------|---------|
| **AstroIntel 360°** | Parallel agents → better than sequential. SSE TTFT < 2s. DeepSeek timeout: 8s. | Redis DB0 for response cache. FAISS pre-warmed at startup — first request fast. |
| **Bench Resource Optimizer** | L1 < 1ms, L2 ~5ms, full pipeline ~3s. SSE TTFT < 1.5s. FAISS rebuild async — zero downtime. | L1: exact SHA-256 match. L2: cosine ≥ 0.92. L3: Redis. Est. 60–70% cache hit rate post-warmup. Token cost: ~$0 on cache hit. |
| **RunbookAI** | SQL < 50ms. NetworkX sort < 10ms. Total < 100ms. No LLM in query path. | No caching needed — SQL IS the cache. Data is always current. |
| **Agentic Growth OS** | 5 sequential LLM calls ~3–5s. Dashboard polls every 2s during execution. | Campaign memory reuse reduces redundant LLM calls on repeat campaign types. |
| **Universal Agent** | Chat ~1–3s. Lock check < 1ms. Locked = instant response. | Redis optional. Lock state in-memory — < 1ms check on every request. |

**Latency targets (know cold):**

| Operation | Target | Project |
|-----------|--------|---------|
| Cache hit L1 | < 1ms | Bench |
| SQL query | < 100ms | RunbookAI |
| SSE TTFT | < 500ms | Bench, AstroIntel |
| Full LLM response | < 5s | All |
| Lock toggle | < 10ms | Universal Agent |

**Interview line:** "Bench's 3-tier cache is the reason its cost is near zero on repeat queries. L1 is an exact SHA-256 hash match — same query bytes → same response, < 1ms. L2 is semantic: cosine similarity ≥ 0.92 on query embeddings — 'ML Engineer London' and 'Machine Learning Engineer London' share the same cached response. L3 is Redis for distributed cache across workers."
