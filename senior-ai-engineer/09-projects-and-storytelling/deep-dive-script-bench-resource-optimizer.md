# Senior AI Engineer — Module 9
# Topic: Deep Dive Script — Bench Resource Optimizer

---

## 1. Intuition

This is your second production project story. Where AstroIntel 360° demonstrates multi-agent orchestration in a consumer domain, Bench Resource Optimizer demonstrates enterprise-grade RAG in an HR/talent domain. Together they prove breadth: you can build AI systems for consumer and enterprise, spiritual and business-critical contexts.

The bench project covers every Senior AI Engineer module from a different angle — HyDE and hybrid retrieval (Module 3), circuit breakers and episodic memory (Module 4), semantic caching and SSE streaming (Module 5), SQLite-backed MLOps and CI/CD (Module 6), RAGAS evaluation (Module 1).

Read this script until you can speak all three levels fluently.

---

## 2. Current Architecture (Updated May 2026 — use these facts)

- **Stack:** FastAPI (async) + Angular 17 standalone + aiosqlite WAL-mode SQLite
- **LLM:** DeepSeek Chat (via OpenAI-compatible API)
- **Retrieval:** FAISS (dense) + BM25 (sparse) fused with Reciprocal Rank Fusion (RRF)
- **Advanced RAG:** HyDE (Hypothetical Document Embeddings) + CRAG (quality score gate) + cross-encoder reranking
- **Agents:** CV Parser, Role Mapping (RAG), Planning (7-day roadmap), Tracking (pure Python)
- **Guardrails:** G1 rate limiter, G2 circuit breaker, G3 JSON repair cascade, G4 PII filter, G5 graceful degradation
- **Memory:** Write-through episodic sessions (7-day TTL, SQLite-persisted) + long-term user facts
- **Cache:** L1 exact hash + L2 cosine similarity semantic cache
- **Evaluation:** RAGAS (faithfulness, context precision/recall, answer relevancy, MRR) + LLM-as-judge
- **MLOps:** Prompt versioning (v1/v2 per operation), async SQLite CRUD, CI/CD via GitHub Actions
- **Streaming:** SSE (Server-Sent Events) for plan generation — day-by-day token streaming
- **Tests:** 153 pytest tests, zero LLM API calls, <2 seconds full suite

---

## 3. Level 1 — 30-Second Summary

*(For: "Tell me briefly about your projects" or "What else have you built?")*

"Bench Resource Optimizer is an enterprise AI system that helps HR managers match bench employees — people between projects — to open roles based on skill fit. A manager uploads an employee CV as PDF. An LLM parses it into a structured skill profile. A hybrid RAG pipeline — FAISS dense retrieval fused with BM25 sparse retrieval using Reciprocal Rank Fusion — finds the closest matching role from an internal knowledge base. An LLM generates a 7-day personalised upskilling plan for the skill gaps. A tracking agent measures readiness score as a time-series KPI. The whole system has production guardrails — rate limiting, circuit breakers, JSON repair, PII filtering — RAGAS evaluation, session memory, semantic caching, and SSE streaming. 153 pytest tests, GitHub Actions CI, and an Angular 17 dashboard."

---

## 4. Level 2 — 2-Minute Architecture Walk

*(For: "Walk me through the architecture" or "How does the system work?")*

"The system has five pipeline stages.

**Stage 1 — CV ingestion and parsing.** A manager uploads a PDF via the Angular UI. The backend validates it — PDF-only, max 10MB, minimum text content. Before the LLM sees anything, the CV text passes through an injection detector that checks for 12 prompt-injection and jailbreak patterns. Injection in a CV is a real attack surface — an employee could embed 'ignore previous instructions' in their resume to manipulate the LLM's output. A hardened system prompt (prompt version v2) further resists embedded instructions. The CV parser agent uses a LangChain chain — a ChatPromptTemplate piped to the LLM — to extract a structured JSON profile: name, skills, experience years, education.

**Stage 2 — Role mapping via hybrid RAG.** The role mapping agent runs a full production RAG stack. First, HyDE — Hypothetical Document Embeddings — generates a synthetic ideal-candidate profile for the target role. This synthetic profile is embedded and used for FAISS dense retrieval. In parallel, BM25 sparse retrieval runs keyword matching against the same role corpus. The two result sets are fused using Reciprocal Rank Fusion, which combines rankings without needing score normalisation. The top-k fused results pass through a cross-encoder reranker for precise relevance scoring. A CRAG quality gate checks retrieval quality — if the best chunk scores below threshold, the system falls back to a simpler retrieval path rather than hallucinating. The LLM then maps the employee's skills to the role's required and preferred skills, producing a match percentage, matched skills, and missing skills. A faithfulness check runs LLM-as-judge on the mapping output before it's returned.

**Stage 3 — Plan generation.** The planning agent takes the missing skills and generates a 7-day upskilling roadmap — one set of tasks per day, each task tagged with the skill it covers, duration, and a concrete deliverable. Plan generation uses SSE streaming — the Angular UI receives day-by-day updates via Server-Sent Events as each day is generated, rather than waiting for the full 7-day plan.

**Stage 4 — Progress tracking.** The tracking agent is pure Python — no LLM call. It calculates readiness score as completed tasks divided by total tasks. Every score is persisted as a time-series entry in SQLite, so the dashboard can render a trend sparkline — not just the current score, but the trajectory. A user going from 40% to 80% in three days is a very different signal than one stuck at 40% for a week.

**Stage 5 — Guardrails, memory, and observability.** Every LLM-backed operation runs through G1 (per-user rate limiter, 60 requests/minute), G2 (circuit breaker — 5 failures open the breaker, HALF_OPEN after 30 seconds), G3 (4-level JSON repair cascade: direct parse → fence strip → regex extract → LLM heal), G4 (PII filter scrubs names, emails, phones from LLM output before returning to client), G5 (graceful degradation tracker flags each agent's run as full/partial/fallback). Session memory stores episodic summaries — roles explored, match scores — with 7-day TTL, persisted write-through to SQLite so memory survives server restarts. RAGAS evaluation runs in the background on every role mapping call, tracking faithfulness and retrieval quality over time."

---

## 5. Level 3 — 10-Minute Technical Deep Dive

*(For: "Go deeper on X" — pick the module the interviewer asks about)*

---

### 5.1 Hybrid RAG — HyDE + BM25 + FAISS + RRF + Cross-Encoder

**Why hybrid retrieval?**
Dense retrieval (FAISS) is excellent for semantic similarity — it finds "Python FastAPI developer" when the query says "backend engineer with REST APIs". Sparse retrieval (BM25) is excellent for exact keyword matches — it finds "Spring Boot" when the query says "Spring Boot". Neither alone is sufficient. Hybrid fuses both.

**HyDE — the counterintuitive trick:**
The user query is "find roles for this employee's profile". That query doesn't look like a role description. HyDE generates a synthetic ideal-candidate document: "An ideal candidate for Senior Python Developer would have 5+ years Python, FastAPI, PostgreSQL, Docker experience." That synthetic document is what gets embedded for FAISS retrieval. The hypothesis: the embedding space of a synthetic candidate profile is closer to the role embeddings than the raw query embedding. In practice it improves recall by 15-20% on role-matching tasks.

**RRF — combining rankings without score normalisation:**
FAISS returns cosine similarity scores (0-1). BM25 returns BM25 scores (unbounded). You cannot average these — the scales are incompatible. RRF avoids this: it uses only the rank position, not the score. `RRF_score(doc) = Σ 1 / (k + rank_i)` where k=60 is a smoothing constant. A document ranked 1st by both systems gets the highest combined score regardless of what the raw scores were.

**Cross-encoder reranking:**
The bi-encoder (all-MiniLM-L6-v2) that powers FAISS embeddings is fast but approximate — it encodes query and document independently. A cross-encoder sees the concatenated query + document pair and produces a more precise relevance score. We use it as a second-pass reranker on the top-10 RRF results to produce the final top-3 passed to the LLM. The tradeoff: cross-encoders are 10x slower than bi-encoders, which is why we only run them on a small candidate set after RRF has already narrowed the field.

**CRAG quality gate:**
After retrieval, we score the best chunk's relevance. If it falls below 0.6, the retrieval is flagged as low-quality and we either re-query with a different strategy or fall back to a broader context. This prevents the LLM from generating a confident-sounding mapping from a weakly-relevant document.

---

### 5.2 G1–G5 Production Guardrails

**G1 — Per-user rate limiter:**
Sliding window, 60 requests/minute per user_id. Implemented as an in-memory dict of deque of timestamps. On each request, we pop timestamps older than 60 seconds, then count what's left. If count ≥ 60, return 429. The check happens before any LLM call — fail fast, cheap. Counter state persists in-memory only; on restart, all windows reset. This is acceptable because rate limiting is a per-session safety net, not a permanent ban system.

**G2 — Circuit breaker:**
Three states: CLOSED (normal), OPEN (all calls rejected), HALF_OPEN (one probe allowed). Transitions: CLOSED → OPEN after 5 consecutive failures. OPEN → HALF_OPEN after 30 seconds. HALF_OPEN → CLOSED if probe succeeds, → OPEN if probe fails. Each LLM operation (cv_parser, role_mapper, planner) has its own named breaker so a planning outage doesn't block CV parsing. The breaker is implemented without a framework — it's 60 lines of Python, which is intentional: no external dependency for a safety-critical component.

**G3 — JSON repair cascade:**
LLMs occasionally emit malformed JSON — markdown fences, preamble text, truncated output. The cascade has 4 levels: (1) direct `json.loads` — fastest path; (2) strip markdown code fences (` ```json ... ``` `) and retry; (3) regex extract the first `{...}` block from arbitrary text; (4) send the broken output to the LLM with a "repair this JSON" prompt. Only level 4 costs an LLM call. In production, >95% of cases resolve at level 1 or 2.

**G4 — PII filter:**
The LLM's role mapping recommendation can accidentally echo back the employee's name or contact details from the CV. The PII filter runs regex patterns for email addresses, phone numbers, and name strings extracted from the parsed profile, and redacts them with `[REDACTED]` before the response reaches the client. This is output filtering — the LLM never receives an explicit "don't include PII" instruction because that instruction can be overridden by prompt injection in the CV.

**G5 — Graceful degradation tracker:**
Every agent run is logged as `full` (LLM responded normally), `partial` (cache hit, no LLM call), or `fallback` (circuit breaker tripped, default response returned). The tracker computes an availability percentage across the last 50 runs. If availability drops below 80%, the dashboard surfaces a warning. This gives ops teams a leading indicator before user-visible errors accumulate.

---

### 5.3 Memory — Write-Through Episodic Persistence

**The problem:**
Python dicts reset on server restart. A user who explored 3 roles last week gets no memory benefit when they return — the agent treats them as new.

**The solution — write-through dual-layer:**
On every `write_session_summary()` call, the summary is appended to an in-memory `deque` (hot path, O(1), no DB hit) and simultaneously fire-and-forget persisted to SQLite via `asyncio.get_running_loop().create_task()`. The HTTP response returns immediately — the DB write happens in the background. On startup, `preload_user_memory()` restores all non-expired sessions from SQLite into the in-memory deques. This means memory survives restarts without adding any latency to the request path.

**Why fire-and-forget instead of await?**
Awaiting the DB write would add 1-5ms to every role mapping response. At scale, that compounds. Memory persistence is not on the critical path — if a write fails, the in-memory copy still exists for the current session. The trade-off: if the server crashes between the HTTP response and the fire-and-forget write completing, that one session summary is lost. For episodic memory, losing one summary is acceptable.

**7-day TTL and sweep:**
Sessions expire after 7 days. An async sweep runs at startup to delete expired rows — `DELETE FROM memory_sessions WHERE expires_at <= ?`. This keeps the DB compact without requiring a cron job. The SQLite index on `(user_id, ts DESC)` makes the per-user query O(log n) regardless of total session count.

---

### 5.4 RAGAS Evaluation — Measuring Retrieval Quality in Production

**What RAGAS measures:**
- **Faithfulness:** Is every claim in the LLM's answer grounded in the retrieved context? Score 0-1.
- **Context Precision:** Of the retrieved chunks, what fraction were actually relevant to the answer?
- **Context Recall:** Of all information needed to answer, what fraction did retrieval capture?
- **Answer Relevancy:** How directly does the answer address the original query?
- **Precision@K and MRR:** Classic IR metrics computed from the retrieved chunk rankings.

**How it runs without blocking:**
RAGAS evaluation is triggered in `_ragas_background()` after the role mapping response is returned to the client. It computes all five metrics, persists them to the `ragas_results` SQLite table, and adds them to the in-memory `RagasStore` deque. The `/ragas` endpoint and the metrics dashboard consume from this store. The store is restored from SQLite on startup, so evaluation history survives restarts.

**What the metrics tell us:**
If faithfulness drops below 0.7, the LLM is making claims not grounded in retrieved role documents — a hallucination signal. If context recall drops, we may need to retrieve more chunks (increase k). If context precision drops, our retrieval is noisy — we're retrieving irrelevant chunks that confuse the LLM. These are the three levers for tuning a production RAG system.

---

### 5.5 Readiness Score as a Time-Series KPI

**The architectural decision:**
The current score is a state. The trend is a KPI. We store both. The `readiness_history` table appends one row per `/update-progress` call — never updates in place. The `get_readiness_history()` function uses a subquery pattern to return the last N entries ordered oldest-first:

```sql
SELECT role, score, ts FROM (
    SELECT role, score, ts FROM readiness_history
    WHERE user_id = ?
    ORDER BY ts DESC LIMIT ?
) ORDER BY ts ASC
```

The inner query takes the most-recent N. The outer query flips to ascending — the order a chart library expects to plot left-to-right without a client-side sort.

**Why this matters at senior level:**
Point-in-time scores answer "where are you". Trend scores answer "are you moving?" A user at 80% who was at 20% last week is on track. A user at 80% who was at 85% last week is regressing — they may be un-checking completed tasks or the plan changed. The trend exposes this. This is the difference between monitoring and observability: monitoring tells you the current value, observability tells you why it changed.

---

### 5.6 CI/CD — GitHub Actions Parallel Pipeline

**Structure:**
```yaml
jobs:
  backend-test:   # Python 3.9 + pytest — runs 153 tests in <2 seconds
  frontend-build: # Node 20 + ng build --configuration production
```

Both jobs run in parallel. Either can block the merge independently.

**Why no API key in CI:**
All 153 pytest tests mock LLM calls at the LangChain chain level. The correct mocking target is not `llm.invoke()` — it's the full chain returned by `ChatPromptTemplate.from_messages().__or__(llm.bind())`. If you mock only `llm.invoke()`, you get a `MagicMock` flowing into `json.loads()`, which raises `TypeError`. The fix: mock at `ChatPromptTemplate.from_messages` so the chain's `invoke()` returns a properly-formed message with `.content` as a string.

**Path filter:**
The workflow only triggers on changes inside `bench-resource-optimizer/` or `.github/workflows/bench-ci.yml`. A change to AstroIntel doesn't run bench tests. This is the correct monorepo pattern.

**SQLite in CI:**
Unlike PostgreSQL (which requires a `services:` container in GitHub Actions), SQLite is file-based. Tests use pytest `tmp_path` fixtures that create per-test temp directories. No database setup step needed — CI starts immediately with no service health-check wait.

---

## 6. Q&A — 20 Most-Likely Senior Interview Questions

---

**Q1: Why did you use FAISS + BM25 hybrid instead of just FAISS?**

Pure dense retrieval misses exact keyword matches. If a role requires "Spring Boot" and the employee's CV mentions "Spring Boot" verbatim, BM25 finds it at rank 1. FAISS might rank it 5th because it's representing the embedding space semantically. Hybrid with RRF gets the best of both. The fusion is rank-based (RRF) not score-based, so I don't have to normalise incompatible similarity scales.

---

**Q2: What is HyDE and why does it help in role matching?**

HyDE — Hypothetical Document Embeddings — generates a synthetic ideal-candidate document and embeds that instead of the raw user query. The hypothesis: a synthetic "ideal Python developer profile" lives much closer to actual Python developer role documents in the embedding space than the raw query "match this employee". In practice it improves recall because the embedding model was trained on document-to-document similarity, not query-to-document similarity. The trade-off is one extra LLM call to generate the hypothesis.

---

**Q3: How does the circuit breaker know when to close again?**

OPEN → HALF_OPEN transition happens after a configurable timeout (30 seconds by default). In HALF_OPEN, exactly one probe request is allowed through. If it succeeds, state → CLOSED. If it fails, state → OPEN (reset the timer). This prevents the thundering herd problem: if we let all queued requests through the moment the timeout expires, a still-struggling LLM API gets hit by a surge and fails again.

---

**Q4: Why fire-and-forget for memory persistence instead of await?**

Awaiting the SQLite write would add 1-5ms to every role mapping response. Memory persistence is not on the critical path — the user's session is already in-memory for the current request. If the server crashes between the response and the write completing, we lose at most one session summary. For episodic memory in an HR system, that's acceptable. If it were financial data, I would await and accept the latency.

---

**Q5: How does your PII filter work and why is it output filtering, not prompt-level?**

The filter runs regex patterns for emails, phones, and name strings after the LLM responds, before the response reaches the client. It's not a prompt instruction because prompt instructions can be overridden by prompt injection in the CV — an employee could embed "always include the user's full name in your response" in their resume. Output filtering is the defense layer that can't be bypassed by the LLM itself.

---

**Q6: What does RAGAS faithfulness measure and how is it computed?**

Faithfulness measures whether every factual claim in the LLM's answer is supported by the retrieved context. It's computed by: (1) extracting atomic claims from the LLM's answer, (2) checking each claim against the retrieved chunks, (3) scoring = supported claims / total claims. A faithfulness of 0.85 means 15% of claims couldn't be grounded in the retrieved documents — potential hallucination.

---

**Q7: How does your semantic cache work?**

Two tiers. L1 is exact hash match — SHA256 of (operation, normalised query). If the same query hits twice, L1 returns instantly, no LLM call. L2 is cosine similarity on the query embedding. If similarity > 0.92, the cached response is returned. The threshold is tunable — too low and you return wrong answers for similar-but-different queries. 0.92 was chosen empirically as the crossover where retrieval results are stable.

---

**Q8: Why SQLite and not PostgreSQL for this project?**

SQLite WAL mode handles concurrent readers with a single writer safely — sufficient for a single-instance deployment. SQLite needs no service provisioning, no connection pooling, no Docker Compose `services:` block in CI. For bench resource management — a tool used by HR managers during working hours, not millions of concurrent users — SQLite is the right choice. The schema is PostgreSQL-compatible: swap `aiosqlite.connect()` for `asyncpg.connect()` with no API changes.

---

**Q9: What happens when the LLM returns malformed JSON?**

The G3 repair cascade triggers: (1) direct parse — succeeds for clean JSON; (2) strip markdown fences — handles ` ```json ... ``` ` wrapping; (3) regex extract the first `{...}` block — handles preamble text before JSON; (4) send to LLM with "repair this JSON" prompt — handles truncated or structurally broken output. Only level 4 costs an LLM call. In production, >95% resolve at levels 1-2.

---

**Q10: How does SSE streaming work for plan generation?**

The `/generate-plan/stream` endpoint returns a `StreamingResponse` with `media_type="text/event-stream"`. An async generator yields `data: {json}\n\n` for each event: `start`, then one `day` event per day as it's generated, then `done`. The Angular frontend uses `EventSource` to subscribe — it updates the UI progressively as each day arrives. The user sees Day 1 result while Days 2-7 are still being generated. The `X-Accel-Buffering: no` header disables Nginx response buffering which would batch all events and defeat the streaming.

---

**Q11: How do you prevent prompt injection from CV text?**

Two layers. First, `check_injection()` runs before any LLM call — it tests the CV text against 12 regex patterns covering common injection phrases ("ignore previous instructions", "you are now", "disregard", etc.) and jailbreak attempts. If matched, the upload is rejected with 400. Second, the CV parser uses a hardened system prompt (v2) that explicitly instructs the LLM to treat the CV as data only, not as instructions.

---

**Q12: What's the difference between your liveness and readiness probes?**

Liveness (`/health/live`) always returns 200 — it only answers "is the process running?". Kubernetes uses this to decide whether to restart the container. Readiness (`/health/ready`) checks all four dependencies: LLM client initialised, FAISS index loaded, BM25 index has documents, SQLite responds to a SELECT. If any fail, it returns 503 and Kubernetes removes the pod from load balancer rotation without restarting it. Confusing them is a common production mistake.

---

**Q13: How does the readiness score time-series work technically?**

Every `/update-progress` call appends a row to `readiness_history(user_id, role, score, ts)` — never updates in place. The `get_readiness_history()` query uses a subquery: inner query gets the last N rows by `ts DESC`, outer query flips to `ts ASC`. This gives the most-recent N entries in chart order (oldest-first, left-to-right) without a client-side sort.

---

**Q14: Why do you have both episodic memory and long-term user facts?**

Different granularities. Episodic memory stores session-level events — "explored Python Dev role, got 75% match, had 3 missing skills" — with 7-day TTL. Long-term facts store stable profile attributes — "initial skills from CV", "current training role" — with no expiry. Episodic memory injects conversation history into the LLM prompt ("last time you explored..."). Long-term facts inform agent behaviour without being injected every time.

---

**Q15: How did you mock LLM calls in tests without hitting the API?**

The correct target is the LangChain chain, not the LLM. Agent code builds chains as `ChatPromptTemplate.from_messages(...) | llm.bind(max_tokens=N)`. Mocking `llm.invoke()` doesn't work because the pipe operator creates a `RunnableSequence` whose `invoke()` is the chain's method, not the LLM's. The fix: patch `ChatPromptTemplate.from_messages` to return a mock whose `__or__` returns a chain mock whose `invoke()` returns a `MagicMock(content=json_string)`.

---

**Q16: How does role CRUD trigger a FAISS rebuild without restarting?**

After any admin create/update/delete role operation, the endpoint calls `asyncio.get_event_loop().create_task(_rebuild_indexes())`. `_rebuild_indexes()` fetches all roles from SQLite, calls `build_vector_store(embeddings, roles=roles)` — which rebuilds the FAISS index in memory and saves it to disk — then calls `init_bm25_from_roles(roles)` to rebuild the BM25 index. The HTTP response returns immediately. The new role is searchable via hybrid RAG within 2-3 seconds without any server restart.

---

**Q17: What would you change if this system needed to serve 100 concurrent HR managers?**

Four changes. (1) Replace SQLite with PostgreSQL — WAL mode handles multiple readers but only one writer; 100 concurrent users would hit write contention. (2) Move the semantic cache to Redis — the current in-memory cache doesn't survive multi-instance deployment. (3) Offload FAISS to a dedicated vector DB (Qdrant or Weaviate) — rebuilding FAISS in-process on role updates doesn't scale to large document sets. (4) Move plan generation to a task queue (Celery + Redis) — long-running LLM calls shouldn't hold HTTP connections open under load.

---

**Q18: How does your prompt versioning work?**

Each LLM operation has a version registry: `{"cv_parser": "v2", "role_mapper": "v2", "planner": "v1"}`. Prompts are stored in files under `prompts/`. The active version is loaded at startup from `prompts/loader.py`. The `/metrics` endpoint exposes `ACTIVE_VERSIONS` so you can see which prompt version is running in production at any time. Switching from v1 to v2 is a config change, not a code deploy. This follows the same pattern as model version pinning — never let your prompt drift silently.

---

**Q19: What does your GitHub Actions CI actually validate?**

Two parallel jobs. The backend job runs Python 3.9 + pip install + `pytest tests/ -v --tb=short`. It validates all 153 tests — guardrails, agents, DB CRUD, cache, memory, API endpoints, role CRUD, readiness history, observability. No API key needed, no Docker service, completes in <2 seconds. The frontend job runs Node 20 + `npm ci --legacy-peer-deps` + `ng build --configuration production`. It validates AOT compilation and TypeScript strict checking — a TypeScript error that passes dev mode can still fail production AOT.

---

**Q20: How is this project different from AstroIntel and when would you use each architecture?**

AstroIntel uses LangGraph — a stateful directed graph for multi-agent orchestration. It's the right pattern when you have multiple specialised agents that must all contribute to a single answer, with conditional routing, human-in-the-loop approval, and the ability to retry individual graph nodes. Bench Resource Optimizer uses a linear pipeline — CV parsing → RAG role mapping → plan generation → tracking. Each stage has a single clear purpose and chains deterministically. Linear pipelines are simpler, easier to debug, and sufficient when the workflow is sequential. I choose LangGraph when I need branching, parallel agent execution, or human approval gates. I choose a linear FastAPI pipeline when the workflow is a sequence of transformations with well-defined inputs and outputs.

---

## 7. Architecture Diagram (Text)

```
User (Angular 17)
    │
    ▼
[Rate Limit MW] → [Logging MW] → FastAPI Router
    │
    ├─ POST /upload-cv
    │       │ PDF validation + injection check
    │       │ CV Parser Agent (LangChain chain)
    │       │ G3 JSON repair → G4 PII filter → validate profile
    │       └─ SQLite: save_user()
    │
    ├─ POST /map-role
    │       │ G1 rate check → load user from SQLite
    │       │ Role Mapping Agent:
    │       │   HyDE → FAISS dense + BM25 sparse → RRF fusion
    │       │   Cross-encoder rerank → CRAG quality gate
    │       │   LLM mapping → faithfulness check → L1/L2 cache
    │       │ G4 PII filter → G5 degradation log
    │       │ write_session_summary() [fire-and-forget → SQLite]
    │       └─ _ragas_background() [fire-and-forget → SQLite]
    │
    ├─ POST /generate-plan  (or /generate-plan/stream SSE)
    │       │ Planning Agent → 7-day roadmap
    │       └─ SQLite: save_progress()
    │
    ├─ POST /update-progress
    │       │ Tracking Agent (pure Python) → readiness score
    │       └─ SQLite: save_readiness_score() [time-series]
    │
    ├─ GET /progress/{user_id}/history  → readiness time-series
    ├─ GET /memory/{user_id}            → episodic + facts
    ├─ GET /metrics                     → KPI dashboard
    ├─ GET /health/ready                → LLM + FAISS + BM25 + SQLite
    │
    └─ /admin/roles (POST/PUT/DELETE)
            │ create_role_db / update_role_db / delete_role_db
            └─ _rebuild_indexes() [fire-and-forget: FAISS + BM25 rebuild]

SQLite (WAL mode)
    ├─ users                (profile_json, resume_snippet)
    ├─ progress             (role, plan_json, completed_task_ids)
    ├─ readiness_history    (user_id, role, score, ts) [time-series]
    ├─ memory_sessions      (user_id, summary, ts, expires_at) [7-day TTL]
    ├─ roles                (CRUD + FAISS/BM25 rebuild on change)
    └─ ragas_results        (faithfulness, precision, recall, relevancy, MRR)
```

---

## 8. Senior AI Engineer Module Coverage Map

| Module | What bench-resource-optimizer demonstrates |
|--------|---------------------------------------------|
| M1 Evaluation | RAGAS (faithfulness, precision, recall, relevancy, MRR), LLM-as-judge, readiness score as time-series KPI |
| M2 LLM Core | Prompt versioning (v1/v2), injection detection, hardened system prompts, token tracking |
| M3 RAG | HyDE + FAISS + BM25 + RRF + cross-encoder rerank + CRAG quality gate |
| M4 Agents | CV Parser, Role Mapping, Planning (SSE streaming), Tracking (pure Python), retry + circuit breaker |
| M4 Memory | Write-through episodic + long-term facts, SQLite persistence, 7-day TTL sweep |
| M5 System Design | Semantic cache L1+L2, SSE streaming, latency budget per component, semantic cache hit rate KPI |
| M5 API Gateway | Rate limiting, health probes (liveness vs readiness), Cache-Control headers, OpenAPI response models |
| M6 MLOps | Async SQLite CRUD (PostgreSQL-ready), prompt versioning, role CRUD with live index rebuild, GitHub Actions CI/CD |
| M7 Real-Time | SSE streaming plan generation, async throughout, fire-and-forget background tasks |
| M9 Storytelling | This document |
