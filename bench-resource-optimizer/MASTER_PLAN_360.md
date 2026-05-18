# Bench Resource Optimizer — 360° Engineering Master Plan
## Solution Architect + Senior Developer Blueprint

**Date:** 18 May 2026  
**Author:** Solution Architect (full-stack + AI)  
**Rule:** Plan first. Implement one phase at a time. Test positive + negative. Mark each item done in Senior AI Engineer notes.

---

## System Snapshot — What Already Exists (DO NOT BREAK)

### Backend (Python / FastAPI)
| Layer | Status | File |
|-------|--------|------|
| FastAPI app v3.0 | ✅ Running | `backend/main.py` |
| Async SQLite (WAL) | ✅ Done | `backend/db.py` |
| CV Parser Agent | ✅ Done | `agents/cv_parser_agent.py` |
| Role Mapping Agent (RAG) | ✅ Done | `agents/role_mapping_agent.py` |
| Planning Agent (7-day roadmap) | ✅ Done | `agents/planning_agent.py` |
| Tracking Agent (readiness %) | ✅ Done | `agents/tracking_agent.py` |
| Hybrid RAG (FAISS + BM25 + RRF) | ✅ Done | `rag/knowledge_base.py`, `rag/advanced_retrieval.py` |
| HyDE + CRAG + Cross-encoder rerank | ✅ Done | `rag/advanced_retrieval.py` |
| Internal document store | ✅ Done | `rag/document_store.py` |
| Semantic cache (L1 exact + L2 cosine) | ✅ Done | `cache/semantic_cache.py` |
| SSE streaming plan generation | ✅ Done | `main.py /generate-plan/stream` |
| G1–G5 Production guardrails | ✅ Done | `guardrails/production.py` |
| Guardrail persistence (SQLite) | ✅ Done | `guardrails/persistence.py` |
| Session memory (episodic + facts) | ✅ Done | `memory/session_store.py` |
| Metrics collector | ✅ Done | `metrics/collector.py` |
| RAGAS evaluation | ✅ Done | `metrics/ragas_eval.py` |
| LLM-as-judge | ✅ Done | `guardrails/hallucination.py` |
| Rate limit middleware (IP, 60/min) | ✅ Done | `middleware/rate_limit.py` |
| Request logging middleware | ✅ Done | `middleware/logging_mw.py` |
| Prompt versioning (v1/v2) | ✅ Done | `prompts/loader.py`, `utils/prompts.py` |
| Retry + circuit breaker (per op) | ✅ Done | `utils/retry.py` |
| PII filter | ✅ Done | `guardrails/production.py` G4 |
| Security/injection detection | ✅ Done | `utils/security.py` |
| Token tracker | ✅ Done | `utils/token_tracker.py` |
| Admin: internal doc upload | ✅ Done | `main.py /admin/upload-resource` |

### Frontend (Angular 17 standalone)
| Component | Status |
|-----------|--------|
| Upload CV (Screen 1) | ✅ Done |
| Role Mapping (Screen 2) | ✅ Done |
| Dashboard + progress (Screen 3) | ✅ Done |
| Memory page | ✅ Done |
| Metrics / observability dashboard | ✅ Done |
| Admin (internal doc upload) | ✅ Done |
| Agent graph visualiser | ✅ Done |
| SSE streaming UI | ✅ Done |

---

## Gap Analysis — What Is Missing vs Production Grade

After deep inspection of every file, these are the **genuine gaps** relative to what AstroIntel has and what a Senior AI Engineer interview requires:

### CRITICAL GAPS (Break first in production)
1. **No test suite** — zero pytest files in `/backend/`. AstroIntel had 546 passing tests.
2. **In-memory episodic memory lost on restart** — `memory/session_store.py` uses plain dicts. No DB persistence for episodic memory.
3. **OTP/Auth: none** — Bench has no authentication at all. Fine for local demo but required to explain security at Senior level.
4. **No CI/CD pipeline** — no `.github/workflows/` equivalent. AstroIntel had pytest + ng build on every PR.
5. **RAGAS store is in-memory** — `metrics/ragas_eval.py` — lost on restart.

### MEDIUM GAPS (Hurt in week 1 of production)
6. **No retry on DeepSeek in planning_agent** — `generate_plan()` has no exponential backoff inside agent (retry wrapper exists but the agent internal call doesn't retry token streaming).
7. **roles_knowledge.json is hardcoded** — only 5 roles. No API to add roles dynamically. CRUD for roles is missing.
8. **No readiness score history** — current schema stores only the last score. No time-series history for the dashboard to show trend charts.
9. **Admin resource upload has no skill-tag validation** — any string accepted as skill tag; no normalisation against known skills.
10. **Memory TTL sweep** — episodic memory has 7-day TTL but there's no scheduled sweep to remove expired entries.

### POLISH GAPS (Senior engineer signals)
11. **No OpenAPI response model on most endpoints** — FastAPI `response_model=` missing. Makes Swagger docs incomplete.
12. **No dark mode / theme token system in frontend** — not a blocker but a senior design signal.
13. **`/health/ready` doesn't check SQLite** — only checks LLM and vector store. DB failure not detected.
14. **No `Cache-Control` headers on `/roles`** — called on every page load; static list never changes.
15. **No structured logging correlation ID** — `request_id` exists in state but not threaded through all log lines.

---

## 360° Master Plan — Implementation Sequence

**Philosophy:** Build on what exists. Do not touch the working UI or agent pipeline. Each phase is independently testable. Each phase maps to a Senior AI Engineer module.

---

### PHASE 1 — Test Suite Foundation
**Priority:** BLOCKER — everything else is unverifiable without tests  
**Senior AI Module:** Module 1 (Evaluation) + Module 6 (MLOps)  
**Estimated time:** 3–4 hours  
**Status:** ✅ DONE — 99 tests passing, committed as milestone

#### What to build:
- `backend/tests/` directory with `conftest.py` + pytest fixtures
- `test_guardrails.py` — G1–G5 unit tests (positive + negative)
- `test_agents.py` — CV parser, role mapping, planning, tracking (mock LLM)
- `test_rag.py` — hybrid retrieval, HyDE, CRAG scoring
- `test_memory.py` — session store write/read/expiry
- `test_db.py` — SQLite CRUD: save/get user, save/get progress, concurrent writes
- `test_cache.py` — L1 exact hit, L2 semantic hit, TTL expiry
- `test_api.py` — FastAPI TestClient: all endpoints, 200/400/404/429/503 paths
- `test_security.py` — injection detection positive/negative
- `Makefile` or `run_tests.sh` — `pytest tests/ -v --tb=short`

#### Test strategy (positive + negative for each):
- CV upload: valid PDF → profile; non-PDF → 400; empty PDF → 400; oversized → 400; injection in CV → 400
- Role mapping: known user + valid role → match result; unknown user → 404; rate limit hit → 429
- Plan generation: valid request → plan; circuit breaker open → 503
- Guardrails G1: 21 requests same user → 21st blocked with 429
- Guardrails G2: 5 failures → circuit OPEN; probe succeeds → CLOSED
- Guardrails G3: broken JSON input → repaired or fallback dict returned
- Cache L1: same hash twice → second call is instant (< 10ms)

#### Senior AI Engineer notes to update:
Module 6 — MLOps: "In bench-resource-optimizer, we added a full pytest suite with 60+ tests covering all 12 modules. Every agent is tested with a mock LLM (no API cost). The test suite runs in under 30 seconds."

---

### PHASE 2 — Memory Persistence (Episodic + RAGAS)
**Priority:** HIGH — session memory is lost on every restart  
**Senior AI Module:** Module 4 (Agent State Management)  
**Estimated time:** 2 hours  
**Status:** ✅ DONE — 12 new tests, 111 total passing, committed as milestone

#### What to build:
- Add `memory` table to `db.py`: `(user_id, session_json, ts, expires_at)`
- Update `memory/session_store.py`:
  - `write_session_summary()` → write to SQLite immediately (write-through)
  - `get_recent_sessions()` → read from SQLite when in-memory deque is empty (startup recovery)
  - `sweep_expired_sessions()` → called at startup to purge entries older than 7 days
- Add `ragas_results` table to `db.py` for RAGAS store persistence
- Update `metrics/ragas_eval.py`: `add()` → persist to SQLite; `dashboard()` → read from SQLite

#### Negative test cases:
- Server restart → episodic sessions still present after re-init
- Session older than 7 days → sweep removes it
- RAGAS store → metrics survive restart

#### Senior AI Engineer notes to update:
Module 4 — Memory: "Bench optimizer implements write-through episodic memory persistence. Every session summary is written to SQLite immediately. On restart, the agent rebuilds its in-memory deque from the DB. RAGAS evaluation results also persist across restarts."

---

### PHASE 3 — Role CRUD API
**Priority:** HIGH — roles_knowledge.json is hardcoded; not scalable  
**Senior AI Module:** Module 6 (MLOps — versioning, data management)  
**Estimated time:** 2 hours  
**Status:** ⬜ TODO

#### What to build:
- `roles` table in SQLite: `(role_id, title, description, required_skills_json, created_at, updated_at)`
- Migration: on first startup, load `roles_knowledge.json` into SQLite
- New endpoints:
  - `POST /admin/roles` — create role
  - `PUT /admin/roles/{role_id}` — update role (also rebuilds FAISS + BM25 index)
  - `DELETE /admin/roles/{role_id}` — delete role
  - `GET /roles` — reads from SQLite (not JSON file)
- Index rebuild trigger: after any role change → call `build_vector_store()` + `init_bm25_from_roles()` in background

#### Negative test cases:
- Duplicate role ID → 409 conflict
- Delete role that doesn't exist → 404
- Update role → FAISS index rebuilds (verify new embedding is searchable)
- Add role with empty required_skills → 400

#### Senior AI Engineer notes to update:
Module 6 — MLOps: "Roles are managed via admin CRUD API, not hardcoded JSON. Any role change triggers an async FAISS + BM25 index rebuild. This is the same pattern used in production RAG systems where knowledge base updates must not block live traffic."

---

### PHASE 4 — Readiness Score History (Time-Series)
**Priority:** MEDIUM — enables trend charts in the dashboard  
**Senior AI Module:** Module 1 (Evaluation Metrics — production KPIs)  
**Estimated time:** 1.5 hours  
**Status:** ⬜ TODO

#### What to build:
- `readiness_history` table: `(user_id, role, score, ts)`
- Update `/update-progress`: after calculating readiness score → insert into history table
- New endpoint: `GET /progress/{user_id}/history` → last 30 score entries
- Frontend: add sparkline/trend chart to Dashboard component (use the existing metrics chart pattern)

#### Negative test cases:
- User with no progress history → empty array (not 404)
- History filtered by user_id (not global)
- 100 progress updates → only last 30 returned

#### Senior AI Engineer notes to update:
Module 1 — Evaluation: "Readiness score is tracked as a time-series, not just the current value. This enables drift detection — if a user's score drops after marking fewer tasks, the trend chart exposes regression. This is a KPI pattern: score = current_state, trend = health of state."

---

### PHASE 5 — CI/CD Pipeline
**Priority:** MEDIUM — required for production-grade project claim  
**Senior AI Module:** Module 6 (MLOps — CI/CD)  
**Estimated time:** 2 hours  
**Status:** ⬜ TODO

#### What to build:
- `.github/workflows/ci.yml`:
  - Trigger: push + PR to main
  - Job 1: backend — `pip install -r requirements.txt && pytest tests/ -v --tb=short`
  - Job 2: frontend — `npm ci && npx ng build --configuration production`
  - Jobs run in parallel (same as AstroIntel pattern)
- `.github/workflows/README.md` — documents what the pipeline checks
- `backend/.env.ci` — test environment variables (DEEPSEEK_API_KEY=test, mock mode)

#### Negative test cases:
- PR with failing test → CI blocks merge
- PR with TypeScript error → ng build fails → CI blocks merge

#### Senior AI Engineer notes to update:
Module 6 — CI/CD: "Every PR triggers parallel jobs: pytest for backend (all 12 modules covered), ng build for frontend. A failing test blocks the merge. This is the same pattern as the AstroIntel pipeline — treat AI code the same as production software: no untested code ships."

---

### PHASE 6 — Health Check + Observability Hardening
**Priority:** MEDIUM — `/health/ready` should check all dependencies  
**Senior AI Module:** Module 5 (AI API Gateway), Module 6 (Monitoring)  
**Estimated time:** 1 hour  
**Status:** ⬜ TODO

#### What to build:
- Update `/health/ready` to check: LLM (ping), FAISS store (not None), SQLite (simple SELECT), BM25 index (not None)
- Add `Cache-Control: public, max-age=3600` to `/roles` response
- Add structured JSON correlation ID to all log lines: `{"request_id": "...", "event": "...", "latency_ms": ...}`
- Add OpenAPI `response_model=` to top 5 endpoints: `/upload-cv`, `/map-role`, `/generate-plan`, `/progress/{user_id}`, `/metrics`

#### Negative test cases:
- Mock SQLite failure → `/health/ready` returns 503
- `/roles` called twice → second response has Cache-Control header
- Log line contains request_id on every path

#### Senior AI Engineer notes to update:
Module 5 — API Gateway: "Health probes check all dependencies, not just the LLM. `/health/live` is the liveness probe (fast). `/health/ready` is the readiness probe — it fails if SQLite, FAISS, or BM25 is not ready. Kubernetes will not route traffic until all pass."

---

### PHASE 7 — Senior AI Engineer Notes — Bench Project Story
**Priority:** HIGH — required for interview  
**Senior AI Module:** Module 9 (Projects + Storytelling)  
**Estimated time:** 1.5 hours  
**Status:** ⬜ TODO

#### What to build:
- `senior-ai-engineer/09-projects-and-storytelling/deep-dive-script-bench-resource-optimizer.md`
- Three-level script:
  - Level 1 (30-second): what it does, for whom, what AI techniques
  - Level 2 (2-minute): architecture walk — RAG pipeline → agents → guardrails → memory → SSE streaming → metrics
  - Level 3 (10-minute): deep-dive each module — HyDE, CRAG, cross-encoder reranking, circuit breaker, PII filter, semantic cache, RAGAS evaluation, LLM-as-judge
- Q&A section: 20 most-likely senior interview questions with answers specific to this project

#### Senior AI Engineer notes to update:
Module 9 — Storytelling: "The bench optimizer demonstrates all 12 Senior AI Engineer modules in a real-world HR use case. Unlike AstroIntel (spiritual domain), this is enterprise-grade: injection attacks from CV text, cross-employee caching at scale, multi-layer failure handling, RAGAS evaluation of retrieval quality."

---

## Implementation Sequence Summary

| Phase | What | Hours | Module | Priority |
|-------|------|-------|--------|----------|
| 1 | Test Suite (60+ tests, all paths) | 4h | M1, M6 | BLOCKER |
| 2 | Memory + RAGAS Persistence | 2h | M4 | HIGH |
| 3 | Role CRUD API | 2h | M6 | HIGH |
| 7 | Project Story Script | 1.5h | M9 | HIGH |
| 4 | Readiness Score History | 1.5h | M1 | MEDIUM |
| 5 | CI/CD Pipeline | 2h | M6 | MEDIUM |
| 6 | Health + Observability Hardening | 1h | M5, M6 | MEDIUM |

**Total: ~14 hours of focused engineering work.**

---

## Rules for Each Phase

1. **Read the existing code** in that area before writing anything new
2. **Write tests first** (or alongside code, never after)
3. **Positive test:** the happy path works
4. **Negative test:** each error condition is explicitly covered
5. **Never break existing working code** — if a change breaks a passing route, revert and find a non-invasive approach
6. **After each phase:** run `pytest tests/ -v` — all tests must pass before marking done
7. **Mark the phase done** in this file (change ⬜ to ✅) and add a note to the relevant Senior AI Engineer MD file
8. **COMMIT after every completed phase** — once all tests pass, commit as a milestone with message `phase N: [description]`. This is mandatory, not optional.

---

## How to Work From This Plan

Each implementation session:
1. Pick the next ⬜ phase in sequence
2. Read the "What to build" section
3. Run `ng build` / `pytest` baseline to confirm nothing is broken before starting
4. Implement → test → mark ✅
5. Update the relevant Senior AI Engineer notes file with concrete "in this project, we did X because Y" language
6. Commit with message: `phase N: [description]`

---

*This plan was created by inspecting every Python and TypeScript file in the project, comparing against AstroIntel's production patterns, and mapping each gap to the 12 Senior AI Engineer modules.*
