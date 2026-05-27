# Bench Resource Optimizer

AI-powered enterprise platform to track bench employees, map them to project roles using Hybrid RAG, identify skill gaps, and generate preparation roadmaps.

> **Full system walkthrough:** [FLOW.md](./FLOW.md) · [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) · [MASTER_PLAN_360.md](./MASTER_PLAN_360.md)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · FastAPI v3.0 · SQLite (WAL) |
| LLM | DeepSeek (`deepseek-chat`) via OpenAI-compatible SDK |
| RAG | FAISS + BM25 + RRF fusion · HyDE · CRAG · Cross-encoder rerank |
| Caching | Semantic cache L1 (exact hash) + L2 (cosine ≥ 0.92) · Redis |
| Auth | JWT HS256 · role-based (admin / user) · all secrets from env |
| Events | Kafka topics: `bench.cv.uploaded`, `bench.plan.requested`, `bench.dlq` |
| Frontend | Angular 17 (standalone components) |
| CI/CD | GitHub Actions — pytest + ng build on every push |
| Tests | 222 tests · 3.6s runtime |

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+ and Angular CLI (`npm i -g @angular/cli`)
- DeepSeek API key

### 1. Set up environment

```bash
cd bench-resource-optimizer/backend
cp .env.example .env
# Fill in: DEEPSEEK_API_KEY, JWT_SECRET (32+ chars), ADMIN_PASSWORD, DEFAULT_USER_PASSWORD
```

### 2. Run backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend: http://localhost:8000  
API Docs: http://localhost:8000/docs

### 3. Run frontend

```bash
cd frontend
npm install
npm start        # runs: ng serve --proxy-config proxy.conf.json
```

Frontend: http://localhost:4200  
Proxy: `/api/*` → `http://localhost:8000` (strips `/api` prefix)

### Or run both at once

```bash
chmod +x run.sh && ./run.sh
```

---

## Login Credentials

| Role | User ID | Password (set in `.env`) |
|------|---------|--------------------------|
| Admin | `admin` | value of `ADMIN_PASSWORD` |
| User | any string | value of `DEFAULT_USER_PASSWORD` |

> Passwords have **no hardcoded defaults** — the server refuses to start if `JWT_SECRET`, `ADMIN_PASSWORD`, or `DEFAULT_USER_PASSWORD` are missing or set to known-weak values.

---

## Project Structure

```
bench-resource-optimizer/
├── backend/
│   ├── main.py                      # FastAPI app v3.0 — routes + lifespan
│   ├── db.py                        # SQLite (WAL mode) — all persistence
│   ├── storage.py                   # JSON file storage layer
│   ├── requirements.txt
│   ├── agents/
│   │   ├── cv_parser_agent.py       # LLM: PDF text → structured UserProfile
│   │   ├── role_mapping_agent.py    # Hybrid RAG + LLM: skill gap analysis
│   │   ├── planning_agent.py        # LLM: 7-day preparation roadmap
│   │   └── tracking_agent.py        # Readiness % calculation
│   ├── rag/
│   │   ├── knowledge_base.py        # FAISS vector store build + load
│   │   ├── advanced_retrieval.py    # BM25 + RRF + HyDE + CRAG + reranker
│   │   └── document_store.py        # Internal admin document store
│   ├── cache/
│   │   └── semantic_cache.py        # L1 exact + L2 cosine semantic cache
│   ├── guardrails/
│   │   ├── production.py            # G1–G5: rate limit, injection, PII, hallucination
│   │   ├── hallucination.py         # LLM-as-judge faithfulness gate
│   │   └── persistence.py           # SQLite guardrail event log
│   ├── memory/
│   │   └── session_store.py         # Episodic + long-term facts per user (SQLite)
│   ├── metrics/
│   │   ├── collector.py             # Cache hit rate, latency, guardrail counts
│   │   └── ragas_eval.py            # RAGAS faithfulness + answer relevance
│   ├── middleware/
│   │   ├── rate_limit.py            # 60 req/min per IP
│   │   └── logging_mw.py            # Structured JSON logs + X-Request-Id
│   ├── auth/
│   │   ├── jwt_handler.py           # HS256 JWT — startup validation of secrets
│   │   └── __init__.py              # LoginRequest, TokenResponse, get_current_user
│   ├── prompts/
│   │   └── loader.py                # Versioned prompt loader (v1/v2)
│   ├── utils/
│   │   ├── retry.py                 # Exponential backoff + circuit breaker
│   │   ├── security.py              # Injection detection + LLM audit log
│   │   ├── token_tracker.py         # Token count + cost per request
│   │   └── prompts.py               # Prompt version registry
│   ├── infra/
│   │   └── redis_client.py          # Redis connection pool, graceful degradation
│   ├── tests/                       # 222 tests — full enterprise stack
│   ├── .env                         # local only — gitignored
│   ├── .env.example                 # committed — shows required vars
│   └── Dockerfile                   # multi-stage, non-root user
└── frontend/
    └── src/app/
        ├── components/
        │   ├── login/               # JWT login screen
        │   ├── upload-cv/           # Screen 1: upload + parse CV
        │   ├── role-mapping/        # Screen 2: RAG role fit analysis
        │   ├── dashboard/           # Screen 3: tasks + readiness score
        │   ├── memory/              # Screen 4: user memory view
        │   ├── metrics/             # Screen 5: observability dashboard
        │   ├── admin/               # Screen 6: internal doc upload (admin only)
        │   └── agent-graph/         # Screen 7: agent pipeline visualiser
        ├── services/
        │   ├── auth.service.ts      # JWT login, token storage, isAdmin()
        │   └── api.service.ts       # HTTP calls to backend
        └── proxy.conf.json          # /api → http://localhost:8000 (strips /api)
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | — | Get JWT token |
| `GET`  | `/auth/me` | Bearer | Current user claims |
| `GET`  | `/health` | — | Health probe |
| `GET`  | `/metrics` | Bearer | Cache, latency, guardrail stats |
| `GET`  | `/roles` | Bearer | List all target roles |
| `POST` | `/upload-cv` | Bearer | Upload PDF → parse → store profile |
| `POST` | `/map-role` | Bearer | Hybrid RAG skill gap analysis |
| `POST` | `/generate-plan` | Bearer | 7-day preparation roadmap |
| `GET`  | `/generate-plan/stream` | Bearer | SSE streaming plan generation |
| `POST` | `/update-progress` | Bearer | Save completed tasks |
| `GET`  | `/progress/{user_id}` | Bearer | Fetch progress + readiness score |
| `GET`  | `/memory/{user_id}` | Bearer | Episodic + long-term memory |
| `POST` | `/admin/upload-resource` | Admin | Upload internal knowledge doc |
| `POST` | `/admin/roles` | Admin | Create new role |
| `PUT`  | `/admin/roles/{id}` | Admin | Update role |
| `DELETE` | `/admin/roles/{id}` | Admin | Delete role |

---

## How It Works

### Hybrid RAG Flow

```
User selects role
       ↓
Query expansion via HyDE (Hypothetical Document Embedding)
       ↓
FAISS dense retrieval  +  BM25 sparse retrieval
       ↓
RRF fusion (Reciprocal Rank Fusion — combines both rankings)
       ↓
CRAG quality score — low score triggers broader fallback search
       ↓
Cross-encoder reranker — top-20 → top-5
       ↓
LLM: candidate skills vs role requirements
       ↓
Output: match %, matched skills, missing skills, recommendation
```

### Agent Pipeline

```
PDF upload → CV Parser Agent → UserProfile (SQLite)
                                      ↓
               Role Mapping Agent ← Hybrid RAG retriever
                                      ↓
                             Planning Agent → 7-day roadmap
                                      ↓
                            Tracking Agent → readiness %
                                      ↓
                         Readiness History → time-series chart
```

### Security Middleware Stack

```
Request → SecurityHeaders → RateLimit (60/min) → RequestLog → JWT Auth
       → Injection detection → PII filter → LLM call → Audit log
```

---

## Guardrails (G1–G5)

| # | Guardrail | What it does |
|---|-----------|-------------|
| G1 | Rate Limit | 60 req/min per IP — 429 with `Retry-After` header |
| G2 | Injection Detection | Scans CV text + role names before any LLM call |
| G3 | Hallucination Gate | LLM-as-judge faithfulness check on role mapping output |
| G4 | PII Filter | Strips email/phone from LLM outputs before returning |
| G5 | Token Budget | Per-operation max token limits enforced at LLM bind |

---

## Test Coverage

| Test file | Tests | What it covers |
|-----------|-------|---------------|
| test_agents.py | 18 | CV parser, role mapper, planner, tracker |
| test_api.py | 29 | All FastAPI endpoints |
| test_auth.py | 24 | JWT login, /auth/me, 401/403 guards |
| test_cache.py | 7 | L1/L2 semantic cache |
| test_db.py | 11 | SQLite CRUD |
| test_docker_config.py | 16 | Dockerfile + docker-compose |
| test_guardrails.py | 35 | G1–G5 guardrails |
| test_infra.py | 19 | Redis, Kafka, DLQ |
| test_memory.py | 11 | Episodic + facts store |
| test_memory_persistence.py | 12 | SQLite memory persistence |
| test_observability.py | 9 | Health, cache headers, correlation IDs |
| test_readiness_history.py | 6 | Time-series score history |
| test_roles.py | 15 | Role CRUD API |
| test_security_headers.py | 10 | HSTS, CSP, X-Frame, Permissions-Policy |
| **Total** | **222** | **Full enterprise stack** |

Run tests:
```bash
cd backend && pytest tests/ -v
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key |
| `JWT_SECRET` | ✅ | Min 32 chars — server refuses weak values |
| `ADMIN_PASSWORD` | ✅ | Admin login password |
| `DEFAULT_USER_PASSWORD` | ✅ | Regular user login password |
| `DEEPSEEK_BASE_URL` | optional | Default: `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | optional | Default: `deepseek-chat` |
| `REDIS_URL` | optional | Default: `redis://localhost:6379` |
| `JWT_EXPIRY_SECONDS` | optional | Default: `86400` (24h) |
