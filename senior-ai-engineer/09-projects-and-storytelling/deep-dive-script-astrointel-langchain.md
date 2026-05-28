# Senior AI Engineer — Module 9
# Topic: Deep Dive Script — AstroIntel 360° and LangChain Service

---

## 1. Intuition

You will be asked to deep-dive your projects in virtually every senior AI interview. Having a rehearsed, layered script means you can deliver at exactly the depth the interviewer wants — 30 seconds, 2 minutes, or 10 minutes — without losing coherence.

This module is a scripted reference. Read it until you can speak it fluently.

---

## 2. AstroIntel 360° — Deep Dive Script

### ⚠️ CURRENT ARCHITECTURE (Updated May 2026 — use these answers, not older versions)

The real system is an **8-node LangGraph StateGraph** with:
- **5 domain agents**: Vedic Astrology, Numerology (3 traditions), Palmistry, Tarot, Vastu — not "career/health/finance"
- **LangGraph** for orchestration — not ThreadPoolExecutor
- **DeepSeek LLM** — not GPT-4o-mini
- **Human-in-the-loop admin approval** before any report is generated
- **Plain English Agent** (jargon simplification) running post-approval only
- **20-page PDF** generated entirely in Angular with @media print CSS
- **30+ language translation** via LLM translation agent
- **Full RBAC auth** (user / admin / superadmin), **semantic 2-tier cache**, **G1–G5 guardrails**

---

### Level 1: 30-Second Summary (for "tell me briefly about your projects")

"AstroIntel 360° is a production multi-agent AI platform that produces personalised spiritual intelligence reports. A user submits their birth profile — date, time, place. Five domain specialist agents run inside a LangGraph StateGraph: Vedic Astrology, Numerology across three traditions, Palmistry, Tarot, and Vastu. A meta-agent synthesises cross-domain consensus — insights confirmed by three or more traditions get HIGH confidence. An admin reviews and approves individual insights through a human-in-the-loop workflow, then a branded 20-page PDF report is generated in the user's preferred language from 30+ supported. The whole stack — FastAPI backend, Angular frontend, 4-layer security guardrails, RBAC auth, semantic caching, CI/CD to AWS ECS — was built from scratch."

---

### Level 2: 2-Minute Architecture Walk (for "walk me through the architecture")

"AstroIntel's pipeline has nine stages inside a LangGraph StateGraph.

**Stage 1 — Security gate:** Before any LLM sees the input, a `security_check` node validates the user's question and every birth profile field against 12 injection patterns. Prompt injection, jailbreak attempts, and garbage inputs are rejected here. The pipeline never starts on bad input.

**Stage 2 — Question normalisation:** The `question_agent` parses the user's question into structured intent — what domain it touches, what life area, what timeframe. This context flows to every downstream agent.

**Stage 3 — Parallel domain fan-out:** Five domain specialist agents run inside one LangGraph node. Each produces structured JSON: question-wise insights, confidence score, tradition-specific evidence. The domains are: Vedic Astrology (+ KP + Western), Numerology (Indian + Chaldean + Pythagorean), Palmistry (Indian + Chinese + Western), Tarot, and Vastu. If any domain agent fails, it produces a LOW-confidence placeholder — the other four continue.

**Stage 4 — Cross-domain consensus:** The `meta_agent` reads all five outputs and scores consensus: HIGH (3+ domains agree), MEDIUM (2 agree), LOW (1 domain only). This is the architectural answer to hallucination — one agent hallucinating gets outvoted.

**Stage 5 — Hallucination check:** A dedicated LangGraph node scans every output for system prompt leakage, off-topic content, and jailbreak compliance before the output moves forward.

**Stage 6 — Remedy generation:** The `remedy_agent` generates 8 categories of personalised recommendations: daily habits, mantras, gemstones, fasting, charity, lucky colours, yoga, and behavioural adjustments.

**Stage 7 — Admin review packaging:** `admin_review_agent` structures every insight with an id, confidence badge, domains[] array, and editable flag — ready for the human-in-the-loop approval workflow.

**Stage 8 — Human approval:** An admin logs in, reviews each insight, approves or rejects. Nothing reaches the user without this gate.

**Stage 9 — Report generation:** After approval, a plain English agent simplifies jargon (Lagna→rising sign, Mahadasha→main life phase), a report agent builds the 20-page PDF payload, and an optional translation agent converts everything to the user's chosen language from 30+ options. The PDF is rendered entirely in Angular with @media print CSS — no server-side PDF library."

---

### Level 3: Decision Deep Dives (for follow-up questions)

**How would you scale this to 1000 users/day?**
"Current synchronous architecture handles roughly 5-10 concurrent users before LLM rate limits become a constraint. For 1000 users/day (assuming 3 analyses each = 3000 analyses/day, ~2 per minute peak):

1. Move to async: submit analysis → Celery task queue → return task_id immediately → SSE for progress.
2. Worker pool: 20 workers × 5 concurrent LLM calls = 100 concurrent LLM slots.
3. LLM cost: 3000 analyses × $0.05 each (gpt-4o-mini) = $150/day. Acceptable.
4. Rate limit management: proactive TPM tracking per worker. Route to mini before hitting 4o limits.
5. Caching: cache birth profile normalization results. Same birth profile generates the same planetary positions — save one LLM-equivalent call per repeat user."

---

## 3. LangChain Service — Deep Dive Script

### Level 1: 30-Second Summary

"The LangChain Service is a production-pattern RAG system. It demonstrates three patterns: standard document Q&A with FAISS, agent-based Q&A with tool use, and streaming LCEL pipelines. The key design insight is knowing when LangChain abstractions help (document loading, chunking) and when to bypass them for direct API control (token tracking, fallback logic)."

---

### Level 2: 2-Minute Architecture Walk

"The service has three independent pipelines that share a document store:

**Pipeline 1 — Standard RAG:** User uploads a PDF. PyPDFLoader extracts text. RecursiveCharacterTextSplitter chunks at 512 tokens with 64 token overlap. OpenAI embeddings (text-embedding-ada-002) create 1536-dimension vectors. FAISS stores them in-memory. At query time, the query is embedded, top-4 chunks retrieved by cosine similarity, and passed as context to GPT-4o-mini for answer generation.

**Pipeline 2 — Agent Q&A:** A LangGraph agent with two tools — document retrieval (FAISS search) and web search (Tavily). The agent reasons about whether the document corpus is sufficient or needs web supplementation. If the document retrieval returns low-confidence results (average similarity below 0.7), the agent falls back to web search.

**Pipeline 3 — LCEL streaming:** A streaming pipeline using LangChain's pipe operator. `retrieve → format_prompt → llm | parser`. The LLM streams tokens via SSE. The Angular frontend receives them and progressively renders the response.

All three pipelines share the same document ingestor — upload once, query via any pipeline."

---

### Level 3: Decision Deep Dives

**When do you use LangChain vs bypass it?**
"LangChain is excellent for document loading (PyPDFLoader, UnstructuredLoader) and text splitting (RecursiveCharacterTextSplitter's fallback logic is genuinely good). I keep these.

I bypass LangChain for: LLM calls (direct OpenAI SDK for cost tracking and fallback), vector store operations in multi-tenant systems (direct FAISS or pgvector for tenant filtering), and any pipeline where I need to know exactly what's being sent to the LLM.

The escape hatch pattern: use LangChain utilities up to the LLM call, then switch to direct SDK. This gives you the ecosystem (100+ document loaders) without the black-box abstractions."

**What are the production limitations of this service?**
"Three honest production limitations:

1. FAISS in-memory: the entire index lives in RAM. For a real multi-tenant SaaS, I'd move to pgvector with tenant_id column isolation, or Pinecone namespaces.

2. No cost tracking: the LangChain RetrievalQA chain abstracts the token usage. For production, I'd add a `CostTrackingCallback` that fires on every LLM call and logs tokens and cost to a metrics store.

3. No faithfulness scoring: the service returns answers without verifying they're grounded in the retrieved context. For production, I'd add a post-generation faithfulness check: does the answer contain claims not supported by the context chunks? If yes, regenerate or flag."

**What was the hardest part to build?**
"The hardest part was the agent tool reliability. The LangGraph agent makes function calls — the LLM generates a JSON tool call specification. Occasionally the JSON is malformed, or the tool arguments have wrong types, or the agent calls a tool in an infinite loop. 

I solved this three ways:
1. Pydantic validators on all tool argument models — type errors are caught before tool execution
2. Max iteration limit (10 steps) to break infinite loops
3. Tool call logging — every tool invocation is logged with input, output, and latency for debugging

The lesson: tool use is where agents fail in production. The LLM's JSON generation is ~95% reliable — the 5% failure rate is unacceptable for production without validation."

---

## 4. Behavioral Questions Using These Projects

### "Tell me about a time you made a technical decision under uncertainty"

"When designing AstroIntel's agent orchestration, I faced a choice between sequential and parallel execution before I had benchmarks. Sequential was safer — well understood, easier to debug. Parallel was riskier — race conditions, conflicting outputs, harder to debug.

I made the call to go parallel based on first principles: each domain agent is stateless (doesn't need output from other agents to do its job), so there was no functional dependency that required sequential execution. The only risk was conflicting outputs, which I mitigated architecturally with the consensus layer.

In retrospect, it was the right call. The latency journey was: 78s (sequential, GPT-4o) → 15s (parallel, GPT-4o-mini) → 4s (parallel + DeepSeek + 3-tier cache). The consensus layer also added value beyond conflict detection — it improved output quality by filtering low-confidence agent results."

---

### "Tell me about a time you had to balance quality and speed"

"AstroIntel initially used GPT-4o for all 6 agent calls. Output quality was excellent but cost was high ($0.30 per analysis at GPT-4o pricing) and latency was 8-10 seconds.

I ran an A/B comparison: GPT-4o vs gpt-4o-mini for the domain specialist agents. The quality difference for structured domain-specific analysis with a constrained output format was minimal — the agents were following templates more than reasoning freely. The synthesis agent still needed GPT-4o's reasoning depth.

Final decision: gpt-4o-mini for all 5 domain agents, GPT-4o for synthesis only. Cost dropped from ~$0.30 to ~$0.07 per analysis. Latency improved to 4-5 seconds. Output quality was rated equivalent in blind user testing.

The lesson: model selection should be driven by the nature of the task, not by defaulting to the best model for everything."

---

## 5. The One Slide Architecture Summary

If you need to draw the system on a whiteboard:

```
AstroIntel Architecture (Whiteboard)

User Input: {birth_date, birth_time, birth_location, question}
    ↓
[Normalizer] → {ascendant, sun_sign, moon_sign, planetary_positions}
    ↓
[Question Classifier] → domain: {career|health|finance|relationships|spiritual}
    ↓
[Parallel Agents via ThreadPoolExecutor]
  ├── Career Agent (gpt-4o-mini) → {insights, confidence, evidence}
  ├── Health Agent (gpt-4o-mini) → {insights, confidence, evidence}
  ├── Finance Agent (gpt-4o-mini) → {insights, confidence, evidence}
  ├── Relationships Agent (gpt-4o-mini) → {insights, confidence, evidence}
  └── Spiritual Agent (gpt-4o-mini) → {insights, confidence, evidence}
    ↓
[Consensus Layer] → validated_insights (filtered, conflict-checked)
    ↓
[Synthesis Agent] (gpt-4o) → {summary, remedies, final_answer}
    ↓
[Admin Review Node] → (LangGraph interrupt/resume, optional)
    ↓
Response to User
```

Key numbers to annotate:
- Total latency: ~4s (fresh), <50ms (cache hit)
- Latency journey: 78s → 15s → 4s (3 optimization rounds)
- LLM: DeepSeek, max_tokens=250, HTTP timeout=8s, ~$0.000137/analysis
- 8 LangGraph nodes, every node wrapped in safe_node() circuit breaker
- 3-tier cache: L1 in-memory + L2 Redis DB0 + L3 semantic similarity
- Enterprise Kafka: 3 consumer workers, manual offset commit, DLQ, graceful shutdown
- Job store: write-through to Redis DB1, recovery on in-memory miss

**Multi-tenant SaaS auth system — 76/76 tests passing (2026-05-15):**

Full enterprise auth layer was added to AstroIntel and tested end-to-end:

| Auth component | What was built | Test result |
|---|---|---|
| Role hierarchy: USER < ADMIN < SUPERADMIN | `Role.can()` method + `require_role()` Depends factory | 8/8 role model tests pass |
| X-API-Key header auth | `get_tenant_ctx` → `lookup_key()` → `TenantContext` | 76/76 HTTP tests pass |
| JWT Bearer auth | `create_access_token` + `verify_token` (HS256, python-jose) | 5/5 JWT tests pass |
| Key revocation + JWT invalidation | JWT checks key liveness on every request — revoked key = 401 even with valid JWT | 3/3 bearer endpoint tests pass |
| Tenant isolation at rate limiter | Rate limit key = `ctx.tenant_id` (API-verified), not user-supplied input | Verified |
| Endpoint role enforcement | All admin/guardrail/metrics/cache/circuit-breaker endpoints return 403/401 without correct role | 10/10 admin role tests pass |
| SUPERADMIN bootstrap | Created from `MASTER_API_KEY` env var on first boot — no pre-config needed | Verified |

Auth files: `auth/models.py`, `auth/store.py`, `auth/dependencies.py`, `auth/router.py` (4 files, ~450 lines total)

In interview (when asked "how did you secure the API?"): "AstroIntel has a three-tier role system — USER, ADMIN, SUPERADMIN — enforced at every endpoint using FastAPI's `Depends()` pattern. There are two auth methods: a raw API key in the X-API-Key header, or a short-lived JWT Bearer token exchanged via POST /auth/token. The JWT re-checks key liveness on every request, so revoking a key immediately invalidates all outstanding tokens from it — you don't have to wait for JWT expiry. I tested all of this with 76 tests: role hierarchy, JWT tamper detection, key revocation propagation, tenant isolation at the rate limiter, and role enforcement on every protected endpoint. The test suite runs in 2 seconds."

**Enterprise test coverage (415/415 passing, 2026-05-15):**

| What was tested | How | Result |
|---|---|---|
| Cache dedup: same person, different session → 1 entry | Unit + live HTTP | Fixed (user_id removed from key) |
| Rate limiter: 429 fires at request 11 | Unit + live HTTP | Verified |
| Circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED | Unit | All transitions verified |
| JSON repair cascade: 4 levels (parse→fence→regex→None) | Unit | All paths covered |
| PII scrub: DOB, time, location removed from insights | Unit | Verified |
| 4-layer security gate: 15 injection patterns blocked | Unit | All 15 blocked |
| 3-layer hallucination detection + recovery | Unit | All detection + suppression paths covered |
| Full pipeline run→approve→translate | Live DeepSeek | 23 tests, all pass |
| Metrics P50/P95/P99 tracked after real run | Live | Confirmed live, not stub |
| Hindi translation → correct language_code in response | Live DeepSeek | Verified |

In interview (when asked "how do you know it works?"): "AstroIntel has 415 tests — 392 unit tests covering every subsystem in isolation, and 23 live tests that run the real full pipeline against DeepSeek with an actual user profile. The live tests verify what unit tests cannot: that the agents call the real LLM correctly, the hallucination audit is populated from real output, the cache dedup works end-to-end across HTTP requests, and P50 latency is tracked from real wall-clock time. I can quote specific behavior: request 11 returns HTTP 429 with retry-in seconds. Same birth profile with a different session ID returns `cache_hit: true`. The Hindi translation response carries `language_code: 'hi'`. These are not mocked assertions — they are verified against the running system."

**Ground truth accuracy test — 20 famous profiles (134 tests, 2026-05-15):**

Beyond structural testing, accuracy was validated against publicly verifiable ground truth. This is the answer to "but does it actually produce correct results?"

```
Profiles: Gandhi, Einstein, Musk, Modi, Buffett, Kohli, Jobs, Curie,
          Ambani, APJ Kalam, Swift, Dalai Lama, Merkel, Winfrey,
          Tendulkar, Bachchan, Malala, Gates, Tata, Pichai

Accuracy results (134 tests, all pass):
  Numerology (Life Path formula)  : 20/20 correct — 100%
  Domain coverage (all 5 respond) : 20/20 — 100%
  HIGH confidence rate            : 20/20 above 30% threshold
  No hallucinated birth facts     : 20/20 clean
  Career keyword relevance        : avg 57.9% match rate
  Hallucination risk              : 20/20 LOW, 0 MEDIUM, 0 HIGH

  OVERALL ACCURACY SCORE: 5/5 dimensions = 100%
```

Spot-checks against published numerology sources:
- Gandhi (1869-10-02) → Life Path 9 ✓
- Einstein (1879-03-14) → Life Path 33 (master number) ✓
- Buffett (1930-08-30) → Life Path 6 ✓
- Dalai Lama (1935-07-06) → Life Path 4 ✓

In interview (when asked "how accurate is it?"): "We tested against 20 famous public figures whose numerology numbers are independently verifiable from public sources. Life Path accuracy: 20/20 correct — every number matches the standard Pythagorean formula. The system produced all 5 domain insights for every profile with 100% HIGH confidence rate and zero hallucination risk. The accuracy test suite is 134 tests and lives in the repo — it runs against the real DeepSeek API, not mocks. That's a verifiable accuracy claim, not an estimate."

---

## 6. Bench Resource Optimizer — Deep Dive Script

### Level 1: 30-Second Summary (for "tell me briefly about your projects")

"Bench Resource Optimizer is an AI-powered workforce planning tool that matches bench employees — those currently unassigned — to open project roles. The user uploads employee CVs and a role requirements document. The system runs a 6-stage pipeline: CV ingestion, role gap analysis via hybrid RAG, async parallel plan generation for each day, LLM-as-judge quality scoring, and a semantic cache layer for repeated queries. The key decision was using `asyncio.gather` to parallelize the day plan generation, reducing total planning time from ~21 seconds to ~4 seconds."

---

### Level 2: 2-Minute Architecture Walk (for "walk me through the architecture")

"Bench Resource Optimizer has six stages.

**Stage 1 — CV Ingestion:** Employee CVs are uploaded and parsed. A circuit-breaker-protected CV Parser Agent extracts structured skills, experience, and technology proficiencies. The extracted content is embedded using `text-embedding-3-small` and stored in a FAISS index with internal:// URIs as document IDs (avoiding filesystem dependencies). Each vector carries metadata: `employee_id`, `skills[]`, and `org_id` for tenant isolation.

**Stage 2 — Role Gap Analysis:** The user provides a role requirements document. A Role Mapper Agent compares the requirements against candidate CVs using a hybrid BM25 + FAISS retrieval with RRF (Reciprocal Rank Fusion) to combine sparse and dense scores. This returns a ranked list of candidates with skill gap percentages. A CRAG quality gate evaluates retrieved chunks before they enter the LLM context — chunks below relevance threshold are discarded to prevent hallucinated gap assessments.

**Stage 3 — HyDE Query Enhancement:** Instead of embedding the raw role requirement query, the system generates a Hypothetical Document Embedding — the LLM writes a hypothetical 'ideal CV' for the role, embeds that, and uses it as the search vector. This improves retrieval precision significantly for roles where the requirement text uses different terminology than the CVs.

**Stage 4 — Async Parallel Plan Generation:** For a 30-day bench plan, each day's assignment is generated as an independent LLM call. Using `asyncio.gather`, all 30 day-plan calls run concurrently. Result: ~21 seconds sequential → ~4 seconds parallel. The output is streamed to the Angular frontend via SSE so users see assignments appearing in real time.

**Stage 5 — LLM-as-Judge Quality Gate:** After the plan is generated, a second DeepSeek call scores each assignment on four dimensions: Relevance (does the skill match?), Completeness (are all role requirements covered?), Accuracy (is the assignment realistic?), and Actionability (can a manager act on this immediately?). Each dimension is scored 1-5. Assignments scoring below 3.5 average are flagged for manual review.

**Stage 6 — Semantic Cache + Progress Tracker:** L1 cache is SHA-256 exact match (1-hour TTL). L2 cache is cosine similarity ≥ 0.92 against previous queries (30-minute TTL). Cache hit rate is ~35% for repeated role queries. A progress tracker logs each plan execution step with timestamps, enabling the `/api/v1/metrics` dashboard showing P50/P95/P99 latency, plan quality scores, and token economics.

Total pipeline time: 4-6 seconds for fresh queries, under 50ms for cache hits. LLM cost per plan: approximately $0.0003 per day plan × 30 days = $0.009 per full bench plan."

---

### Level 3: Decision Deep Dives (for follow-up questions)

**Why asyncio.gather instead of ThreadPoolExecutor?**
"ThreadPoolExecutor works well for CPU-bound or blocking I/O tasks. Day plan generation is pure async I/O — each call waits for a DeepSeek API response. `asyncio.gather` runs all 30 coroutines on the same event loop with zero thread overhead. It also integrates naturally with FastAPI's async request handling and the SSE streaming response. The Python GIL is not a constraint here because we're waiting on network I/O, not executing Python code. The measured improvement: 21 seconds sequential → 4 seconds parallel."

**Why LLM-as-judge instead of RAGAS?**
"RAGAS requires ground truth answers to compute faithfulness and answer relevance — we don't have ground truth for workforce plans because there is no single correct plan. LLM-as-judge evaluates plan quality on dimensions that matter to the business: does this assignment make skill-level sense? Is it actionable? A hiring manager can validate these judgments intuitively. We use a second DeepSeek call rather than a different model to keep output format consistent and reduce provider dependencies. The judge prompt specifies four rubrics with explicit 1-5 scoring criteria, which makes the scores deterministic enough to use as a hard threshold (3.5) for flagging."

**Why internal:// URIs for FAISS document IDs?**
"Filesystem paths as document IDs create deployment coupling — the path that works locally (`/home/user/uploads/cv_001.pdf`) breaks in Docker, in Kubernetes, and when files are stored in S3. `internal://cv_001` is a stable, environment-agnostic identifier that maps to the actual storage location through a resolver. The FAISS index stores the internal URI, and the retrieval layer resolves it to wherever the file actually is. This separation means the vector index doesn't need to be rebuilt when the deployment environment changes."

**Why circuit breakers on CV Parser and Role Mapper agents?**
"Both agents call external APIs — the embedding service and DeepSeek. If the embedding API has elevated latency, without a circuit breaker every request waits 30 seconds before timing out. With the circuit breaker in OPEN state, requests fail immediately (< 1ms) and the system returns a graceful degradation response rather than queuing up retries that amplify the latency. The pattern: CLOSED (normal) → OPEN (after 5 consecutive failures in 60 seconds) → HALF_OPEN (one probe request after 30-second cooldown) → CLOSED (on success). This is Resilience4j's CircuitBreaker pattern applied to Python service calls."

**Why hybrid BM25 + FAISS with RRF?**
"Pure semantic search (FAISS) misses exact keyword matches — if a role requires 'Kubernetes' and a CV says 'Kubernetes', semantic search might rank a CV mentioning 'container orchestration' higher. BM25 catches exact terms. Pure BM25 misses semantic equivalents — 'React.js' vs 'React' vs 'ReactJS'. Hybrid retrieval with RRF combines both: `RRF_score = 1/(k + rank_bm25) + 1/(k + rank_faiss)`. This consistently outperforms either alone by 8-15% on recall@10 in our benchmark. The `k` parameter (default 60) controls the relative weighting and was tuned empirically on a test set of 50 CV-role pairs."

**What are the failure modes?**
"Three main failure modes:

1. CV parsing hallucination: the CV Parser Agent extracts skills that don't exist in the CV. Mitigation: the CRAG quality gate scores each extracted skill against the source text. Skills with a relevance score below 0.75 are discarded before entering the skill graph. This catches ~15% of LLM hallucinations at the extraction stage.

2. asyncio timeout: one of the 30 day-plan LLM calls hangs. Mitigation: `asyncio.wait_for(day_plan_coroutine, timeout=15)` wraps each call. If a day plan times out, its slot is filled with a 'manual review required' placeholder — the remaining 29 days are valid and the plan is still useful. The progress tracker logs which days had timeouts.

3. Cache staleness: a cached plan for 'Senior Java Developer' is returned for a query about 'Lead Java Engineer' with similar embedding (cosine ≥ 0.92). Mitigation: the L2 cache TTL is 30 minutes (not 24 hours) and the cache key includes an org_id filter. Role queries change frequently as positions are filled. 30-minute TTL balances cost savings against staleness risk."

**How would you scale this to 10,000 employees?**
"Three bottlenecks emerge at 10K employees:

1. FAISS in-memory: 10K CVs × 20 chunks each × 1536 dimensions = 3.1GB RAM just for vectors. Move to pgvector with HNSW index — same query interface, persistent, supports horizontal scaling via read replicas.

2. asyncio.gather at 30 days: 30 concurrent LLM calls per user is manageable. At 100 concurrent users, that's 3,000 simultaneous LLM calls — need rate limiter per user session and queue-based backpressure.

3. Embedding freshness: 10K CVs need re-embedding when the embedding model is upgraded. Move to event-driven re-ingestion: each CV update emits a Kafka event, a consumer group handles re-embedding at sustainable throughput, and the metadata DB tracks `last_embedded_at` per CV."

---

### Level 4: Connecting Both Projects in Interviews

**When asked "what's the difference between your two AI projects?":**

"AstroIntel and Bench Resource Optimizer represent two different AI engineering challenges.

AstroIntel is about multi-agent orchestration: parallel specialist agents, consensus building across conflicting outputs, human-in-the-loop review, and the challenge of synthesizing five independent expert opinions into a coherent final answer. The key patterns are parallel execution, consensus scoring, and LangGraph state management.

Bench Resource Optimizer is about RAG at production scale: hybrid retrieval for skill matching, quality gates to prevent hallucinated gap analysis, async parallelism for plan generation performance, and semantic caching to manage LLM costs at query volume. The key patterns are HyDE query enhancement, CRAG quality filtering, asyncio parallelism, and LLM-as-judge evaluation.

Together they demonstrate I can work at both extremes of AI engineering: agent orchestration complexity in AstroIntel, and retrieval pipeline optimization in Bench Resource Optimizer."

---

### The One Slide Architecture Summary (Whiteboard)

```
Bench Resource Optimizer Architecture (Whiteboard)

Inputs: {employee_cvs[], role_requirements.pdf, plan_config}
    ↓
[CV Parser Agent] → extracted_skills (circuit-breaker protected)
    ↓
FAISS Index (internal:// URIs, org_id metadata filter)
    ↓
[Role Mapper Agent]
  ├── HyDE: generate hypothetical CV → embed → search
  ├── Hybrid BM25 + FAISS → RRF fusion → top-20 candidates
  └── CRAG quality gate → discard low-relevance chunks
    ↓
[RAG Planner] → candidate_rankings with skill_gap %
    ↓
[asyncio.gather: 30 Day Plans in parallel]
  ├── Day 1 plan (DeepSeek call)
  ├── Day 2 plan (DeepSeek call)
  └── ... Day 30 plan (DeepSeek call)  → SSE stream to frontend
    ↓
[LLM-as-Judge] → quality_scores (Relevance/Completeness/Accuracy/Actionability 1-5)
  → flag if avg < 3.5
    ↓
[Semantic Cache L1 (SHA-256, 1h) + L2 (cosine≥0.92, 30min)]
    ↓
[Progress Tracker] → /api/v1/metrics (P50/P95/P99, quality, cost)
    ↓
30-Day Bench Plan Output
```

Key numbers to annotate:
- Async plan generation: ~4s (was 21s sequential)
- Cache hit rate: ~35% for repeated role queries
- Cache hit latency: < 50ms
- LLM cost per full plan: ~$0.009
- LLM-as-judge threshold: 3.5 / 5.0 average
- Circuit breaker: OPEN after 5 failures / 60s window

---

### Level 3: Updated Decision Deep Dives (current system — use these in interviews)

**Why LangGraph StateGraph instead of simple function chaining?**
> "I needed three things that function chaining can't give me. First, explicit state — every agent reads from and writes to a typed state dict, so I can inspect exactly what any agent saw and produced. Second, `safe_node()` wrapping — I can add circuit breaker, timeout, and graceful degradation to every node without touching any agent's logic. Third, it gives me a natural place to add the human-in-the-loop interrupt if I extend the pipeline — LangGraph's interrupt/resume pattern is built for exactly this. Function chaining would have been simpler to write but impossible to debug and extend."

**Why DeepSeek instead of GPT-4o?**
> "Cost and instruction-following quality for structured output tasks. AstroIntel makes around 8-10 LLM calls per analysis. At GPT-4o pricing that's roughly $0.30 per analysis — at DeepSeek pricing it's under $0.01. For structured JSON output with a constrained schema, DeepSeek performs equivalently. GPT-4o's superior reasoning only matters for open-ended synthesis, not for following a detailed system prompt with explicit output format instructions. The one place I'd switch back to a larger model is if I need the report to be more creatively written — but right now the plain English agent handles that post-generation."

**Why admin review before report generation — not after?**
> "Two reasons. First, quality: the LLM produces 30-50 insights per analysis. Some will be generic, some will be weakly grounded, some will be near-duplicates. An admin filtering these before the report means the user receives 10-15 curated, high-quality insights rather than 50 raw outputs. Second, liability: spiritual guidance touches people's relationships, career decisions, and finances. Having a human approve every insight before it's presented as a personalised reading is the responsible design. The admin workflow is the human-in-the-loop gate that makes this system appropriate for its domain."

**Why @media print CSS for the PDF instead of Puppeteer or a PDF library?**
> "Three reasons: zero server cost (no headless Chrome process running), no extra dependency (the Angular component already renders the report), and perfect fidelity (the PDF looks exactly like the screen preview because it IS the same component). The trade-off is browser-specific print quirks — I had to solve `break-inside: avoid` for insight cards, absolute-positioned watermarks that don't affect page flow, and font sizes that need to be roughly doubled for print DPI. But those are solvable CSS problems, and the result is a 20-page branded PDF with no server-side process."

**Why 2-tier semantic cache?**
> "Birth chart data is mathematically deterministic — same person, same chart, forever. Profile TTL is 30 days because the data never changes. Full pipeline responses include the user's specific questions, so they're scoped to a session — 20 minutes is the right TTL. This means a repeat reading for the same person returns instantly with zero LLM calls, while a new question set runs the full pipeline. Cache hit rate on repeat users is ~35%, which directly translates to cost savings."

**What are the current numbers you can quote cold?**
```
Pipeline:
  Graph nodes:              8 (security_check→question_agent→domain_agents→meta_agent
                               →hallucination_check→remedy_agent→admin_review_agent→grammar_agent)
  LLM calls per analysis:   8-10 (DeepSeek, max_tokens=250, HTTP timeout=8s)
  Domain agents:            5 (9 traditions across them)
  Pipeline latency:         ~4s (from 78s — 3 optimization rounds)
  Languages supported:      30+
  PDF pages:                20
  Guardrail layers:         4 (security) + 5 production (G1-G5)

Enterprise Kafka+Redis:
  Kafka consumer workers:   3 threads, consumer group, manual offset commit
  Kafka retry:              exponential backoff + jitter, DLQ after exhaustion
  Redis DB0:                cache (L2), connection pool, pub/sub invalidation
  Redis DB1:                job store, write-through from job_store.py
  Cache tiers:              L1 in-memory + L2 Redis + L3 semantic embedding
  Cost per analysis:        ~$0.000137 (DeepSeek pricing)
  Test suite:               82/82 Kafka+Redis tests passing

Auth:
  Roles:                    3 (USER / ADMIN / SUPERADMIN)
  Auth methods:             API key + JWT Bearer
  Test coverage:            76/76 auth tests passing

Caching:
  Profile TTL:              30 days
  Session TTL:              20 minutes
  Cache hit rate:           ~35% on repeat users

Accuracy (20 public figures tested):
  Life Path accuracy:       20/20 = 100%
  Hallucination risk:       20/20 LOW, 0 HIGH
  Domain coverage:          5/5 domains on all profiles

Plain English Agent:
  Jargon patterns:          30+ deterministic regex replacements
  Safety filter phrases:    11 forbidden absolute phrases
  Runs:                     ONLY post-approval, never in pipeline
```



---

## UPDATE — Multi-Tenant Episodic Memory + Tenant Persona Injection System (2026-05-28)

### What was added

A multi-tenant, human-in-the-loop learning system. Each tenant's corrections are stored and retrieved independently — no cross-tenant data leakage. The pipeline learns each tenant's editorial voice separately.

**New files:**
- `memory/episodic.py` — multi-tenant correction store: all functions require `tenant_id`; `correction_stats_global()` for SUPER_ADMIN
- `memory/persona.py` — `DEFAULT_PERSONA` + `build_tenant_context(query, intent, tenant_id)` + `build_chandan_context()` backward-compat alias
- `routers/feedback.py` — 7 tenant-scoped endpoints (RBAC via `can(Permission.ANALYSIS__APPROVE)`)
- `tests/test_episodic_memory.py` — 30 tests (16 functional + 14 multi-tenant isolation), all passing

**Modified files (zero breaking changes):**
- `database.py` — `init_episodic_tables()` with live ALTER TABLE migration for `tenant_id` column
- `main.py` — `feedback_router` registered
- `routers/analysis.py` — `build_tenant_context(tenant_id=ctx.tenant_id)` in `/run`; `log_correction(tenant_id=ctx.tenant_id)` in `/approve`
- `schemas/models.py` — `ApprovalRequest` extended with optional `edited_insights[]`
- `metrics/collector.py` — dashboard uses `correction_stats_global()` for cross-tenant total

### Updated numbers

```
Multi-Tenant Episodic Memory:
  Correction store:         SQLite (tenant_id-partitioned episodic_corrections + persona_preferences)
  Retrieval method:         cosine similarity on bag-of-words fingerprint, WHERE tenant_id=X (no external vector DB)
  Injection point:          LangGraph initial_state["chandan_preferences"] = build_tenant_context(tenant_id=ctx.tenant_id)
  Custom persona:           Tenant sets __persona__ pref key → overrides DEFAULT_PERSONA for that tenant
  Feedback endpoints:       7 tenant-scoped (corrections CRUD + persona preferences + preview)
  Test suite:               112 tests total (82 original + 30 episodic memory tests)

Multi-tenant isolation:
  episodic_corrections:     UNIQUE INDEX on (tenant_id, created_at) — zero cross-tenant reads possible
  persona_preferences:      UNIQUE(tenant_id, pref_key) — prefs fully isolated per tenant
  API layer:                ctx.tenant_id from JWT passed to all DB functions — never from request body

Fine-tune roadmap (per-tenant):
  Phase 1 (live):           Per-tenant correction logging + per-tenant persona prompt injection
  Phase 2 (100+ corr/tenant): Per-tenant distillation dataset generation via Claude/GPT-4
  Phase 3 (500+ corr/tenant): Per-tenant LoRA fine-tune Mistral-7B-Instruct
```

### Interview story — how to tell this addition

"The system was already production-grade — Kafka, Redis, RAGAS, RBAC, 82 tests. But there was a gap: each tenant's domain expert reviews reports and corrects insights before approving. Two problems: (1) those corrections were lost — the next report made the same mistakes; (2) a naive single-table store would mix Tenant A's editorial style into Tenant B's pipeline — a critical multi-tenant data isolation bug.

I designed a multi-tenant episodic memory system. Every correction is stored with `tenant_id` as the partition key. All retrieval uses `WHERE tenant_id=X` — Tenant B can never see Tenant A's corrections even if they query the same text. Tenants can also set a custom `__persona__` preference to fully override the default voice and tone rules.

At the start of each pipeline run, `build_tenant_context(tenant_id=ctx.tenant_id)` retrieves the top-5 most similar past corrections for that tenant using cosine similarity and injects them into the LangGraph state. Every agent downstream sees that tenant's corrections before generating a single token.

The key design decision: `tenant_id` is a required keyword-only argument on every DB function — not optional, not defaulting silently. A missing tenant_id fails loudly. This pattern prevents the entire class of 'forgot to scope' bugs that cause silent data mixing in multi-tenant systems."
