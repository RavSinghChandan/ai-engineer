# Senior AI Engineer — Complete Revision Guide
### All 14 Modules · All 5 Projects Per Topic · Read in 40–50 Minutes

---

> **How to use this:** Every topic now shows exactly what you implemented across all five projects.
> When an interviewer asks "How did you handle X?" — find the topic, pick the project, speak the line.

---

## YOUR 5 PROJECTS AT A GLANCE

| # | Project | Architecture | Tests | Key Differentiator |
|---|---------|-------------|-------|-------------------|
| 1 | **AstroIntel 360°** | LangGraph 18+ agents, RAG optional | 415 | Rule-based domain agents + LLM synthesis, 23 languages |
| 2 | **Bench Resource Optimizer** | Hybrid RAG (FAISS+BM25+RRF+HyDE+CRAG) | 502 | 5-layer RAG pipeline, semantic cache L1+L2, SSE streaming |
| 3 | **RunbookAI** | RAGless SQL + NetworkX DAG | 137 | Zero vectors, zero hallucination by design, 3-panel conflict detection |
| 4 | **Agentic Growth OS** | LangGraph 5-agent marketing pipeline | — | Auto-learning engine, ROI improves run-over-run 40–80% |
| 5 | **Universal Agent** | LangGraph ReAct, YAML-configured | 20 | Plug-and-play into any app, per-agent lock/unlock dashboard |

---

# MODULE 01 — AI Engineering Fundamentals

## AI vs ML vs LLM

- **AI** = any system that acts intelligently
- **ML** = learns patterns from data (fraud, churn, pricing)
- **LLM** = massive deep learning model trained on internet text — can reason, write, code

**Senior framing:** "I chose LLM over classical ML because our task involved unstructured language reasoning — not pattern prediction on tabular data."

**What each project chose and why:**

| Project | Choice | Why |
|---------|--------|-----|
| AstroIntel | Rule-based agents + LLM synthesis | Numerology/astrology math must be deterministic; only the narrative uses LLM |
| Bench | LLM + Hybrid RAG | Skill gap analysis requires language understanding across unstructured CVs |
| RunbookAI | LLM at ingest only, SQL at query | Commands must be verbatim — LLM only extracts once, SQL returns always |
| Agentic Growth OS | LLM inside each LangGraph node | Creative ad copy and budget reasoning require flexible language generation |
| Universal Agent | LLM with configurable persona | Domain is unknown at build time — YAML config defines behaviour at runtime |

**Interview line:** "Across my 5 projects I made different LLM vs rule-based decisions per component — RunbookAI uses LLM at ingest and SQL at query so commands are never hallucinated, while AstroIntel keeps arithmetic in pure Python and only calls the LLM to narrate the result."

---

## Hallucination — Root Cause and Fix

**Three root causes:**
1. Training data gap — model never learned this fact
2. Context gap — fact exists but was not retrieved
3. Reasoning error — two correct facts combined into a wrong conclusion

**Three-layer defence:**
1. RAG — ground every answer in retrieved documents
2. Faithfulness gate — post-generation check: "Is every claim supported by context?"
3. Confidence threshold — if retrieval score < 0.75, say "I don't know"

**What each project does:**

| Project | Hallucination strategy |
|---------|----------------------|
| **AstroIntel** | Faithfulness gate: `confidence in ("high","medium")` per insight. RAGAS metrics auto-computed at /run — not just /approve. Bugs fixed: RAGAS was 0.00 because evaluation only ran on /approve; faithfulness was always 33% because logic checked `domains >= 2` but each insight has 1 domain tag. |
| **Bench** | `run_llm_judge` post-generation faithfulness check. G2 injection guard on CV input before LLM sees it. CRAG quality scoring gates retrieval — LOW score triggers wider search, not LLM call. |
| **RunbookAI** | **Architectural hallucination elimination.** LLM extracts commands once at ingest and writes them to SQLite. At query time, SQL returns the exact stored string — `commands_source: "database"` on every response. No LLM in the query path = no hallucination possible. |
| **Agentic Growth OS** | Each agent node produces structured output (`CampaignState` TypedDict). Budget numbers come from the learning engine's stored history, not LLM imagination. |
| **Universal Agent** | Fallback message configured in YAML. If RAG is enabled, FAISS retrieval grounds answers. Lock mechanism prevents any LLM call when token protection is needed. |

**Interview line:** "RunbookAI proves that the best hallucination fix is architectural — remove the LLM from the query path entirely. Bench uses a faithfulness gate and CRAG quality scoring. AstroIntel taught me that RAGAS bugs are silent — you must measure on every run, not just on approval."

---

## Evaluation Metrics — What to Measure

| Metric | What it tells you | Target |
|--------|------------------|--------|
| Faithfulness | Answer grounded in context? | > 0.80 |
| Answer Relevancy | Addresses the question? | > 0.80 |
| TTFT | Time to first token | < 500ms |
| Cost per query | Money per LLM call | < $0.10 |
| Hallucination rate | % unsupported claims | < 5% |

**Per-project evaluation:**

- **AstroIntel:** RAGAS computed per /run. Four thresholds: faithfulness ≥ 0.80, answer_relevancy ≥ 0.70, context_precision ≥ 0.60, domain_recall ≥ 0.60. Rule-based pipeline so "context" = agent output, not retrieved chunks.
- **Bench:** `/ragas` endpoint — RAGAS runs async after every map-role call. 502 tests, 94.7% coverage, SonarQube Quality Gate PASSED.
- **RunbookAI:** Conflict detection as quality metric — `VALUE_CONFLICT`, `ORDER_CONFLICT`, `MISSING_STEP`, `EXTRA_STEP` scored per runbook pair. 137 tests.
- **Agentic Growth OS:** ROI improvement % across runs is the primary metric. Learning engine tracks CTR, conversion rate, ROI Score per run.
- **Universal Agent:** 20 tests, no API keys required. Health endpoint reports `locked`, `active_sessions`, `rag` state per agent.

---

## Token Economics — Cost, Latency, Throughput

| Model | Input / 1M | Output / 1M |
|-------|-----------|------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o-mini | $0.15 | $0.60 |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| DeepSeek Chat | $0.14 | $0.28 |

**Per-project token strategy:**

- **AstroIntel:** DeepSeek via OpenAI-compatible SDK. `_global_usage` dict protected by `threading.Lock` for cross-thread token accounting. DeepSeek HTTP timeout: 8s (fail fast, long enough for 250 tokens). Achieved **$0.000137 per analysis** — 500× cheaper than GPT-4o.
- **Bench:** Semantic cache L1 (exact SHA-256 hash, < 1ms) + L2 (cosine similarity ≥ 0.92) + Redis. Cache hit = zero LLM tokens spent. Token tracker logs per-agent usage to SQLite.
- **RunbookAI:** LLM called only at PDF ingest — zero LLM tokens at query time. Most cost-efficient architecture in the portfolio.
- **Agentic Growth OS:** Each of 5 LangGraph nodes calls LLM once per run. Learning engine reuses past campaign data — reduces redundant LLM calls on similar campaigns.
- **Universal Agent:** `/agent/lock` endpoint blocks all LLM calls instantly — zero tokens spent while locked. Per-agent granular lock via `/agents/{id}/lock`. Dashboard shows active sessions in real time.

---

# MODULE 02 — LLM Core

## Context Window — The Model's Working Memory

Context window = total tokens the model can see at once (prompt + history + response).

**Strategies when context is too large:**
1. Summarise conversation history (keep last N turns, summarise the rest)
2. Retrieve only relevant chunks (RAG — don't dump the whole document)
3. Use a model with a larger context window (128k, 1M)
4. Split tasks across multiple LLM calls

**Per-project context management:**

- **AstroIntel:** Each domain agent has its own focused system prompt. LangGraph passes `CampaignState` between nodes — only relevant state fields are included per node, not the full report. Episodic memory injects a summarised user history as context prefix.
- **Bench:** `build_memory_context()` injects episodic memory (past sessions, explored roles, readiness score) into every prompt. Context is structured: `system + memory_context + user_message`.
- **RunbookAI:** No RAG context — SQL returns structured step objects directly. LLM at ingest gets a focused extraction prompt, not the full PDF dump. Chunked extraction for large PDFs.
- **Agentic Growth OS:** `CampaignState` TypedDict acts as a shared context object — each agent reads only its needed fields. Learning engine adds a compact "past campaign summary" to the prompt for similar campaigns.
- **Universal Agent:** `max_history: 20` in config, TTL-based session expiry. Extra facts from YAML injected as system context. RAG knowledge base optional — retrieves top-k chunks when enabled.

---

## Embeddings — Turning Text into Meaning

Embeddings = dense vector representations. Similar meaning → similar vectors → close in vector space.

**Per-project usage:**

- **AstroIntel:** HuggingFace `all-MiniLM-L6-v2` for local embedding (no API cost) on spiritual domain knowledge.
- **Bench:** `all-MiniLM-L6-v2` local embeddings for FAISS index. L2 semantic cache uses cosine similarity ≥ 0.92 on query embeddings — similar role queries share cached results.
- **RunbookAI:** **No embeddings at query time.** LLM extracts step embeddings once at ingest and stores as structured text. Query matching via SQL keyword search + title overlap ≥ 40% threshold.
- **Agentic Growth OS:** Campaign similarity matching in the learning engine uses string-based cosine similarity on campaign descriptions — no vector store needed at this scale.
- **Universal Agent:** Optional FAISS knowledge base. When disabled (default), the agent relies entirely on LLM knowledge + YAML-injected facts.

---

## Prompt Engineering at Scale

**Key techniques:**
- **Few-shot:** Give 2–3 examples in the prompt → massive quality improvement
- **Chain of Thought:** "Think step by step" → forces reasoning before answer
- **Structured output:** "Respond only in JSON with keys: X, Y, Z" → parseable output
- **System prompt versioning:** Store prompts as versioned files, not hardcoded strings
- **Role injection:** "You are a senior DevOps engineer..." → persona priming

**Per-project prompt engineering:**

- **AstroIntel:** 18+ domain-specific system prompts. Language-aware templates for 23 Indian languages. Prompt style selector: Warm & Exploratory vs Laser Sharp — same question, completely different tone.
- **Bench:** Prompt versioning (`prompts/loader.py`, v1/v2 per operation). `role_mapper@v2` tag visible in responses. Injection detection runs on CV text before any prompt is constructed.
- **RunbookAI:** Extraction prompt forces strict JSON: `{steps: [{command, description, depends_on}]}`. No natural language in extraction response — structured output only.
- **Agentic Growth OS:** Each of 5 agents has a focused role prompt. Ad Copy Agent prompt adapts based on `learning_strategy` field from previous runs — prompt changes based on what worked.
- **Universal Agent:** Entire persona defined in `agent.config.yaml`. Change one YAML field, change the agent's behaviour — no code change. Five pre-built configs ship with the project.

---

## Vector Databases — Where Embeddings Are Stored

| Database | Best For | Notes |
|----------|---------|-------|
| FAISS | Local, fast, no server | In-memory, exact or approximate search |
| Pinecone | Managed cloud, production scale | Paid |
| pgvector | Already using PostgreSQL | SQL + vectors in one place |
| Weaviate | GraphQL + vectors | Good for hybrid search |
| Redis | Cache + vector search | Low latency |

**Per-project vector store decision:**

- **AstroIntel:** FAISS pre-warmed at startup for spiritual domain knowledge. Background warm-up so first request is fast.
- **Bench:** FAISS for dense retrieval + BM25 for sparse. Both rebuilt async after admin uploads new role knowledge. FAISS + BM25 + RRF = hybrid retrieval. Zero external vector DB dependency.
- **RunbookAI:** No vector store. Deliberate design decision — "zero vectors, zero hallucinated commands." SQL is the retrieval layer.
- **Agentic Growth OS:** No vector store. Campaign memory stored as JSON with string similarity matching.
- **Universal Agent:** Optional FAISS. Configured via `knowledge_base.enabled: true/false` in YAML. Source dir points to local PDF/Markdown files.

---

## LLM Security — Three Threats, Three Fixes

| Threat | What it is | Fix |
|--------|-----------|-----|
| Prompt injection | User input hijacks system instructions | Detect and sanitise input before it reaches the prompt |
| Jailbreak | User coaxes model to ignore safety rules | System prompt hardening + output filter |
| Data leakage | Model outputs private data from training or context | PII filter on all outputs |

**Per-project security:**

- **AstroIntel:** X-API-Key dual auth + JWT Bearer. 76 auth tests. Input sanitisation on all /run inputs.
- **Bench:** G2 injection detection — scans CV text AND role names before any LLM call. G4 PII filter strips email/phone from all LLM outputs. Security headers middleware: HSTS, CSP, X-Frame DENY, nosniff. SonarQube: 0 vulnerabilities, 0 security hotspots.
- **RunbookAI:** JWT RBAC (admin/user/viewer). NetworkX validates step ordering — no way to inject a "run this command first" via natural language input. SQL parameterised queries — no injection possible.
- **Agentic Growth OS:** JWT auth on all API endpoints. LangGraph state is immutable between nodes — each agent writes to its own output field, cannot overwrite another agent's output.
- **Universal Agent:** CORS origins allowlist per config. Lock/unlock API — no auth on lock endpoint by design (operator tool), but chat endpoint blocks when locked. Per-agent isolation — locking one agent doesn't affect others.

---

# MODULE 03 — RAG Systems

## The RAG Pipeline — How It Works

```
User query
  → Embed query
  → Search vector store (cosine similarity)
  → Retrieve top-k chunks
  → Build prompt: system + retrieved context + user question
  → LLM generates answer grounded in context
  → Return answer
```

**Per-project RAG architecture:**

- **AstroIntel:** RAG used for knowledge enrichment on domain queries. FAISS pre-warmed at startup. Context injected per domain agent.
- **Bench:** Full 5-layer hybrid RAG: `query → BM25 + FAISS → RRF fusion → HyDE expansion → CRAG quality gate → cross-encoder reranker → LLM`. Top-20 after fusion, top-5 after reranker.
- **RunbookAI:** **RAGless.** The "retrieval" is SQL: `SELECT steps FROM runbooks WHERE category=? AND severity=?`. Deterministic, no embedding needed.
- **Agentic Growth OS:** No RAG. Campaign memory retrieval via similarity score on campaign_type + keywords.
- **Universal Agent:** Optional RAG via FAISS knowledge base. Toggle with `knowledge_base.enabled: true`.

---

## Chunking — How to Split Documents

| Strategy | When to use |
|----------|------------|
| Fixed-size (512 tokens, 50 overlap) | General documents, fast setup |
| Sentence-based | QA systems, need complete sentences |
| Recursive character | LangChain default, good all-rounder |
| Semantic | Split on meaning change, best quality, slow |
| Document-structure-aware | PDFs with headers, preserve hierarchy |

**Per-project chunking:**

- **AstroIntel:** Structured domain knowledge (not PDFs) — chunked by domain category.
- **Bench:** Role knowledge from `roles_knowledge.json` chunked at startup. Admin can upload internal training docs — chunked via PDF text extraction → fixed-size with overlap.
- **RunbookAI:** **No chunking.** LLM extracts a structured JSON of steps at ingest — the "chunk" is a single step object with `{command, description, depends_on}`. Steps are the atomic unit.
- **Agentic Growth OS:** No chunking needed.
- **Universal Agent:** `chunk_size: 500, chunk_overlap: 50` configurable in YAML. Recursive character splitting via LangChain.

---

## Retrieval Optimization — Getting Better Results

| Technique | What it does |
|-----------|-------------|
| Hybrid (BM25 + dense) | BM25 catches exact keyword matches dense misses |
| RRF fusion | Merges BM25 and FAISS rankings without score normalisation |
| HyDE | Generate a hypothetical answer, embed it, use that for retrieval |
| Cross-encoder reranker | Expensive but precise — re-scores top-20 to find true top-5 |
| MMR | Maximises diversity — avoids returning 5 near-identical chunks |

**Per-project retrieval:**

- **AstroIntel:** Single-source FAISS retrieval. Multi-query expansion for ambiguous spiritual terms.
- **Bench:** Full hybrid stack — **BM25 catches exact skill names** (e.g. "Kubernetes") that dense vectors miss. RRF merges without needing score normalisation. HyDE generates a hypothetical role description for novel roles with no close match in the index. Cross-encoder reranker as final precision layer. Recall improvement: FAISS alone 60% → +BM25+RRF 78% → +HyDE 83% → +reranker: best precision.
- **RunbookAI:** SQL match by `category`, `severity`, `source_type`. Title overlap ≥ 40% for P3 combined panel. NetworkX topological sort for step ordering.
- **Agentic Growth OS:** No retrieval optimisation needed.
- **Universal Agent:** When RAG enabled: FAISS top-k with configurable k. No hybrid retrieval in base config.

---

## Advanced RAG Patterns (Senior-Only)

| Pattern | What it solves |
|---------|---------------|
| CRAG (Corrective RAG) | Low-quality retrieval triggers a fallback (wider search or web) |
| Self-RAG | LLM decides whether to retrieve at all |
| HyDE | Better query for novel topics — embed hypothetical answer, not raw question |
| Re-ranking | Cross-encoder rescores top-N — much more accurate than bi-encoder alone |
| RAGless | Remove vectors entirely — LLM extracts once, SQL serves always |

**Per-project advanced RAG:**

- **AstroIntel:** CRAG-equivalent: if domain agent confidence < threshold, escalate to a broader multi-domain query.
- **Bench:** CRAG quality scoring after retrieval — LOW score triggers wider BM25 search before calling LLM. HyDE in the retrieval path. Cross-encoder reranker (sentence-transformers) on top-20.
- **RunbookAI:** **Invented a 6th pattern: RAGless.** "The best retrieval is no retrieval — extract structure once at ingest, return it verbatim at query time." This is the correct architecture when commands must be exact.
- **Agentic Growth OS:** N/A.
- **Universal Agent:** CRAG available when knowledge base enabled. Self-RAG implicit — agent decides whether to use the retrieved context based on relevance score.

---

## RAG Evaluation — RAGAS Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| Faithfulness | supported claims / total claims | Is every claim in the answer backed by context? |
| Answer Relevancy | embedding similarity of question vs answer | Does the answer address the question? |
| Context Precision | relevant retrieved / total retrieved | Were the retrieved chunks actually useful? |
| Context Recall | covered ground truths / total ground truths | Did retrieval find all necessary info? |

**Per-project RAGAS:**

- **AstroIntel:** RAGAS adapted for rule-based pipeline. Key bugs fixed in production: (1) evaluation only ran on /approve — fixed to run on every /run. (2) Faithfulness always 33% because `domains >= 2` check was wrong for single-domain sessions — fixed to `confidence in ("high","medium")`. (3) domain_recall 47% because only admin-selected IDs passed to evaluator — fixed to pass all insight IDs.
- **Bench:** `/ragas` endpoint. RAGAS runs async after each map-role call. Four metrics tracked: faithfulness, answer_relevancy, context_precision, context_recall. Stored in SQLite `ragas` table.
- **RunbookAI:** Custom evaluation — conflict detection score replaces faithfulness. Match quality = overlap between P1 internal and P3 combined panels.
- **Agentic Growth OS:** No RAGAS — ROI improvement % and CTR delta are the metrics.
- **Universal Agent:** RAGAS can be enabled when knowledge base is active. Health endpoint reports RAG state.

---

# MODULE 04 — Agentic AI Systems

## Agent vs Workflow — When to Use Which

**Workflow:** Fixed sequence of steps. Same path every time. Use when the process is known.
**Agent:** LLM decides what to do next. Use when the path depends on the input.

**Per-project decision:**

| Project | Choice | Reason |
|---------|--------|--------|
| AstroIntel | **Workflow inside agents** | Each domain (numerology, astrology, tarot) runs in parallel but each domain agent follows a fixed internal flow |
| Bench | **Workflow** | CV parse → role map → plan generate → progress track. Fixed sequence. |
| RunbookAI | **Workflow** | Query → SQL → sort → conflict check. Fixed path. |
| Agentic Growth OS | **Agent pipeline** | LangGraph StateGraph with conditional edges — learning engine can skip or repeat nodes |
| Universal Agent | **ReAct agent** | User's query determines whether to use calculator tool, datetime tool, or just answer |

---

## Planning vs Execution Patterns

| Pattern | How it works |
|---------|-------------|
| ReAct | Reason + Act loop — model thinks, picks a tool, observes result, repeats |
| Plan-Execute | LLM creates a full plan first, then executes steps sequentially |
| Tree of Thought | Explore multiple reasoning branches, pick the best |

**Per-project:**

- **AstroIntel:** Parallel domain agents (ReAct-like reasoning per domain) + supervisor node that synthesises all domain outputs.
- **Bench:** Sequential plan-execute: CV parser → role mapper → planner → tracker. Each agent has a defined input/output contract.
- **RunbookAI:** No planning layer — SQL executes deterministically. NetworkX computes the execution order.
- **Agentic Growth OS:** LangGraph StateGraph. Nodes: Audience → AdCopy → BudgetOptimizer → Campaign → PerformanceAnalyzer. Edges are conditional — learning engine can modify the path on subsequent runs.
- **Universal Agent:** LangGraph ReAct loop. Tool binding: `calculator`, `get_current_datetime`. Model decides whether to call a tool or answer directly.

---

## Multi-Agent Orchestration

**Patterns:**
1. **Supervisor** — one orchestrator LLM routes tasks to specialist sub-agents
2. **Peer-to-Peer** — agents communicate directly, no central controller
3. **Hierarchical** — supervisors have sub-supervisors

**Per-project orchestration:**

- **AstroIntel:** LangGraph StateGraph with 18+ nodes. Supervisor node synthesises multi-domain outputs. Parallel domain agents run concurrently (ThreadPoolExecutor). Conditional edges based on selected analysis modules.
- **Bench:** Sequential pipeline — `cv_parser` → `role_mapper` → `planner` → `tracker`. No cross-agent communication needed — each receives clean output from the previous.
- **RunbookAI:** No multi-agent. Single LLM at ingest. SQL handles all query-time logic.
- **Agentic Growth OS:** 5-agent LangGraph pipeline. Pure functions per node — each agent reads `CampaignState`, writes to its own output field, immutable side effects. Learning engine is a separate module that modifies the StateGraph inputs for the next run.
- **Universal Agent:** Single ReAct agent per instance. Registry allows 5 independent agents to be monitored and controlled via one dashboard.

---

## Agent Memory — Four Types

| Type | What it stores | Lifetime |
|------|---------------|---------|
| In-context | Current conversation | One session |
| Episodic | Past sessions, what user explored | Persistent, TTL-based |
| Semantic | Facts about the user | Persistent |
| Procedural | How the agent behaves | Baked into the prompt |

**Per-project memory:**

- **AstroIntel:** Episodic memory via `/api/v1/feedback` router. Persona preferences stored in SQLite. Past readings injected as context prefix. Memory persists across server restarts.
- **Bench:** `session_store.py` — episodic memory (past sessions, explored roles, readiness score). Long-term facts. Context injection via `build_memory_context()`. Write-through to SQLite WAL — survives restarts. `memory/{user_id}` endpoint.
- **RunbookAI:** No explicit memory. Runbooks in SQLite serve as the "long-term memory" — steps are stored once at ingest and retrieved forever.
- **Agentic Growth OS:** `CampaignState` is in-context memory per run. Campaign memory store (JSON) is episodic — similar past campaigns are retrieved and applied. Memory persists between runs.
- **Universal Agent:** In-process `MemoryStore` with TTL-based expiry. `max_history: 20` turns configurable in YAML. `session_id` per user. Sessions expire after `session_ttl_seconds`.

---

## Failure Handling and Guardrails

**Five guardrails to know (Bench G1–G5):**

| Guardrail | What it does |
|-----------|-------------|
| G1 — Rate Limiter | 60 req/min/user → 429 if exceeded |
| G2 — Injection Check | Scans CV text + role names before any LLM call |
| G3 — JSON Repair | Cascade: direct → fence → regex → LLM repair |
| G4 — PII Filter | Strips email/phone from all LLM outputs |
| G5 — Graceful Degrade | Tracks full/partial/fallback/failed per agent |

**Per-project failure handling:**

- **AstroIntel:** Circuit breaker on DeepSeek client — opens after threshold failures, falls back to cached/partial response. SUPERADMIN-only `/reset-breaker` endpoint. Retry logic with exponential backoff on all LLM calls.
- **Bench:** Full G1–G5 guardrails. Circuit breaker: 5 failures → opens → 30s reset → graceful fallback message. SSE streaming: if LLM call fails mid-stream, `[DONE]` is still sent so frontend doesn't hang.
- **RunbookAI:** Rate limiting middleware. JWT RBAC — 403 for unauthorised runbook access. Conflict detection as a data quality guardrail — flags dangerous disagreements between runbooks before the engineer acts.
- **Agentic Growth OS:** Each LangGraph node has error handling — if an agent fails, the campaign state records the failure and the run continues with partial results. Learning engine skips failed runs.
- **Universal Agent:** Global lock — one API call blocks all 5 agents instantly. Per-agent lock for surgical control. Lock state persists for the server process lifetime. Locked agent returns a clear message instead of throwing an error.

---

## Tool Usage and Function Calling

Tools give agents the ability to act: search the web, run code, call APIs, query databases.

**How it works:** LLM decides to call a tool → returns structured JSON `{tool_name, arguments}` → your code executes the tool → result is added back to conversation → LLM continues.

**Per-project tool usage:**

- **AstroIntel:** Custom tools per domain agent — numerology calculator, astrology chart generator, tarot card selector. Tools are deterministic Python functions, not LLM-based.
- **Bench:** `upload-cv` (PDF → profile), `map-role` (profile → gap analysis), `generate-plan` (gaps → 7-day roadmap), `update-progress` (tick tasks). Each is a FastAPI endpoint + agent function.
- **RunbookAI:** SQL query tool (deterministic). `conflict_detector.py` as a post-processing tool. NetworkX topological sort as an ordering tool.
- **Agentic Growth OS:** Each LangGraph node IS a tool — pure function with defined inputs/outputs. Learning engine is a tool that modifies agent prompts for the next run.
- **Universal Agent:** `calculator` tool (safe math), `get_current_datetime` (always correct time). Custom tool registration via `tools/my_tools.py` — add a `@tool` decorated function, register it in config.

---

# MODULE 05 — AI System Design

## API Gateway for AI Services

Every AI service needs: rate limiting, auth, retry, caching, monitoring.

**Per-project API gateway:**

- **AstroIntel:** FastAPI with custom middleware stack. `/api/v1/` prefix. JWT + X-API-Key dual auth. Rate limiting per IP. Redis for job queue + response cache.
- **Bench:** FastAPI with middleware chain: SecurityHeaders → RateLimit(G1) → RequestLogging → JWT Auth → InjectionCheck → RouteHandler. Every request passes all 5 layers.
- **RunbookAI:** FastAPI. JWT RBAC middleware. Rate limiting on /query endpoint. Swagger docs at /docs with full endpoint documentation.
- **Agentic Growth OS:** FastAPI backend. CORS configured for Angular frontend. Campaign execution is async — returns job_id immediately, client polls for result.
- **Universal Agent:** FastAPI with CORS per-config. `/agents` registry endpoint serves as a meta-gateway across all 5 agents. Lock endpoint as an emergency kill switch.

---

## RAG at Scale — Latency Budget

**Target latency budget:**
- TTFT (Time to First Token): < 500ms
- Total response: < 5s for standard query
- Cached response: < 1ms

**Per-project latency:**

- **AstroIntel:** Parallel domain agents reduce total latency — 5 agents running concurrently is faster than 5 agents sequentially. DeepSeek timeout: 8s. SSE streaming so users see output within 1–2s.
- **Bench:** L1 cache (exact match): < 1ms. L2 cache (semantic): ~5ms. Full pipeline: ~3s. SSE streaming plan generation: TTFT < 1.5s. FAISS index rebuild is async — zero downtime on role updates.
- **RunbookAI:** SQL query: < 50ms. NetworkX topological sort: < 10ms. No LLM in query path. Total response: < 100ms for any incident query.
- **Agentic Growth OS:** LangGraph pipeline runs all 5 agents sequentially — ~3–5s per full execution. Dashboard updates via polling every 2s during execution.
- **Universal Agent:** Chat response: ~1–3s (DeepSeek). Cached with Redis optionally. Lock check adds < 1ms to every request.

---

## Streaming — SSE vs WebSocket

| | SSE | WebSocket |
|---|---|---|
| Direction | Server → Client only | Bidirectional |
| Protocol | HTTP | WS |
| Reconnect | Auto (browser) | Manual |
| Best for | Token streaming, live updates | Chat with user-to-user, real-time games |

**Per-project streaming:**

- **AstroIntel:** `/api/v1/stream/{session_id}` — SSE endpoint. Angular `EventSource` subscribes. Tokens streamed as `data: {"type": "token", "token": "..."}`.
- **Bench:** `/generate-plan/stream` — SSE plan generation. Tokens streamed live, readiness score updates as tasks complete. `EventSource` in Angular frontend.
- **RunbookAI:** No streaming — SQL responses are instant, no need for SSE.
- **Agentic Growth OS:** Polling for campaign execution status — not SSE. Each agent node emits progress events stored in campaign state, frontend polls every 2s.
- **Universal Agent:** `/agent/stream` SSE endpoint. Format: `session → token → token → done → [DONE]`. Locked agent returns a single locked-message token then closes.

---

## Cost Optimization — The Five Levers

1. **Cache** — never pay twice for the same query (Bench: L1+L2+Redis)
2. **Smaller model** — use GPT-4o-mini or DeepSeek for < 10-token tasks
3. **Prompt compression** — shorter prompts = fewer input tokens
4. **Batch** — group multiple small requests into one API call
5. **Lock** — prevent any LLM call when not needed (Universal Agent)

**Per-project cost wins:**

- **AstroIntel:** DeepSeek = 500× cheaper than GPT-4o. $0.000137 per full 360° analysis.
- **Bench:** Semantic cache means similar role queries (e.g. "ML Engineer" vs "ML Software Engineer") share the same cached response. Estimated 60–70% cache hit rate after warm-up.
- **RunbookAI:** Zero LLM cost at query time. Most cost-efficient query architecture in portfolio.
- **Agentic Growth OS:** Learning engine reuses past campaign decisions — fewer novel LLM calls on repeat campaign types.
- **Universal Agent:** Per-agent lock via `/agents/{id}/lock`. Lock All button kills all 5 agents instantly. Estimated savings: 100% of token cost during lock period.

---

## Chat with PDF — Production Design

**Architecture:**
1. Upload PDF → extract text (PyPDF2 or pdfminer)
2. Chunk text (512 tokens, 50 overlap)
3. Embed chunks (HuggingFace local or OpenAI)
4. Store in vector database (FAISS / pgvector)
5. User asks question → embed query → retrieve top-5 → LLM answers

**Per-project PDF handling:**

- **AstroIntel:** No PDF ingestion in main flow. Spiritual readings are form-based inputs, not document-based.
- **Bench:** **CV as PDF.** `utils/file_parser.py` extracts text. G2 injection guard runs on raw text before any parsing. Extracted profile stored in SQLite. Admin can upload internal training documents (PDF) — chunked and embedded into FAISS for the role knowledge base.
- **RunbookAI:** **Runbook as PDF.** LLM extracts structured JSON from PDF at ingest. No chunking — one extraction call per runbook. Result stored as rows in `runbook_steps` table. `commands_source: "database"` forever after.
- **Agentic Growth OS:** No PDF handling.
- **Universal Agent:** PDF supported as knowledge base source. `source_dir` in config points to folder of PDFs/Markdown files. Chunked and embedded at startup.

---

# MODULE 06 — MLOps for LLMs

## Versioning — Everything Must Be Pinned

What to pin:
- Model name and version (`deepseek-chat`, not just `deepseek`)
- Prompt version (`cv_parser@v2`, `role_mapper@v2`)
- Embedding model (`all-MiniLM-L6-v2`)
- Dependencies (`requirements.txt` pinned)

**Per-project versioning:**

- **AstroIntel:** `deepseek-chat` pinned in config. Domain agent prompts versioned in `prompts/` directory.
- **Bench:** Explicit prompt versioning (`prompts/loader.py`). Model pinned in config. `cv_parser@v2` and `role_mapper@v2` tags visible in API responses so you know which version generated each output.
- **RunbookAI:** SQL schema versioned in migrations. `source_type` column distinguishes internal vs official runbooks. Phase number (v1.0.0 Phase 6) tracked in health endpoint.
- **Agentic Growth OS:** `CampaignState` TypedDict is the contract — adding fields is backwards compatible, removing is a breaking change.
- **Universal Agent:** Config file is the version — changing `universal.config.yaml` changes behaviour. SDK versioned as `universal-agent.js`. Agent IDs in registry are stable identifiers.

---

## Monitoring — What to Watch in Production

| Signal | What it tells you |
|--------|------------------|
| TTFT p99 | Are 1% of users waiting too long? |
| Cache hit rate | Is your caching working? |
| Error rate | Are LLM calls failing? |
| Token usage / cost | Are you burning budget? |
| Guardrail triggers | Are users trying to abuse the system? |

**Per-project monitoring:**

- **AstroIntel:** `/api/v1/metrics` — live metrics dashboard. Token usage per domain agent. Cache hit rates. Circuit breaker state. Correlation IDs on every request.
- **Bench:** `/metrics` — request latency, cache hit rates (L1/L2 separate), guardrail trigger counts (G1–G5), circuit breaker state, SSE streaming TTFT. RAGAS scores stored per query.
- **RunbookAI:** `/health` — service version, phase, database status. Conflict detection counts per runbook pair. Query response times in logs.
- **Agentic Growth OS:** Campaign Dashboard — ROI per run, CTR trend, learning badge per improved run. Run history with timestamps.
- **Universal Agent:** `/agent/health` — locked state, active sessions, tools, RAG state. `/agents` — all 5 agents with live health probed in parallel every 15s. Agent Dashboard UI at `/agents-dashboard`.

---

## Model Serving — FastAPI, BentoML, vLLM

**Calling OpenAI/Anthropic (most common):** FastAPI async endpoint → async SDK call → SSE streaming response. All 5 projects use this pattern.

**Self-hosting with vLLM:** OpenAI-compatible API, continuous batching. Best for high-volume or fine-tuned models.

**Per-project serving:**

- **AstroIntel:** FastAPI + DeepSeek SDK. Custom `deepseek_client.py` handles retries, timeout, cross-thread token accounting via `threading.Lock`.
- **Bench:** FastAPI async + DeepSeek OpenAI-compatible SDK. `--reload` in dev, production config via env vars.
- **RunbookAI:** FastAPI. LLM serving only at ingest time — query serving is pure SQL, no model required at runtime.
- **Agentic Growth OS:** FastAPI + LangGraph. Each agent node calls DeepSeek synchronously within the LangGraph execution thread.
- **Universal Agent:** FastAPI via `uvicorn api.main:app`. Provider-agnostic — swap DeepSeek to Claude to GPT-4 by changing one line in YAML. No code change required.

---

## Feedback Loops — Making the System Better Over Time

**RLHF-lite (practical):**
1. Thumbs up/down on every AI response
2. Store: `{query, context, response, rating, timestamp}`
3. Weekly: review low-rated responses, find patterns
4. Monthly: update few-shot examples with highest-rated responses

**Per-project feedback:**

- **AstroIntel:** Admin Review workspace — Approve All / Flag for Review / Generate Report. Episodic corrections stored in SQLite. Approved insights feed back into future system prompts.
- **Bench:** `update-progress` endpoint — task completion acts as implicit feedback. Readiness score updates live. RAGAS scores per query feed into prompt improvement cycle.
- **RunbookAI:** Conflict detection is its own feedback loop — when internal and official runbooks conflict, an engineer must resolve it, and the resolution updates the runbook.
- **Agentic Growth OS:** **Explicit learning loop.** Every campaign run stores result. Next run for similar campaigns applies rule-based improvements. ROI delta is measured and displayed. The system gets measurably better over time.
- **Universal Agent:** Session history as implicit feedback. `max_history: 20` keeps conversation context so follow-up questions improve in quality.

---

# MODULE 07 — Real-Time AI Systems

## Async Processing — Queue, Retry, Dead Letter

**Pattern:** Producer (API) → Queue (Kafka/Redis) → Worker (LLM call) → Result store → Consumer (polling/webhook)

**Use when:** LLM calls > 5s, need retry, want to decouple frontend from backend latency.

**Per-project async:**

- **AstroIntel:** Kafka producer for async analysis jobs. `pipeline_queue/producer.py`. Dead letter queue for failed jobs. Redis for job state tracking.
- **Bench:** Kafka topics: `bench.cv.uploaded`, `bench.plan.requested`, `bench.dlq`. Events published after each major operation. Consumers are separate workers that handle background tasks.
- **RunbookAI:** Synchronous — SQL is so fast (< 100ms) that async is unnecessary.
- **Agentic Growth OS:** LangGraph execution is synchronous but non-blocking — returns job_id on campaign launch, frontend polls.
- **Universal Agent:** Synchronous per-request. No queue needed — response time < 3s.

---

## Event-Driven Pipelines — Kafka + LLM Workers

**AstroIntel:** Kafka producer publishes `analysis_requested` events. Worker pool picks them up. Redis tracks job state per session_id. LLM calls happen in the worker, not the API request thread.

**Bench:** Three Kafka topics form a complete event pipeline:
1. `bench.cv.uploaded` — triggers async background indexing
2. `bench.plan.requested` — triggers async plan generation
3. `bench.dlq` — dead letter queue, all failed events land here for retry/inspection

**Interview line:** "I used Kafka for decoupling the API from the LLM processing latency. The API returns immediately with a 202 Accepted, the Kafka worker picks up the event, calls DeepSeek, and writes the result to the database. The frontend polls until the result is ready."

---

## Token Streaming — SSE in Production

**Implementation (FastAPI):**
```python
async def event_generator():
    yield f"data: {json.dumps({'type': 'session', 'session_id': sid})}\n\n"
    async for chunk in llm.astream(prompt):
        yield f"data: {json.dumps({'type': 'token', 'token': chunk.content})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"
    yield "data: [DONE]\n\n"
```

**Angular client:**
```typescript
const source = new EventSource('/generate-plan/stream');
source.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.type === 'token') appendToUI(d.token);
  if (d.type === 'done')  source.close();
};
```

**Per-project SSE:**
- **AstroIntel:** SSE for report streaming — users see insights appear as agents complete
- **Bench:** SSE for plan generation — each task line appears as it's generated. TTFT < 1.5s
- **Universal Agent:** SSE endpoint with locked-agent short-circuit — sends locked message and closes without LLM call

---

# MODULE 08 — Frameworks and Tools

## Vector Store Decision (Know This Cold)

| Need | Use |
|------|-----|
| Local, no infra, fast prototype | FAISS |
| Already on PostgreSQL | pgvector |
| Managed cloud, production scale | Pinecone |
| Hybrid search + metadata filtering | Weaviate |
| No vectors needed | RunbookAI approach — SQL |

**Bench uses FAISS** — no external dependency, rebuilt async after role updates, paired with BM25 for hybrid retrieval.

---

## LangChain — When to Use, When to Escape

**Use LangChain for:** Document loaders, text splitters, LCEL chains, standard RAG pipelines.

**Escape LangChain when:** You need custom control flow, the abstraction hides important decisions, or you're building a multi-agent system (use LangGraph instead).

**Per-project LangChain usage:**
- **AstroIntel:** LangGraph (built on LangChain) for the agent graph. LangChain document loaders for PDF ingestion.
- **Bench:** LangChain for embedding (`HuggingFaceEmbeddings`), FAISS integration. Direct DeepSeek SDK for LLM calls — escaped LangChain's LLM abstraction for better control.
- **RunbookAI:** No LangChain — SQL and NetworkX replace the entire retrieval layer.
- **Agentic Growth OS:** LangGraph for the 5-agent StateGraph. LangChain tools for individual agent actions.
- **Universal Agent:** LangGraph ReAct agent loop. LangChain `@tool` decorator for custom tools.

---

## LangGraph — State Machines for Agents

**Core concept:** Nodes = functions. Edges = transitions. State = shared dict that flows through all nodes.

```python
from langgraph.graph import StateGraph
graph = StateGraph(MyState)
graph.add_node("agent_1", agent_1_function)
graph.add_node("agent_2", agent_2_function)
graph.add_edge("agent_1", "agent_2")
graph.add_conditional_edges("agent_2", router_function, {"path_a": "node_x", "path_b": "node_y"})
```

**Per-project LangGraph:**

- **AstroIntel:** 18+ nodes. Parallel domain agents (Astrology, Numerology, Palmistry, Tarot, Vastu). Supervisor node at the end. Conditional edges based on which analysis modules the user selected.
- **Bench:** Not LangGraph — sequential pipeline. FastAPI orchestrates the 4 agents directly. LangGraph would add overhead for a linear flow.
- **RunbookAI:** Not LangGraph — SQL handles all routing. NetworkX DiGraph for step ordering.
- **Agentic Growth OS:** 5-node LangGraph StateGraph: Audience → AdCopy → BudgetOptimizer → Campaign → PerformanceAnalyzer. Pure functions per node. `CampaignState` as the shared state TypedDict.
- **Universal Agent:** LangGraph ReAct loop. Single agent with tool-calling capability. `agent.py` implements the think → act → observe cycle.

---

## OpenAI API — Retry, Rate Limits, Fallback

**Production pattern:**
```python
from tenacity import retry, stop_after_attempt, wait_exponential
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=0.5, max=4))
async def call_llm(prompt):
    return await client.chat.completions.create(...)
```

**Circuit breaker (Bench):** 5 failures in 60s → opens → returns fallback message → resets after 30s.

**Per-project retry strategy:**
- **AstroIntel:** Retry + circuit breaker on DeepSeek client. SUPERADMIN `/reset-breaker` endpoint.
- **Bench:** 3-retry with exponential backoff (0.5s → 1.0s → 2.0s). Circuit breaker opens at 5 failures. Graceful fallback message returned to user.
- **RunbookAI:** Retry on PDF ingest LLM call only. No retry needed at query time (SQL).
- **Agentic Growth OS:** Retry per LangGraph node. Failed node records error in CampaignState but pipeline continues.
- **Universal Agent:** Retry via LangGraph's built-in error handling. `fallback_message` configured in YAML for all failure cases.

---

# MODULE 09 — Projects and Storytelling

## AstroIntel 360° — What to Say

**One sentence:** "18+ LangGraph agents coordinate in parallel to generate personalised 360° spiritual intelligence reports in 23 Indian languages, costing $0.000137 per analysis — 500× cheaper than GPT-4o."

**Three technical proof points:**
1. Parallel domain agents (ThreadPoolExecutor) reduce latency vs sequential — 5 domains in the time of 1
2. RAGAS evaluation runs on every /run (not just /approve) — caught faithfulness bugs that were silently scoring 33%
3. JWT + X-API-Key dual auth, 76 auth tests, 3 RBAC roles

**Why you built it:** Real unmet need — spiritual guidance with technical rigour. Demonstrates multi-agent orchestration at scale with production observability.

---

## Bench Resource Optimizer — What to Say

**One sentence:** "5-layer Hybrid RAG pipeline (BM25+FAISS+RRF+HyDE+CRAG+cross-encoder) maps bench employees to roles, generates 7-day upskilling plans, with semantic cache cutting 60–70% of LLM calls and 502 tests at 94.7% coverage."

**Three technical proof points:**
1. Hybrid RAG recall: FAISS alone 60% → full stack 83%+ — each layer has a measured reason
2. G1–G5 guardrails in production: rate limiting, injection detection, JSON repair, PII filter, graceful degradation
3. Episodic memory persists to SQLite WAL — agent remembers your explored roles across server restarts

---

## RunbookAI — What to Say

**One sentence:** "RAGless incident response — LLM extracts commands once at PDF ingest, SQL returns them verbatim at query time — zero hallucinated kubectl commands, three ranked panels per incident, automated conflict detection between internal and official K8s docs."

**Three technical proof points:**
1. `commands_source: "database"` on every response — architectural proof of no hallucination
2. NetworkX topological sort — step ordering guaranteed safe even for parallel-execution graphs
3. P1/P2/P3 three-panel response — engineers see internal-only, official-only, and combined simultaneously

---

## Agentic Growth OS — What to Say

**One sentence:** "5-agent LangGraph marketing pipeline with an auto-learning engine — first run establishes baseline, second run applies learned improvements, ROI improves 40–80% run-over-run."

**Three technical proof points:**
1. LangGraph StateGraph with pure-function nodes — state is immutable per node, no side effects between agents
2. Learning engine: similarity-match past campaigns → extract winning rules → modify agent prompts automatically
3. SVG drag-and-drop canvas shows live LangGraph data flow — non-technical users can see AI working

---

## Universal Agent — What to Say

**One sentence:** "A plug-and-play AI agent that drops into any FastAPI, Angular, React, or HTML app via 3 lines of code or 1 script tag — YAML-configured persona, per-agent lock/unlock dashboard to protect API tokens, currently powering all 4 other enterprise platforms."

**Three technical proof points:**
1. `_resolve_agent_id()` port-based matching — each of 5 agents self-identifies in the registry, no manual config
2. `/agents/lock-all` and `/agents/{id}/lock` — fine-grained token protection via HTTP, no code change needed
3. Vite frontend (port 4204) — Apple/Google light-mode UI with iMessage-style chat, sidebar agent list, and real-time dashboard

---

## How to Tell Your AI Project Story

**Formula:** Problem → Naive solution → Why it fails → Your actual solution → Measurement

**Example (Bench):**
- Problem: "Bench employees have no visibility into their skill gaps"
- Naive: "Just use FAISS for retrieval"
- Why it fails: "FAISS misses exact skill name matches — 'Kubernetes' vs 'k8s' returns different results"
- Actual: "Hybrid BM25+FAISS — BM25 catches exact terms, FAISS catches semantic similarity, RRF fuses them"
- Measurement: "Recall improved from 60% to 83% — I measured each layer's contribution"

---

# MODULE 10 — Advanced Topics

## Fine-Tuning vs RAG — The Decision Matrix

| Situation | Use RAG | Use Fine-Tuning |
|-----------|---------|----------------|
| Knowledge changes frequently | ✓ | ✗ |
| Need to cite sources | ✓ | ✗ |
| Need a specific tone/style | ✗ | ✓ |
| Reduce hallucination on facts | ✓ | ✗ |
| No GPU budget | ✓ | ✗ |
| Model needs to learn a new task format | ✗ | ✓ |

**All 5 projects chose RAG or RAGless over fine-tuning.** Reason: knowledge changes (roles, runbooks, spiritual interpretations), sources must be cited, no GPU budget, and fast iteration matters more than marginal quality gains.

---

## LoRA and QLoRA — Fine-Tuning Without Full GPU Clusters

Not used in any of the 5 projects — intentional. RAG gives equivalent quality for knowledge-intensive tasks without the infra cost. Know the theory for interviews.

**LoRA:** Freeze base model weights, train two small low-rank matrices (A×B) per attention layer. 1–10% of parameters vs full fine-tuning.

**QLoRA:** LoRA + 4-bit quantisation. Run on a single 24GB GPU what previously required 8× A100s.

---

## RLHF — How It Shaped GPT-4

Not implemented directly, but understood and referenced:
- **AstroIntel** has an admin review workflow — human experts approve/flag AI insights. This is RLHF-lite: human preference data collected, used to improve future prompts.
- **Agentic Growth OS** learning engine is DPO-like: it compares good runs vs average runs and applies the delta to the next run automatically.

---

## Multi-Modal AI — Vision + Text

Not implemented in current projects (all text-based), but architecture known:
- Vision encoder (ViT) converts image to embeddings
- Text encoder handles the question
- Cross-attention mechanism fuses visual and text representations
- LLM generates the final answer

**Interview answer:** "My current projects are text-only, but I understand the architecture. If AstroIntel needed palmistry from a hand photo, I'd add a vision encoder to extract palm features, embed them alongside the user's birth data, and feed the combined context to the LLM."

---

# MODULE 11 — Interview Mastery

## The Five-Layer Answer Structure

1. **Restate the problem** — show you understand the real challenge
2. **Name the naive solution** — show you know the obvious approach
3. **Explain why it fails at scale** — shows senior thinking
4. **Describe your actual solution** — specific, named, measured
5. **State the result** — a number, a percentage, a before/after

---

## Three Question Types — How to Handle Each

**Design question ("Design a RAG system for X"):**
→ Chunking strategy → embedding model choice → vector store → retrieval method → reranking → evaluation

**Debugging question ("Why is your RAG giving bad answers?"):**
→ Check retrieval first (is the right chunk being returned?) → check chunking (is context being split at the wrong boundary?) → check prompt (is context being injected correctly?) → check model (does it ignore the context?)

**Trade-off question ("RAG vs fine-tuning?"):**
→ RAG when knowledge changes, fine-tuning when behaviour needs to change. Always name a specific project example.

---

## Signal Words That Raise Your Level

Say these:
- "I measured the impact of each layer..."
- "The naive approach would be... but it fails because..."
- "In production we observed..."
- "The root cause was..."
- "I validated this with 502 tests at 94.7% coverage..."
- "commands_source: database on every response — that's my proof"

Avoid:
- "I used LangChain" (so does everyone)
- "The LLM generates..." (describe the architecture, not just the tool)
- "It uses RAG" (which RAG? which retrieval strategy? which chunking?)

---

## One-Paragraph Self Introduction (Memorize This)

"I'm a Senior AI Engineer with 4 years of experience building production LLM systems. My most recent work includes five enterprise AI platforms: AstroIntel — 18-agent LangGraph system at $0.000137 per analysis; Bench Resource Optimizer — 5-layer hybrid RAG with 502 tests and 94.7% coverage; RunbookAI — a RAGless incident response system where architectural design eliminates hallucination entirely; Agentic Growth OS — a self-improving marketing agent pipeline; and Universal Agent — a plug-and-play agent infrastructure serving all four platforms. Across these projects I've implemented guardrails, semantic caching, circuit breakers, SSE streaming, episodic memory, and Kafka event pipelines. I use Java/Spring professionally and Python for AI — I can bridge both worlds."

---

## Pre-Interview Checklist

- [ ] Recite all 5 project one-liners cold
- [ ] Know test counts: 415, 502, 137, 20
- [ ] Know the cost: $0.000137 per AstroIntel analysis
- [ ] Know RAG recall numbers: 60% → 78% → 83%+ (Bench)
- [ ] Know G1–G5 guardrails by name
- [ ] Explain RunbookAI RAGless in one sentence
- [ ] Explain Universal Agent lock mechanism in one sentence
- [ ] Explain Agentic Growth OS learning loop in two sentences
- [ ] Explain why you chose DeepSeek over GPT-4o
- [ ] Explain RAGAS metrics you measured and bugs you fixed

---

# MODULE 12 — Java/Spring Bridge (Your Differentiator)

## Integrating LLMs into Spring Boot Microservices

```java
// RestTemplate call to FastAPI LLM service
@Service
public class LLMService {
    private final RestTemplate restTemplate;

    public String generatePlan(String userId, String role) {
        var request = new ChatRequest(userId + " needs a plan for " + role);
        return restTemplate.postForObject(
            "http://ai-service:8000/agent/chat",
            request, ChatResponse.class).message();
    }
}
```

**Pattern:** Spring Boot is the orchestrator, FastAPI is the AI microservice. Spring handles auth, routing, and business logic. Python handles LLM calls, RAG, and embeddings.

**Per-project Java relevance:**
- Bench pattern maps directly to enterprise HR systems built on Spring Boot
- Universal Agent's REST API (`/agent/chat`) is designed to be called from any language including Java
- RunbookAI's incident response fits an enterprise ops platform built on Spring

---

## DevOps for AI — Docker, Kubernetes, FastAPI Workers

**All 5 projects ship with Docker:**
- Multi-stage Dockerfiles (build stage → runtime stage)
- Non-root users in all containers
- `.dockerignore` to exclude `.env`, `__pycache__`, test files
- Bench: SonarQube caught `COPY . .` bundling secrets — fixed to explicit per-directory copies

**docker-compose for local dev:**
- Bench: FastAPI + Redis + Kafka + ZooKeeper in one `docker-compose.yml`
- AstroIntel: FastAPI + Redis + Kafka in docker-compose

---

## CI/CD for AI Systems

**GitHub Actions (Bench):**
```yaml
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r requirements.txt
      - run: pytest tests/ --cov=. --cov-report=xml
      - uses: SonarSource/sonarcloud-github-action@master
```

**What to say:** "Every push runs 502 tests and a SonarQube scan. Quality Gate blocks merge if coverage drops below threshold, if new vulnerabilities appear, or if code smells exceed the budget."

---

## Cloud Deployment — AWS and GCP for AI

| Component | AWS | GCP |
|-----------|-----|-----|
| Container | ECS Fargate / EKS | Cloud Run / GKE |
| Vector DB | OpenSearch | Vertex AI Matching Engine |
| Queue | SQS / MSK (Kafka) | Pub/Sub |
| LLM API | Bedrock | Vertex AI |
| Object Storage | S3 | GCS |

**Interview line:** "My projects are containerised and deployable to any cloud. The FastAPI + Docker + SQLite architecture runs on a single ECS task for small deployments. At scale, swap SQLite for RDS, Redis for ElastiCache, and add an Application Load Balancer."

---

# MODULE 13 — Regex (Used Extensively in Production AI)

## Why Regex Matters in AI Engineering

Regex appears in **every production AI system** you build:
- **LLM output parsing** — extract JSON from markdown-wrapped LLM responses (Bench G3)
- **PII filtering** — strip emails and phones before storing or returning LLM output (Bench G4)
- **Injection detection** — scan user input for prompt hijacking patterns (Bench G2)
- **Conflict detection** — find numeric parameter disagreements in runbook text (RunbookAI)
- **Input validation** — OTP codes, phone numbers, email formats (AstroIntel)
- **Semantic chunking** — split on sentence boundaries, markdown headers, code fences

---

## Core Patterns Used in Production (Know Cold)

### PII Filter — Bench G4

```python
import re

# Compiled once at module level — called on every LLM output
_EMAIL = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PHONE = re.compile(r'(\+?\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}')

def strip_pii(text: str) -> str:
    text = _EMAIL.sub('[EMAIL]', text)
    text = _PHONE.sub('[PHONE]', text)
    return text
```

### JSON Extraction from LLM Output — Bench G3

```python
# G3 JSON repair cascade: direct → fence → regex key-value → LLM repair
_JSON_FENCE  = re.compile(r'```(?:json)?\s*([\s\S]*?)\s*```')
_JSON_INLINE = re.compile(r'\{[\s\S]*\}')

def extract_json(text: str) -> dict:
    try:                                        # Step 1: direct parse
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _JSON_FENCE.search(text)               # Step 2: markdown fence
    if m:
        try: return json.loads(m.group(1))
        except json.JSONDecodeError: pass
    m = _JSON_INLINE.search(text)              # Step 3: bare JSON object
    if m:
        try: return json.loads(m.group(0))
        except json.JSONDecodeError: pass
    return llm_repair_json(text)               # Step 4: LLM repair call
```

### Injection Detection — Bench G2

```python
_INJECTION = re.compile(
    r'ignore\s+(all\s+)?previous|forget\s+(all\s+)?instructions'
    r'|you\s+are\s+now|act\s+as\s+if|pretend\s+(you\s+are|to\s+be)'
    r'|jailbreak|DAN\s+mode|developer\s+mode',
    re.IGNORECASE,
)

def check_injection(text: str) -> bool:
    return bool(_INJECTION.search(text))
```

### Numeric Conflict Detection — RunbookAI VALUE_CONFLICT

```python
_NUMERIC = re.compile(
    r'\b(\d+(?:\.\d+)?)\s*(GB|MB|KB|ms|s|%|replicas?|pods?|nodes?|cores?|CPU|RAM)\b',
    re.IGNORECASE,
)

def detect_value_conflict(internal_step: str, official_step: str) -> bool:
    def extract(text):
        return {u.lower(): float(v) for v, u in _NUMERIC.findall(text)}
    internal, official = extract(internal_step), extract(official_step)
    shared = set(internal) & set(official)
    return any(internal[u] != official[u] for u in shared)
```

### Markdown Header Splitter — Semantic Chunking

```python
_HEADER = re.compile(r'^#{1,6}\s+.+$', re.MULTILINE)

def split_on_headers(text: str) -> list[str]:
    boundaries = [m.start() for m in _HEADER.finditer(text)]
    if not boundaries:
        return [text]
    chunks = []
    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else len(text)
        chunks.append(text[start:end].strip())
    return chunks
```

### OTP Validation — AstroIntel

```python
_OTP = re.compile(r'^\d{6}$')

def validate_otp(code: str) -> bool:
    return bool(_OTP.fullmatch(code.strip()))
```

---

## Regex in Each of the 5 Projects

### AstroIntel 360°
```python
_OTP_PATTERN = re.compile(r'^\d{6}$')
_HTML_TAGS   = re.compile(r'<[^>]+>')
_SCRIPT_TAGS = re.compile(r'<script[\s\S]*?</script>', re.IGNORECASE)

def sanitise_input(text: str) -> str:
    text = _SCRIPT_TAGS.sub('', text)
    return _HTML_TAGS.sub('', text)
```
- OTP validation (`^\d{6}$`), HTML/script tag stripping on birth details input, language routing pattern matching for 23 Indian languages

### Bench Resource Optimizer (heaviest regex usage)
```python
# G2 — Injection detection (multi-pattern)
# G3 — JSON fence extraction, bare JSON extraction
_FENCE     = re.compile(r'```(?:json)?\s*([\s\S]*?)```')
# G4 — PII filter
_PII_EMAIL = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PII_PHONE = re.compile(r'(\+?\d[\d\s\-().]{7,}\d)')
```
- G2: injection detection before every LLM call
- G3: 4-step JSON repair cascade — direct → fence → bare → LLM
- G4: PII strips email/phone from all LLM outputs
- **ReDoS bug fixed**: original `\s*` inside repeated group → replaced with plain `split()`

### RunbookAI
```python
_NUM_UNIT = re.compile(r'\b(\d+(?:\.\d+)?)\s*(GB|MB|ms|s|%|replicas?|pods?)\b', re.I)
_NON_WORD = re.compile(r'[^\w\s]')

def normalise_title(title: str) -> set[str]:
    clean = _NON_WORD.sub('', title.lower())
    return set(clean.split())

def title_overlap(a: str, b: str) -> float:
    sa, sb = normalise_title(a), normalise_title(b)
    return len(sa & sb) / max(len(sa), len(sb)) if sa and sb else 0.0
```
- `VALUE_CONFLICT`: numeric parameter extraction per step
- `ORDER_CONFLICT`: ordering keyword scan
- Title overlap (≥ 40% threshold) for P3 combined panel matching

### Agentic Growth OS
```python
_ROI_SCORE   = re.compile(r'roi[:\s]+(\d+(?:\.\d+)?)', re.I)
_IMPROVEMENT = re.compile(r'(\d+(?:\.\d+)?)\s*%\s*(?:improvement|increase|gain)', re.I)

def extract_roi(agent_output: str) -> float | None:
    m = _ROI_SCORE.search(agent_output)
    return float(m.group(1)) if m else None
```
- Learning engine extracts ROI and improvement % from agent output text
- Campaign type detection via `re.search` on description keywords

### Universal Agent
```python
_CALC_RESULT = re.compile(r'(?:result|answer|=)\s*:?\s*(-?\d+(?:\.\d+)?)', re.I)
_SESSION_ID  = re.compile(r'^[a-zA-Z0-9\-_]{8,64}$')

def validate_session_id(sid: str) -> bool:
    return bool(_SESSION_ID.fullmatch(sid))
```
- Tool result extraction when LLM returns formatted output
- Session ID validation on every `/agent/chat` call

---

## The ReDoS Vulnerability (Real Bug from Bench — SonarQube S5852)

**What is ReDoS?** A regex with nested quantifiers can take exponential time on crafted input — causing server hang / denial of service.

```python
# VULNERABLE — catastrophic backtracking on long user input
re.match(r'^(\w+\s*)+$', 'a' * 50 + '!')   # hangs the server

# FIXED — plain string op, same result, O(n) always
' '.join(text.split())  # no regex needed for this use case
```

**Rule:** Never put `\s*`, `.*`, or `+` inside a group that is itself repeated (`+` or `*`) on user input.

**Safe patterns:**
```python
re.match(r'^\d{6}$', otp)          # fixed repetition — safe
re.search(r'\b\w+\b', text)        # word boundary — safe
re.sub(r'[^\w\s]', '', text)       # character class — safe

re.match(r'(\w+\s*)+', user_text)  # nested quantifier — RISKY
re.match(r'(.+)+', user_text)      # nested quantifier — RISKY
```

**Interview line:** "SonarQube caught a ReDoS vulnerability in our injection guard — `\s*` inside a repeated group on user input. I replaced it with plain string operations. This is why static analysis matters even for 'small' utility functions."

---

## Performance Rules

| Rule | Why |
|------|-----|
| `re.compile()` at module level | Compile once, reuse many times — not inside the function |
| `re.search()` for "contains" | `re.match()` only checks the start of the string |
| `re.fullmatch()` for format validation | Ensures the entire string matches, not just a prefix |
| `re.IGNORECASE` over `.lower()` | One operation instead of two |
| Avoid `re.DOTALL` on user input | `.` matching newlines causes unexpected matches |
| Raw strings `r'...'` always | Avoids double-escaping `\\d` vs `\d` confusion |

```python
# Compile once at module level — not inside the function
_PII_EMAIL = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
_PII_PHONE = re.compile(r'(\+?\d[\d\s\-().]{7,}\d)')

def strip_pii(text: str) -> str:
    text = _PII_EMAIL.sub('[EMAIL]', text)
    return _PII_PHONE.sub('[PHONE]', text)
```

This is the exact pattern used in Bench G4 — compiled at module load, called on every LLM output.

---

## Regex vs String Operations — When to Use Each

| Task | Use Regex | Use String Ops |
|------|-----------|---------------|
| Validate an email | ✓ | Too complex with string ops |
| Check if starts with "Error:" | ✗ | `text.startswith("Error:")` |
| Extract all numbers from text | ✓ | Too complex with string ops |
| Strip whitespace | ✗ | `text.strip()` |
| Check word boundary match | ✓ | Hard without regex |
| Split on a fixed delimiter | ✗ | `text.split(',')` |
| Find overlapping patterns | ✓ | Impossible with string ops |
| Replace a simple substring | ✗ | `text.replace('old', 'new')` |

**Bench SonarQube rule:** Replace regex with string ops whenever possible — faster, no ReDoS risk, more readable.

---

## Interview Line

"Regex appears in every production AI system I've built — G4 PII filtering on all LLM outputs, G3 JSON repair cascades for malformed LLM responses, conflict detection in RunbookAI using numeric parameter extraction, and injection detection in Bench. I also fixed a ReDoS vulnerability that SonarQube caught — a `\s*` inside a repeated group on user input. Replaced it with plain string operations."

---

# QUICK REFERENCE — Numbers and Decisions

## All 5 Projects at a Glance

| Project | Tests | Cost/query | Key metric | Architecture |
|---------|-------|-----------|-----------|-------------|
| AstroIntel | 415 | $0.000137 | 18+ agents | LangGraph parallel |
| Bench | 502, 94.7% cov | ~$0.001 (cached) | 60%→83% recall | Hybrid RAG |
| RunbookAI | 137 | ~$0 at query | 100% verbatim commands | RAGless SQL |
| Agentic Growth OS | — | ~$0.005/run | 40–80% ROI gain | LangGraph 5-agent |
| Universal Agent | 20 | $0 when locked | 5 agents managed | YAML-config ReAct |

## Latency Targets

| Operation | Target | Project |
|-----------|--------|---------|
| Cache hit | < 1ms | Bench L1 |
| SQL query | < 100ms | RunbookAI |
| TTFT streaming | < 500ms | Bench, AstroIntel |
| Full LLM response | < 5s | All projects |
| RunbookAI full query | < 100ms | RunbookAI (no LLM) |
| Lock toggle | < 10ms | Universal Agent |

## RAG Recall Improvement (Bench — Know Cold)

| Stack | Recall |
|-------|--------|
| FAISS only | ~60% |
| + BM25 + RRF | ~78% |
| + HyDE | ~83% |
| + Cross-encoder reranker | Best precision |

## Decision Trees

**RAG vs Fine-tuning?** → Knowledge changes frequently → RAG. Behaviour/style needs to change → Fine-tuning.

**RAG vs RAGless?** → Commands must be exact and verbatim → RAGless SQL (RunbookAI). Knowledge is natural language → RAG.

**LangGraph vs sequential pipeline?** → Conditional routing / parallel agents → LangGraph. Fixed linear flow → sequential FastAPI (Bench).

**FAISS vs pgvector vs Pinecone?** → Local + no infra → FAISS. Already on PostgreSQL → pgvector. Managed production scale → Pinecone.

**SSE vs WebSocket?** → Server-to-client streaming (token stream) → SSE. Bidirectional real-time → WebSocket.

**Lock one agent vs lock all?** → Specific agent burning tokens → `/agents/{id}/lock`. Budget emergency → `/agents/lock-all`.

**RAGless vs Vectorless?** → Usually the same. RAGless = no retrieval step at query time. Vectorless = no vector embeddings. RunbookAI is both. Universal Agent default is both.

---

# MODULE 14 — Vectorless / RAGless Architecture (The Pattern That Is Booming)

## The Core Insight

Everyone talks about RAG. Senior engineers know when NOT to use it.

**Vectorless / RAGless** = LLM extracts structure once at ingest → SQL stores it → SQL returns it verbatim at query time. Zero vectors, zero hallucination, sub-100ms latency.

```
Standard RAG:                    Vectorless (RAGless):
Query                            Query
  → Embed (cost + latency)         → SQL SELECT (deterministic)
  → Vector search (approximate)    → Return exact stored string
  → LLM generates (hallucination)  → commands_source: "database"
```

---

## When to Use Vectorless vs RAG

| Situation | RAG | Vectorless |
|-----------|-----|-----------|
| Knowledge is prose / unstructured | ✓ | ✗ |
| Commands must be verbatim exact | ✗ | ✓ |
| Zero hallucination non-negotiable | ✗ | ✓ |
| Query latency must be < 100ms | ✗ | ✓ |
| Knowledge is structured / tabular | ✗ | ✓ |
| Semantic similarity needed | ✓ | ✗ |
| Compliance / auditability required | ✗ | ✓ |

---

## The Proof Field

```json
{
  "steps": [{"command": "kubectl drain node-1 --ignore-daemonsets"}],
  "commands_source": "database",
  "hallucination_risk": "zero",
  "latency_ms": 43
}
```

`commands_source: "database"` is the architectural proof — not a claim, a structural guarantee. The LLM was not in the query path.

---

## What Each Project Does

| Project | Vectorless? | How |
|---------|-------------|-----|
| **RunbookAI** | ✓ Full vectorless | LLM extracts once at PDF ingest → SQL at query time. `commands_source: "database"` always. |
| **Universal Agent** | ✓ Default mode | `knowledge_base.enabled: false` → no FAISS, no embeddings. Lock = zero LLM cost. |
| **AstroIntel 360°** | Partial | Numerology/astrology arithmetic = pure Python (vectorless core). Only narrative uses LLM. |
| **Bench** | ✗ RAG | CVs are prose — semantic similarity IS the right retrieval mechanism. 5-layer hybrid RAG. |
| **Agentic Growth OS** | Partial | Campaign memory = JSON + string similarity. No vectors needed at this scale. |

---

## Interview Lines for Vectorless

**One sentence:** "Vectorless / RAGless is the architecture where the LLM extracts structure once at ingest and SQL returns it verbatim at query time — zero vectors, zero hallucination, sub-100ms latency. RunbookAI proves it: `commands_source: database` on every response."

**Why not RAG for runbooks:** "Cosine similarity is the wrong retrieval mechanism for kubectl commands — 'kubectl drain' and 'kubectl delete' are semantically similar but operationally opposite. SQL returns the exact stored string — structural guarantee, not a statistical one."

**The tradeoff:** "Vectorless only works when your knowledge domain is structured — you can extract clear facts at ingest. For open-ended knowledge bases, RAG wins. The senior move is choosing the right architecture per component."

**Senior signal:** "I invented a 6th RAG pattern: RAGless. The best retrieval is no retrieval — extract structure once at ingest, return it verbatim. This eliminates the entire category of retrieval-related hallucination."
