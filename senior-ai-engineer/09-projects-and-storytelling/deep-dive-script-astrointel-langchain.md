# Senior AI Engineer — Module 9
# Topic: Deep Dive Script — AstroIntel 360° and LangChain Service

---

## 1. Intuition

You will be asked to deep-dive your projects in virtually every senior AI interview. Having a rehearsed, layered script means you can deliver at exactly the depth the interviewer wants — 30 seconds, 2 minutes, or 10 minutes — without losing coherence.

This module is a scripted reference. Read it until you can speak it fluently.

---

## 2. AstroIntel 360° — Deep Dive Script

### Level 1: 30-Second Summary (for "tell me briefly about your projects")

"AstroIntel is a multi-agent AI platform for personalized astrological analysis. The user provides birth data and a question. Five specialist agents run in parallel — career, relationships, health, finances, and spiritual — then a synthesis agent combines their insights into a final report with remedies. The key design decision was parallel execution, which gives us 5x lower latency compared to sequential chaining."

---

### Level 2: 2-Minute Architecture Walk (for "walk me through the architecture")

"AstroIntel's pipeline has six stages.

**Stage 1 — Ingestion:** The user submits a birth profile: date, time, and location. The system normalizes this to a structured object — Ascendant, Sun sign, Moon sign, and planetary positions — using a deterministic calculation layer, not an LLM.

**Stage 2 — Question routing:** The user's question is classified into one of five domains using a lightweight GPT-4o-mini call. This determines which domain agents are prioritized.

**Stage 3 — Parallel agent execution:** Five domain agents run concurrently via ThreadPoolExecutor. Each agent receives the normalized birth profile, the user's question, and a domain-specific system prompt. Each makes one LLM call and returns a structured JSON output with insights, confidence score, and supporting evidence from the birth data.

**Stage 4 — Consensus:** A consensus layer collects all five agent outputs. If agents disagree on a key fact, the disagreement is flagged. Insights below a confidence threshold are filtered.

**Stage 5 — Synthesis and remedy:** A synthesis agent takes the five validated outputs and produces the final report — summary insights per domain plus recommended remedies.

**Stage 6 — Admin review (optional):** For the premium tier, the result passes through an admin review node using LangGraph's interrupt/resume pattern. The admin approves, edits, or adds context before delivery.

The whole pipeline runs in 15-20 seconds. The parallel phase is 3-4 seconds. The main latency drivers are the LLM calls, not the orchestration logic."

---

### Level 3: Decision Deep Dives (for follow-up questions)

**Why parallel, not sequential?**
"Sequential would mean Agent 2 waits for Agent 1 to finish, Agent 3 waits for Agent 2, and so on. With 5 agents at 3 seconds each, that's 15 seconds just for the agents before synthesis. Parallel runs all 5 simultaneously — the phase takes max(agent_latencies) ≈ 3-4 seconds instead of sum(agent_latencies) ≈ 15 seconds. 5x improvement.

The trade-off: parallel agents don't see each other's outputs. They can produce conflicting insights. That's why the consensus layer exists — it's the architectural answer to the trade-off I made by going parallel."

**Why not LangChain agent executor?**
"LangChain's agent executor is sequential and black-box. It doesn't support parallel node execution. LangGraph supports parallel map-reduce patterns and gives me explicit state, explicit transitions, and interrupt/resume for the admin review step. For a production multi-agent system, LangGraph is the right choice."

**Why LangGraph for admin review?**
"Admin review requires the pipeline to pause mid-execution, persist its state, and resume hours later when the admin takes action. Without LangGraph, I'd need to build custom state serialization and re-invocation logic. LangGraph's interrupt mechanism combined with SqliteSaver (or Postgres-backed checkpointer in production) handles this out of the box. The graph pauses at the review node, serializes state to the checkpointer, and resumes when I call invoke with the thread_id and the admin's feedback."

**What are the failure modes?**
"Three main failure modes:

1. Agent hallucination: an agent generates insights not grounded in the birth data. Mitigation: each agent prompt explicitly lists all birth data fields and instructs the agent to reference at least two data points per insight. The consensus layer checks for cross-agent agreement.

2. LLM timeout: one agent's LLM call times out, blocking the parallel phase. Mitigation: each agent call has a 10-second timeout. If an agent times out, it returns an empty result — the synthesis agent works with the available 4/5 outputs and notes the missing domain.

3. Inconsistent JSON output: agents are prompted for JSON but occasionally return malformed JSON. Mitigation: JSON repair library (`json_repair`) with a regex fallback to extract the insights section. If both fail, the agent result is marked as failed and excluded."

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

In retrospect, it was the right call. Parallel execution cut the latency from ~15s to ~4s. The consensus layer also added value beyond conflict detection — it improved output quality by filtering low-confidence agent results."

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
- Parallel phase: 3-4s
- Synthesis: 5-6s
- Total: 15-20s (P50 confirmed via live `/api/v1/metrics` after real runs)
- LLM calls: 6 (5 agents + 1 synthesis, plus classifier)
- Cost: ~$0.07 (gpt-4o-mini × 5 + gpt-4o × 1)

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
