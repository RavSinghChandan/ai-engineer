# Bench Resource Optimizer — Interview Scenario Guide
## Your Complete Answer Script for Every Interview Question

> Read this before every interview. Every answer traces directly to actual code in this repo.
> Run the app locally, walk the interviewer through live screens. Never just talk — show.

---

## THE ONE-MINUTE PITCH (Open Every Interview With This)

> "I built an enterprise AI platform that solves a real problem in IT services companies —
> bench resource management. When employees finish a project and wait for the next one,
> managers have zero visibility into their skills or readiness. My system takes a CV,
> uses a Hybrid RAG pipeline to compare skills against target roles, generates a 7-day
> personalised training plan, and tracks readiness in real time. The backend is FastAPI +
> DeepSeek LLM. The RAG pipeline uses FAISS + BM25 + RRF fusion, HyDE, CRAG, and a
> cross-encoder reranker. I built 502 tests with 94.7% coverage, a 5-layer guardrail system,
> semantic caching at two levels, SSE streaming, JWT auth, Kafka event publishing, and a
> full observability dashboard. Every component maps to a Senior AI Engineer module."

**Pause. Let them ask questions. You control the conversation from here.**

---

## SECTION 1 — RAG PIPELINE (Most Asked)

### Q: "Walk me through your RAG pipeline."

**Answer:**
"My role-mapping flow has a 7-stage RAG pipeline. Let me walk you through each stage:

**Stage 1 — L1 Cache Check**
Before anything touches the LLM, I do a SHA-256 hash of `role_name + sorted(skills)`.
If it's a cache hit, I return in under 1ms. No LLM cost.

**Stage 2 — HyDE (Hypothetical Document Embeddings)**
Instead of embedding the raw role title like `'AI/ML Engineer'`, I ask the LLM to
first generate what a *job description for that role* would look like — a hypothetical
document. Then I embed THAT. This significantly improves retrieval because the query
embedding is now much closer to actual role documents in vector space.
`Code: rag/advanced_retrieval.py → generate_hypothetical_doc()`

**Stage 3 — Hybrid Retrieval (BM25 + FAISS + RRF)**
I run two retrievers in parallel:
- BM25 for keyword matching (catches exact skill names like 'MLflow')
- FAISS for dense semantic matching (catches 'machine learning infrastructure' → MLflow)
Then I fuse their scores using Reciprocal Rank Fusion (RRF).
Without BM25, I'd miss exact keyword matches. Without FAISS, I'd miss semantic intent.
`Code: rag/advanced_retrieval.py → hybrid_retrieve()`

**Stage 4 — Cross-Encoder Reranker**
The top-20 hybrid results get passed through a cross-encoder model for re-scoring.
Cross-encoders are slower but much more precise — they process query+document together.
I rerank to top-5 before passing to the LLM.
`Code: rag/advanced_retrieval.py`

**Stage 5 — CRAG Quality Scoring**
I score the retrieval quality. If the score is LOW (documents are irrelevant),
I fall back to a wider search rather than sending bad context to the LLM.
CRAG = Corrective RAG.
`Code: rag/advanced_retrieval.py → crag_retrieve()`

**Stage 6 — LLM Call with Prompt Versioning**
DeepSeek `deepseek-chat` with a v2 injection-hardened system prompt.
Every LLM call goes through a token tracker (LangChain callback).
`Code: agents/role_mapping_agent.py → map_role()`

**Stage 7 — Faithfulness Check**
After the LLM responds, I run a faithfulness check: does the output actually follow
from the retrieved context? If faithfulness score < 0.25, I flag the response with
a warning rather than silently serving a hallucinated answer."

**Numbers to quote:**
- FAISS only: ~60% recall
- +BM25 + RRF: ~78% recall
- +HyDE: ~83% recall
- +Cross-encoder: Best precision

---

### Q: "What is HyDE and why did you use it?"

**Answer:**
"HyDE stands for Hypothetical Document Embeddings. The problem it solves:

When a user asks to map to the role 'AI/ML Engineer', if I embed that 3-word phrase
and search my vector store of role descriptions, the query embedding is very short
and generic — it doesn't match well against multi-paragraph role documents.

HyDE flips this: I first ask the LLM 'generate a job description for AI/ML Engineer'
— a hypothetical document. Now I embed THAT 200-word generated document and search.
The embedding is now rich and specific, matching much better against actual role docs.

In my benchmarking, HyDE improved retrieval recall from ~78% to ~83%.

The tradeoff: one extra LLM call per query, which adds latency. That's why I put
L1 cache check before HyDE — cache hits skip HyDE entirely."

---

### Q: "What is RRF (Reciprocal Rank Fusion)?"

**Answer:**
"RRF is a score fusion technique for combining results from multiple retrievers.

BM25 gives me a list of documents ranked 1, 2, 3... 
FAISS gives me another ranked list.
The same document might be rank 3 in BM25 and rank 1 in FAISS.

RRF score for a document = sum of (1 / (k + rank)) across all retrievers
where k=60 is a constant that dampens outlier ranks.

The beauty of RRF: it doesn't depend on the scale of scores from each retriever.
BM25 scores and cosine similarity scores are on completely different scales —
you can't just add them. But ranks are comparable.

In code: `hybrid_retrieve()` in `rag/advanced_retrieval.py`."

---

### Q: "Explain CRAG."

**Answer:**
"CRAG = Corrective RAG. It addresses a fundamental RAG failure mode: what if the
retrieved documents are irrelevant to the query?

In standard RAG, you retrieve documents and pass them to the LLM regardless of
their quality. If the knowledge base doesn't have good information about the
requested role, the LLM will hallucinate — it fills the gap with invented facts.

CRAG adds a quality gate: after retrieval, I score how relevant the top documents
are to the query. If the score falls below a threshold, instead of proceeding
with bad context, I fall back to a wider search or return a graceful response.

In my system, CRAG runs as an alternative to hybrid retrieval for edge cases.
`Code: rag/advanced_retrieval.py → crag_retrieve()`"

---

## SECTION 2 — AGENTS & FAILURE HANDLING

### Q: "How many agents do you have and what does each do?"

**Answer:**
"I have 4 LLM agents, each with a single responsibility:

1. **cv_parser_agent** — Takes raw PDF text, returns structured JSON profile
   (name, skills, experience_years, previous_roles, projects).
   Uses prompt v2 with injection hardening.
   `File: agents/cv_parser_agent.py`

2. **role_mapping_agent** — Takes the parsed profile + target role, runs the full
   Hybrid RAG pipeline, returns match_score, matched_skills, missing_skills,
   prep_timeline. This is the most complex agent.
   `File: agents/role_mapping_agent.py`

3. **planning_agent** — Takes missing skills + timeline, generates a day-by-day
   training plan as a list of tasks. Also supports SSE streaming.
   `File: agents/planning_agent.py`

4. **tracking_agent** — Takes completed tasks, calculates readiness percentage,
   updates episodic memory with user progress.
   `File: agents/tracking_agent.py`"

---

### Q: "How do you handle LLM failures?"

**Answer:**
"I have a 3-layer failure handling system:

**Layer 1 — Retry with exponential backoff**
Every LLM call is wrapped in `with_retry()`. It retries 3 times:
attempt 1 → wait 0.5s → attempt 2 → wait 1.0s → attempt 3 → wait 2.0s.
`Code: utils/retry.py`

**Layer 2 — Circuit Breaker (G2)**
If an agent fails 5 times within 60 seconds, the circuit breaker OPENS.
While open, calls fail immediately without hitting the LLM — fast fail.
After 30 seconds, the circuit half-opens and allows one test call.
If it succeeds, the circuit closes. If not, it stays open.
This protects against cascading failures when the LLM API is degraded.
`Code: utils/retry.py → breaker_status()`

**Layer 3 — Graceful Degradation (G5)**
Even if all retries and the circuit breaker fail, I never return a 500 error.
I return a graceful fallback response explaining the system is temporarily
unavailable. The degradation_tracker records full/partial/fallback/failed
per agent type for observability.
`Code: guardrails/production.py → degradation_tracker`"

---

### Q: "What is your caching strategy?"

**Answer:**
"I have a 3-level caching system:

**L1 — Exact Hash Cache (in-memory)**
SHA-256 hash of `role_name + sorted(skills)`.
If the same role+skills combination was seen before, return instantly (<1ms).
Zero LLM cost. 

**L2 — Semantic Cache (cosine similarity)**
If L1 misses, I embed the new query and compare it against cached query embeddings.
If cosine similarity ≥ 0.92, the queries are semantically equivalent — same role,
slightly different phrasing. Return the cached result.
This catches 'AI/ML Engineer' vs 'ML Engineer' as essentially the same.
`Code: cache/semantic_cache.py`

**Redis (distributed cache)**
For multi-instance deployments, both L1 and L2 are backed by Redis.
Redis also enables cache sharing across multiple backend pods.

**Why this order:**
L1 is O(1) dictionary lookup — microseconds.
L2 requires an embedding call — milliseconds but still <100ms.
Full LLM pipeline — 3-5 seconds.
Skip as much as possible, as early as possible."

---

## SECTION 3 — GUARDRAILS G1–G5

### Q: "Tell me about your guardrails."

**Answer:**
"I have 5 production guardrails. I call them G1 through G5:

**G1 — Rate Limiter**
60 requests per minute per IP. If exceeded, return HTTP 429 immediately.
I use `X-Real-IP` (set by the load balancer) as the key, not `X-Forwarded-For`
which is client-controlled and can be spoofed.
`Code: middleware/rate_limit.py`

**G2 — Circuit Breaker**
Opens after 5 LLM failures in 60 seconds. Resets after 30 seconds.
Protects the system from cascading failures.
`Code: utils/retry.py`

**G3 — JSON Repair Cascade**
LLMs sometimes return malformed JSON. My repair cascade has 4 levels:
1. Direct `json.loads()` — if it's valid JSON, use it
2. Extract from markdown fences (```json ... ```)
3. Regex extraction of the JSON object
4. LLM-assisted repair — ask the LLM to fix its own output
`Code: utils/json_parser.py → parse_llm_json()`

**G4 — PII Filter**
All LLM outputs are scanned for email addresses and phone numbers.
These are stripped before the response reaches the client.
I use regex patterns that I verified against ReDoS — no backtracking risk.
`Code: guardrails/production.py → filter_pii_from_mapping()`

**G5 — Graceful Degradation**
Every agent operation is tracked: full_success / partial / fallback / failed.
Even if everything breaks, users get a helpful message, not a 500 error.
`Code: guardrails/production.py → degradation_tracker`"

---

## SECTION 4 — SECURITY

### Q: "How did you handle security?"

**Answer:**
"Security is layered across multiple middleware and utility layers:

**1. SecurityHeadersMiddleware** (every request)
Adds HSTS, Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff.
These prevent clickjacking, MIME sniffing, and force HTTPS.
`Code: middleware/security_headers.py`

**2. JWT Authentication**
HS256 tokens, 24-hour expiry, all secrets from environment variables.
RBAC: regular users access their own data, admin users can manage roles and documents.
`Code: auth/jwt_handler.py`

**3. Prompt Injection Detection**
CV text and role names are scanned for injection patterns before reaching the LLM.
Patterns like 'ignore previous instructions', 'system:', 'SYSTEM:' are flagged.
Every LLM call is audit-logged with input snippet, output snippet, tokens, cost.
`Code: utils/security.py → check_injection()`

**4. Timing-safe password comparison**
I use `hmac.compare_digest()` instead of `==` for password verification.
Plain equality comparison leaks timing information — an attacker can measure
response time to determine how many characters matched.
`Code: auth/jwt_handler.py`

**5. PDF Magic Bytes Validation**
I don't just check the file extension. I read the first 4 bytes and verify they
start with `%PDF`. A file renamed to `.pdf` is rejected at the byte level.
`Code: main.py → upload_cv endpoint`

**6. X-Real-IP for rate limiting**
`X-Forwarded-For` is client-controlled. `X-Real-IP` is set by nginx/envoy.
Using the wrong header lets attackers rotate IPs to bypass rate limiting.
`Code: middleware/rate_limit.py`"

---

## SECTION 5 — OBSERVABILITY & METRICS

### Q: "How do you monitor this system in production?"

**Answer:**
"I have a full observability stack, all visible at `/metrics` endpoint:

**Token Economics**
Every LLM call goes through a LangChain callback that captures:
- Prompt tokens, completion tokens, total tokens
- Cost in USD (DeepSeek pricing: ~$0.000137 per full analysis)
Per-agent breakdown so you know which agent is expensive.
`Code: utils/token_tracker.py`

**Latency Percentiles**
I track p50, p95, p99 per endpoint.
Every request gets a correlation ID (UUID) logged at entry and exit.
`Code: middleware/logging_mw.py → RequestLoggingMiddleware`

**Cache Statistics**
L1 hit rate, L2 hit rate, Redis hit rate — visible in real time.
This tells me whether my caching strategy is actually working.

**RAGAS Evaluation**
After every role mapping, I run async RAGAS evaluation:
- Faithfulness score (does output match retrieved context?)
- Answer Relevancy score
- Context Precision score
Historical RAGAS scores are stored in SQLite and shown as time-series.
`Code: metrics/ragas_eval.py`

**Guardrail Counters**
Live counts of: rate limit hits, circuit breaker trips, JSON repairs,
PII filter activations, graceful degradations — per guardrail type.
`Code: guardrails/persistence.py`"

---

## SECTION 6 — MEMORY & AGENT STATE

### Q: "How do your agents remember context across sessions?"

**Answer:**
"I have two memory tiers, both persisted in SQLite:

**Episodic Memory (short-term)**
Each session stores: timestamp, role explored, plan status, key events.
When the same user returns, the agent loads their last 5 sessions as context.
This means the agent knows 'you were working towards AI/ML Engineer last week,
your plan had 14 tasks, you completed 7'.
`Code: memory/session_store.py → get_recent_sessions()`

**Long-term Facts (semantic memory)**
Persistent facts extracted from interactions: which skills the user has,
what roles they've explored, their training history.
These facts are injected into every subsequent LLM system prompt.
`Code: memory/session_store.py → get_user_facts()`

**Why this matters:**
Without memory, every session is a blank slate. The user re-explains their
background, re-selects their role, re-reads their gaps. It's a terrible UX.
With memory, session 2 starts with the agent already knowing the user's context.

**Interview explainer:** I have a dedicated `/memory/{user_id}` endpoint that
shows the exact LLM context string that gets injected into the system prompt.
Interviewers love seeing the concrete context string — makes it real."

---

## SECTION 7 — STREAMING

### Q: "How does your streaming work?"

**Answer:**
"I use Server-Sent Events (SSE) for the plan generation endpoint.

The frontend opens a GET request to `/generate-plan/stream`.
The backend keeps the connection open and streams tokens one by one.
The Angular UI renders each token as it arrives — users see the plan being
written in real time rather than waiting 5-10 seconds for a full response.

**Why SSE over WebSockets?**
SSE is unidirectional (server→client) which is exactly what streaming LLM output is.
SSE works over regular HTTP — no WebSocket upgrade handshake overhead.
SSE has built-in reconnection. For this use case, it's simpler and more reliable.

**LangGraph consideration:**
Note: if I were using LangGraph for a multi-step graph, I'd need to run the full
graph first and then stream the final output — you can't stream mid-graph.
For my 4-agent pipeline, each agent runs sequentially so I can stream the
planner's output while cv_parser and role_mapper complete synchronously.

`Code: main.py → /generate-plan/stream endpoint`
`Code: frontend/src/app/components/dashboard/dashboard.component.ts`"

---

## SECTION 8 — TESTING

### Q: "How did you approach testing?"

**Answer:**
"502 tests, 94.7% coverage, 0 failures. Let me explain the approach:

**Test Philosophy:**
Every module has unit tests AND integration tests. I test positive paths
(correct inputs → correct outputs) AND negative paths (wrong inputs → correct errors).

**Key test files:**
- `test_api.py` — 29 tests, all FastAPI endpoints with mocked LLM
- `test_agents.py` — 18 tests for all 4 agents
- `test_rag.py` — 45 tests: BM25, FAISS, RRF, HyDE, CRAG all tested independently
- `test_guardrails.py` + `test_guardrails_extra.py` — 72 tests for G1–G5
- `test_auth.py` — 24 tests: JWT valid, JWT expired, JWT tampered, RBAC
- `test_security_headers.py` — 10 tests verifying every security header

**Example negative test (B5 — missing skill key):**
Tracking agent used `t["skill"]` — would crash with KeyError if LLM returned
a task without the skill field. Test: pass a task dict with no `skill` key.
Expected: covered_skills = ['unknown'], no exception.
`Code: tests/test_agents.py`

**SonarQube Quality Gate: PASSED**
Bugs: 0, Vulnerabilities: 0, Code Smells: 0, Coverage: 94.7%, Duplicated Lines: 0.2%"

---

## SECTION 9 — SYSTEM DESIGN QUESTIONS

### Q: "How would you scale this to 10,000 concurrent users?"

**Answer:**
"My current architecture already has the right foundations. Here's the scaling path:

**Horizontal scaling:**
FastAPI is async throughout — no blocking I/O. Multiple instances behind a load balancer.
SQLite → PostgreSQL (the code uses aiosqlite, swapping connection string is enough).
Redis is already the distributed cache backend.

**Kafka already in place:**
`bench.cv.uploaded` and `bench.plan.requested` events go to Kafka.
At scale, CV parsing and plan generation move to async consumers.
The HTTP endpoint returns a job ID immediately, consumer processes in background.
This decouples API latency from LLM latency.

**LLM cost at scale:**
At 10,000 users, my L1+L2 cache would absorb most requests (bench employees
in the same company map to the same 10-20 roles).
Cache hit = 0 LLM cost. DeepSeek is already 500× cheaper than GPT-4o.

**Rate limiter:**
Already in place at 60/min/IP. At scale, move to Redis-backed distributed rate limiter
instead of in-memory dict."

---

### Q: "Why DeepSeek instead of GPT-4?"

**Answer:**
"Three reasons:

1. **Cost:** DeepSeek at $0.000137 per full analysis vs ~$0.06 for GPT-4o.
   That's 500× cheaper. At 10,000 analyses per month, that's $1.37 vs $600.

2. **Performance:** DeepSeek matches GPT-3.5 Turbo on JSON extraction tasks
   and role analysis. For structured output tasks with clear prompts, the
   quality difference from GPT-4o is negligible.

3. **API compatibility:** DeepSeek uses the OpenAI-compatible SDK.
   Swapping to GPT-4o is one line change: `model='gpt-4o'`. No code changes.

The key insight: for constrained, structured tasks (extract skills, compare to role,
output JSON), a cheaper model with good prompts beats a expensive model with lazy prompts."

---

### Q: "What would you improve if you had 2 more weeks?"

**Answer:** *(Shows you think like a senior engineer)*

"Three things, in priority order:

1. **Reranking model upgrade**
   Currently I use a basic cross-encoder from sentence-transformers.
   I'd upgrade to Cohere Rerank API or a fine-tuned BGE reranker for better precision.
   
2. **Multi-turn conversation with Nova**
   The current Nova AI agent (bench-agent component) answers questions about the system
   but doesn't have access to the user's actual plan and progress data.
   I'd wire it to the memory API so Nova can say 'You're 50% ready, missing MLflow —
   do you want me to update your plan?' — truly agentic.

3. **Asynchronous plan generation**
   Currently SSE streaming keeps the HTTP connection open for 5-10 seconds.
   At scale, I'd move to: POST returns a job_id, Kafka consumer processes it,
   frontend polls `/plan-status/{job_id}` — cleaner decoupling."

---

## SECTION 10 — THE LIVE DEMO SCRIPT

### When they say "show me the application"

**Do this sequence (takes 4 minutes):**

```
1. Open http://localhost:4200 (or 4201)
   → Show the clean login page
   → Say: "JWT auth, RBAC, HS256 tokens"

2. Login as user / BenchUs3r@2026
   → Land on Upload CV page
   → Say: "Role-based routing — users land here, admins see admin panel"

3. Upload docs/dummy_resume.pdf
   → Show the CV parsing in ~3 seconds
   → Point out: cv_parser@v2 badge, Secure parse tag
   → Say: "Injection-hardened prompt, magic bytes PDF validation, token tracked"

4. Click Continue to Role Mapping
   → Select AI/ML Engineer
   → Click Analyse Fit
   → Show 90% match, missing skills (MLflow, SQL)
   → Say: "This just ran: HyDE → BM25+FAISS+RRF → cross-encoder rerank → CRAG → DeepSeek → faithfulness check"

5. Click Generate 7-Day Plan (Streaming)
   → Show tokens appearing one by one
   → Say: "SSE streaming — user sees progress immediately, not a 10s loading spinner"

6. Navigate to /metrics
   → Show token usage, latency p50/p95/p99, cache stats, RAGAS scores, guardrail counters
   → Say: "Full observability — this is what I'd connect to CloudWatch or Grafana in production"

7. Navigate to /memory
   → Load memory for user_id from session
   → Show the exact LLM context string
   → Say: "This string is injected into every subsequent LLM call — the agent always knows who it's talking to"
```

---

## SECTION 11 — TRICKY QUESTIONS

### Q: "What's the biggest limitation of your system?"

**Answer:** *(Honesty wins trust)*
"SQLite is the bottleneck for true production scale. I chose it for simplicity
and zero-dependency local dev, and it's fine for hundreds of concurrent users.
The code uses aiosqlite so all DB calls are async. Migrating to PostgreSQL is
one connection string change — I designed for that.

Also: Kafka is currently local. In production I'd use a managed Kafka (Confluent or AWS MSK).
Currently if Kafka is unavailable, I log the error but the request still succeeds — events
are best-effort. For strict audit requirements, I'd implement a transactional outbox pattern."

---

### Q: "How do you prevent hallucinations?"

**Answer:**
"Three-layer hallucination defence:

1. **CRAG quality gate** — if retrieved context is poor, don't send it to the LLM
2. **Faithfulness check** — after LLM responds, score whether the output is grounded
   in the retrieved context. Flag responses where faithfulness < 0.25.
3. **LLM-as-Judge** — `guardrails/hallucination.py` uses a separate LLM call to
   evaluate the quality of the primary LLM's response.

Plus structural guardrails: I always ask for structured JSON output with a schema.
A JSON schema constrains what the LLM can output — it can't invent fields.
G3 JSON repair catches malformed outputs before they reach the user."

---

### Q: "Have you worked with LangGraph?"

**Answer:**
"Yes — LangGraph is integrated in this project for the agent orchestration graph.
The agent-graph page at `/agent-graph` visualises the pipeline:
cv_parser → role_mapper → planner → tracker.

Key LangGraph concept I understand: in a graph with multiple nodes, you can't
stream mid-graph easily. You run the full graph to completion, then stream
the final output. This differs from a simple sequential chain where you can
stream each step.

For agentic systems, LangGraph gives you: cycles (retry loops), conditional edges
(if confidence < threshold, take different path), and proper state management
across node transitions. My circuit breaker and retry logic could be expressed
more cleanly as a LangGraph conditional edge pattern."

---

### Q: "What is the difference between your episodic memory and long-term memory?"

**Answer:**
"Episodic memory = *events in order* — what happened in each session.
'On 2026-06-15, user mapped to AI/ML Engineer. Plan generated: 14 tasks. 0 completed.'
It's a timestamped log of user actions. Limited to last 5 sessions.

Long-term facts = *distilled knowledge* — what we know about this user.
'Skills: Python, TensorFlow, FastAPI. Target role: AI/ML Engineer. Missing: MLflow, SQL.'
It's extracted from sessions and stored as key-value facts. No expiry.

When a user starts a new session, both are loaded:
- Long-term facts → inject into system prompt so LLM knows who this user is
- Recent episodes → show progression context ('you completed 7/14 tasks last week')

This mirrors how a human manager remembers a team member:
'I know you're strong in Python (long-term fact) and last week you finished the Docker module (episodic).'"

---

## QUICK REFERENCE — NUMBERS TO MEMORISE

| Metric | Value |
|--------|-------|
| Test count | 502 |
| Test coverage | 94.7% |
| SonarQube gate | PASSED |
| Bugs | 0 |
| Vulnerabilities | 0 |
| Agents | 4 |
| Guardrails | 5 (G1–G5) |
| Cache levels | 3 (L1 hash, L2 cosine, Redis) |
| RAG stages | 7 |
| Rate limit | 60 req/min/IP |
| JWT expiry | 24 hours |
| Circuit breaker | 5 failures → open → 30s reset |
| Retry delays | 0.5s → 1.0s → 2.0s |
| CV truncation limit | 1200 chars |
| LLM cost per analysis | ~$0.000137 |
| FAISS recall | ~60% |
| +BM25+RRF recall | ~78% |
| +HyDE recall | ~83% |
| Cache L2 threshold | cosine ≥ 0.92 |
| Roles seeded | 6 (from roles_knowledge.json) |
| Kafka topics | 3 (cv.uploaded, plan.requested, dlq) |
| LLM | DeepSeek deepseek-chat |
| Embeddings | HuggingFace all-MiniLM-L6-v2 (local, free) |
| Frontend | Angular 17 (standalone components) |
| DB | SQLite WAL mode (PostgreSQL-ready) |

---

## HOW TO RUN IT LOCALLY (Memorise This)

```bash
# Terminal 1 — Backend
cd bench-resource-optimizer/backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 --env-file .env

# Terminal 2 — Frontend
cd bench-resource-optimizer/frontend
ng serve --proxy-config proxy.conf.json --port 4201

# URLs
Frontend:  http://localhost:4201
API:       http://localhost:8000
Swagger:   http://localhost:8000/docs

# Credentials
User:  user / BenchUs3r@2026
Admin: admin / BenchAdm!n@2026
```

---

## FILES MAP — "Show me the code for X"

| Interview asks about | File to open |
|---------------------|--------------|
| RAG pipeline | `backend/rag/advanced_retrieval.py` |
| Agents | `backend/agents/role_mapping_agent.py` |
| Guardrails | `backend/guardrails/production.py` |
| Caching | `backend/cache/semantic_cache.py` |
| Memory | `backend/memory/session_store.py` |
| JWT Auth | `backend/auth/jwt_handler.py` |
| Security | `backend/utils/security.py` |
| Streaming | `backend/main.py` (search: `/generate-plan/stream`) |
| Retry/breaker | `backend/utils/retry.py` |
| Token tracking | `backend/utils/token_tracker.py` |
| RAGAS eval | `backend/metrics/ragas_eval.py` |
| Prompt versioning | `backend/prompts/loader.py` |
| All endpoints | `backend/main.py` |
| Frontend streaming | `frontend/src/app/components/dashboard/dashboard.component.ts` |
| Angular services | `frontend/src/app/services/api.service.ts` |
