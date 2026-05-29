# Process Document — Bench Resource Optimizer

**Submitted by:** Chandan Kumar (RavSinghChandan)  
**Submission Date:** 2026-05-29  
**Repository:** github.com/RavSinghChandan/ai-engineer (branch: main)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BENCH RESOURCE OPTIMIZER                            │
│                    Enterprise AI Platform — v3.0                            │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     HTTP/REST      ┌────────────────────────────────────────┐
  │   Angular 17  │ ◄────────────────► │        FastAPI Backend (port 8000)     │
  │   Frontend   │                    │                                         │
  │  (port 4200) │                    │  ┌──────────┐  ┌──────────────────────┐│
  └──────────────┘                    │  │  Auth    │  │  Rate Limiter (G1)   ││
                                      │  │  JWT     │  │  Circuit Breaker (G2)││
                                      │  │  RBAC    │  │  JSON Repair (G3)    ││
                                      │  └──────────┘  │  PII Filter (G4)     ││
                                      │                 │  Degradation (G5)    ││
                                      │  ┌──────────────────────────────────┐  ││
                                      │  │         AI AGENT LAYER           │  ││
                                      │  │                                  │  ││
                                      │  │  ┌────────────┐  ┌────────────┐ │  ││
                                      │  │  │ CV Parser  │  │Role Mapper │ │  ││
                                      │  │  │   Agent    │  │   Agent    │ │  ││
                                      │  │  └─────┬──────┘  └─────┬──────┘ │  ││
                                      │  │        │                │        │  ││
                                      │  │  ┌─────▼──────┐  ┌─────▼──────┐ │  ││
                                      │  │  │ Planning   │  │ Tracking   │ │  ││
                                      │  │  │   Agent    │  │   Agent    │ │  ││
                                      │  │  └────────────┘  └────────────┘ │  ││
                                      │  └──────────────────────────────────┘  ││
                                      │                                         │
                                      │  ┌──────────────────────────────────┐  ││
                                      │  │      HYBRID RAG PIPELINE         │  ││
                                      │  │  FAISS Vector Search             │  ││
                                      │  │  + BM25 Keyword Search           │  ││
                                      │  │  + RRF Fusion Ranking            │  ││
                                      │  │  + HyDE Query Expansion          │  ││
                                      │  │  + CRAG Quality Scoring          │  ││
                                      │  │  + Cross-Encoder Reranking       │  ││
                                      │  └──────────────────────────────────┘  ││
                                      └────────────────────────────────────────┘
                                                         │
                          ┌──────────────────────────────┼──────────────────────┐
                          │                              │                      │
                   ┌──────▼──────┐              ┌────────▼──────┐    ┌──────────▼──┐
                   │   SQLite    │              │  DeepSeek LLM │    │    Redis    │
                   │  (WAL mode) │              │  (deepseek-   │    │   Cache     │
                   │  bench.db   │              │   chat API)   │    │  (L2 sem.)  │
                   └─────────────┘              └───────────────┘    └─────────────┘
                          │
                   ┌──────▼──────┐              ┌───────────────┐
                   │   Kafka     │              │     FAISS     │
                   │  (events)   │              │  Vector Index │
                   │  bench.cv.* │              │  (roles_kb)   │
                   └─────────────┘              └───────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Backend Framework** | FastAPI | 0.115+ | Async REST API, OpenAPI docs, SSE streaming |
| **Language** | Python | 3.9+ | Backend runtime |
| **LLM** | DeepSeek (`deepseek-chat`) | API v1 | CV parsing, role mapping, plan generation |
| **LLM Client** | LangChain + OpenAI SDK | 0.3+ | LLM abstraction, token tracking, retry |
| **Vector Search** | FAISS | 1.7+ | Dense semantic similarity for role matching |
| **Keyword Search** | BM25 (rank_bm25) | 0.2+ | Sparse retrieval for skills/keywords |
| **RAG Fusion** | Custom RRF | — | Combines FAISS + BM25 scores (Reciprocal Rank Fusion) |
| **Embeddings** | HuggingFace `all-MiniLM-L6-v2` | Local | Local embedding, no external API cost |
| **Database** | SQLite (WAL mode) | 3.x | Users, progress, roles, memory sessions, RAGAS results |
| **Async DB Driver** | aiosqlite | 0.19+ | Non-blocking SQLite queries |
| **File I/O** | aiofiles | 23+ | Async file reading in async functions |
| **Auth** | JWT HS256 | python-jose | Token-based auth, RBAC (admin/user) |
| **Caching** | Semantic Cache L1+L2 | Custom | L1: exact hash, L2: cosine similarity ≥ 0.92 |
| **Cache Backend** | Redis | 7+ | L2 semantic cache persistence |
| **Message Queue** | Apache Kafka | — | Decoupled event streaming (cv.uploaded, plan.requested) |
| **Frontend** | Angular 17 | Standalone | Dashboard, CV upload, role mapping, progress tracking |
| **Containerisation** | Docker / Colima | — | SonarQube, Redis, Kafka |
| **CI/CD** | GitHub Actions | — | pytest + ng build on every push |
| **Code Quality** | SonarQube Community | 10.x | Static analysis, zero-violation gate |
| **Test Framework** | pytest + pytest-asyncio | 7+ | 222 unit + integration tests |
| **Coverage** | pytest-cov | 4+ | 62.5% coverage, XML report for SonarQube |

---

## Steps Taken — End-to-End Build Process

### Phase 1 — Core Backend (Weeks 1–2)

**Step 1: Project Scaffolding**
- Created FastAPI app with lifespan context manager for startup/shutdown hooks
- Configured async SQLite with WAL mode (concurrent-safe, PostgreSQL-ready)
- Built JWT authentication with role-based access control (admin vs user)
- Schema: `users`, `progress`, `memory_sessions`, `roles`, `ragas_results`, `readiness_history`

**Step 2: AI Agent Layer**
- `cv_parser_agent.py` — Parses PDF/text resume into structured profile (skills, experience, education)
- `role_mapping_agent.py` — Maps parsed profile to best-matching open roles using Hybrid RAG
- `planning_agent.py` — Generates personalised learning roadmap with weekly milestones
- `tracking_agent.py` — Calculates readiness score (0–100) based on completed tasks

**Step 3: Hybrid RAG Pipeline**
- FAISS vector index built from `roles_knowledge.json` (dense semantic search)
- BM25 index built from same roles data (sparse keyword search)
- RRF fusion combines both scores with tunable alpha weight
- HyDE: generates a hypothetical ideal CV to expand query coverage
- CRAG: scores retrieval quality; falls back to LLM if score < threshold
- Cross-encoder reranker: re-scores top-K results for final precision

### Phase 2 — Memory & Evaluation (Week 3)

**Step 4: Episodic Memory**
- Short-term: session summaries stored in SQLite, swept after 7 days
- Long-term: user facts (initial skills, role history) persisted per user
- `build_memory_context()` injects relevant past sessions into every LLM prompt

**Step 5: RAGAS Evaluation**
- Per-request quality scoring: faithfulness, context precision, context recall, answer relevancy
- Scores stored in SQLite `ragas_results` table
- `/metrics/ragas` endpoint exposes aggregated scores for dashboard

### Phase 3 — Production Guardrails (Week 4)

**Step 6: 5-Layer Guardrails (G1–G5)**
- G1: Rate limiter — sliding window, 60 req/min/IP, HTTP 429
- G2: Circuit breaker — opens after 5 LLM failures, probes after 30s
- G3: JSON repair — 4-level cascade (direct → fence strip → regex → LLM repair)
- G4: PII filter — scrubs DOB, time of birth, GPS coords from all LLM output
- G5: Graceful degradation — failed agent → LOW confidence placeholder, pipeline never crashes

**Step 7: Security**
- Input injection detection on all CV text before LLM calls
- Security headers middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- Audit log for every LLM call (request_id, input_hash, output_len, cost)

### Phase 4 — Observability & Quality (Week 5)

**Step 8: Metrics & Token Economics**
- `MetricsCollector` tracks per-request: latency, tokens, cost, agent breakdown
- DeepSeek token costs: $0.00014/1K prompt, $0.00028/1K completion
- `/metrics` endpoint exposes full dashboard data (latency P50/P95/P99, error rate, cache hit rate)

**Step 9: Angular Frontend**
- CV upload flow with drag-and-drop
- Role mapping dashboard with gap analysis display
- Progress tracker with task completion
- Admin role management (CRUD via REST)
- Metrics dashboard (latency, tokens, guardrail stats)

**Step 10: SonarQube Zero-Violation Pass**
- Ran SonarQube Community Edition via Docker
- Initial scan: 1 bug, 1 vulnerability, 69 code smells
- Fixed all issues (see `SONARQUBE_REPORT.md` for full details)
- Final scan: **0 bugs, 0 vulnerabilities, 0 code smells — Quality Gate PASSED**
- All ratings: Reliability A, Security A, Maintainability A

### Phase 5 — Testing & CI/CD (Ongoing)

**Step 11: Test Suite**
- 222 tests across 14 test files
- Unit tests: agents, auth, cache, DB, guardrails, memory, roles
- Integration tests: full API endpoint flows with test DB
- Security tests: header checks, injection detection
- All tests pass in 2.1s with zero flakiness

**Step 12: GitHub Actions CI/CD**
- `.github/workflows/ci.yml` — runs `pytest` on every push and PR
- `.github/workflows/build.yml` — runs `ng build` for frontend validation
- `.github/workflows/deploy.yml` — deploys to GitHub Pages on merge to main

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SQLite over PostgreSQL for MVP | Zero infrastructure dependency, WAL mode handles concurrent writes, swap path to asyncpg requires only connection string change |
| DeepSeek over OpenAI | 10–20× cheaper per token with comparable code/text quality for enterprise use cases |
| Hybrid RAG (FAISS + BM25 + RRF) over pure vector search | BM25 catches exact skill keyword matches that embeddings miss; RRF fusion outperforms either alone |
| Local HuggingFace embeddings | Zero external API cost for indexing; `all-MiniLM-L6-v2` is sufficient for role-skill similarity |
| Async throughout (FastAPI + aiosqlite + aiofiles) | Non-blocking I/O handles concurrent users without thread pools; matches production deployment pattern |
| JWT HS256 over OAuth2 | Self-contained tokens suitable for enterprise internal tools; no external IdP dependency for demo |

---

## Running the Project

### Prerequisites
- Python 3.9+, Node.js 18+, Angular CLI
- DeepSeek API key

### Quick Start
```bash
# Backend
cd bench-resource-optimizer/backend
cp .env.example .env          # fill in DEEPSEEK_API_KEY and JWT_SECRET
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd bench-resource-optimizer/frontend
npm install && npm start       # http://localhost:4200

# Run tests
cd backend && python -m pytest tests/ -v
```

### SonarQube Scan
```bash
# Start SonarQube
docker run -d --name sonarqube -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true sonarqube:community

# Generate coverage + scan
python -m pytest tests/ --cov=. --cov-report=xml:coverage.xml -q
sonar-scanner -Dsonar.token=<token-from-sonarqube-ui>

# View: http://localhost:9000/dashboard?id=bench-resource-optimizer
```
