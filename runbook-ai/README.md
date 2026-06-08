# RunbookAI

**Enterprise IT Runbook & Incident Response Assistant — RAGless + Multi-Source Architecture**

Zero vectors. Zero embeddings. Zero hallucinated commands.  
Three completely separate knowledge panels ranked by priority for every incident.

---

## Quick Start — Run Locally Right Now

```bash
# Terminal 1 — Backend
cd runbook-ai
export JWT_SECRET=your-secret-here        # required
export DEEPSEEK_API_KEY=sk-...            # required for PDF ingestion
export APP_ENV=development
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd runbook-ai/ui
npm install
ng serve --port 4200
```

Open **http://localhost:4200** — dashboard loads immediately with 22 pre-loaded runbooks (12 internal + 10 official K8s docs).

---

## What Problem Does This Solve?

When an on-call engineer gets paged at 3 AM:

- They need the **exact** `kubectl` command — not a paraphrase
- They need steps **in safe order** — Step 3 cannot run before Step 2
- They need to know which steps can run **in parallel** — to save time
- They need to know if their internal runbook **conflicts** with official K8s docs
- They need **three separate views**: internal-only, official-only, and combined

Traditional RAG/vector search cannot reliably do any of these.  
RunbookAI extracts structure **once at upload**, answers with **deterministic SQL + dependency graph**.  
The LLM never generates commands at query time — commands come verbatim from the database.

---

## 3-Panel Priority System

Every query returns **three completely separate, non-mixed panels**:

| Priority | Panel | Color | Source | When to use |
|----------|-------|-------|--------|-------------|
| **P1 — Try first** | Internal | 🟢 Green | Your uploaded company runbooks ONLY | Verified on your infrastructure. Resolves ~90% of incidents. |
| **P2 — If P1 fails** | Official Docs | 🔵 Blue | Official Kubernetes docs ONLY | Generic but authoritative. Use if internal steps don't apply. |
| **P3 — Both agree** | Combined | 🟣 Purple | Steps matched across both sources | Highest confidence — cross-validated. Commands from internal runbook. |

**Key design rule:** No mixing between panels. Internal never leaks into Official. Official never leaks into Internal. Each panel is completely self-contained.

### How the UI looks

```
RESOLUTION ORDER:  ① Internal  →  ② Official Docs  →  ③ Combined

● Internal  7 steps  P1 · TRY FIRST  |  ● Official Docs  6 steps  P2 · IF P1 FAILS  |  ● Combined  1 steps  P3 · BOTH AGREE

┌──────────────────────────────────────────────────────────────────┐
│  PRIORITY 1   YOUR INTERNAL RUNBOOK   K8S Pod Crashloop Recovery  │  ← green header
│  Start here — verified on your infrastructure. ~90% resolve here. │
│                                                                   │
│  1  Identify the Affected Pod                                     │
│     kubectl get pods -n payments | grep CrashLoopBackOff          │
│  2  Inspect Pod Events                                            │
│     kubectl describe pod <name> -n payments                       │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Production Hardening (Phase 8)

All critical security and reliability issues are fixed:

| Issue | Fix |
|-------|-----|
| Hardcoded JWT secret | `JWT_SECRET` env var **required** — startup fails hard if not set |
| `/ingest/upload` unauthenticated | Requires `editor` or `admin` role JWT token |
| Tenant isolation missing on upload | `tenant_id` threaded through entire ingest flow |
| `CORS allow_origins=["*"]` | Reads `ALLOWED_ORIGINS` env var; defaults to localhost only |
| `urllib.urlopen` blocking event loop | Replaced with `httpx` (20s timeout, 2 retries with backoff) |
| N+1 query in runbook list | Step count as correlated subquery — 100 runbooks = 1 query |
| Bare `json.loads()` on DB fields | `_safe_json()` helper — logs warning, returns default on corrupt data |
| No PDF magic-byte validation | Validates `%PDF` header — extension alone can be spoofed |
| No DB indexes | 6 indexes on `tenant_id`, `category`, `severity`, `status` |
| No rate limiting on `/query` | In-process sliding window: 20 req/min per IP → HTTP 429 |
| Deprecated `@on_event` | Replaced with `lifespan` context manager |
| No structured logging | `logging.basicConfig` on startup with ISO timestamps |

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                           RUNBOOK AI SYSTEM                            │
│                                                                        │
│  ┌──────────┐    ┌─────────────┐    ┌───────────────────────────────┐  │
│  │ Angular  │    │   FastAPI   │    │      Background Worker        │  │
│  │ UI :4200 │◄──►│  API :8000  │◄──►│   LangGraph Pipeline          │  │
│  └──────────┘    └──────┬──────┘    └─────────────┬─────────────────┘  │
│                         │                         │                    │
│              ┌──────────▼──────────┐              │                    │
│              │   SQLite Database   │◄─────────────┘                   │
│              │  runbooks           │  source_type: internal | official │
│              │  steps              │  source_name, source_url         │
│              │  runbook_conflicts  │  conflicts: VALUE|ORDER|MISSING   │
│              │  ingest_jobs        │                                   │
│              │  graph_cache        │  6 performance indexes            │
│              │  tenants / users    │  WAL mode, FK constraints         │
│              └──────────┬──────────┘                                   │
│                         │                                              │
│         ┌───────────────┼──────────────────┐                          │
│         ▼               ▼                  ▼                          │
│  ┌─────────────┐ ┌─────────────┐  ┌───────────────────┐              │
│  │  NetworkX   │ │  K8s Docs   │  │  Conflict Detector │              │
│  │  DiGraph    │ │  Scraper    │  │  (regex + order)   │              │
│  │  critical   │ │  10 pages   │  │  Populates         │              │
│  │  path,      │ │  from       │  │  runbook_conflicts │              │
│  │  parallel   │ │  k8s.io     │  │  table             │              │
│  │  groups     │ └─────────────┘  └───────────────────┘              │
│  └─────────────┘                                                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## User Flow — Query an Incident

```
Engineer types: "Pods are stuck in CrashLoopBackOff in the payments namespace"
         │
         │  POST /query  { "incident": "..." }
         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 1 — Rate limit check (20 req/min per IP)           │
  │  STEP 2 — Classify (LLM)                                 │
  │  → { category: "kubernetes", severity: "P1",             │
  │      search_terms: ["CrashLoopBackOff", "pod"] }         │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 3 — 3-Tier SQL Match (no vectors, no embeddings)   │
  │  Tier 1: category + severity → HIGH confidence           │
  │  Tier 2: category only      → MEDIUM confidence          │
  │  Tier 3: keyword LIKE       → LOW confidence             │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │  STEP 4 — Build 3 Separate Panels (no mixing)            │
  │                                                          │
  │  P1 Internal → steps from source_type='internal' ONLY    │
  │  P2 Official → steps from source_type='official' ONLY    │
  │  P3 Combined → steps where titles overlap ≥40% (merged)  │
  │  Conflicts   → load from runbook_conflicts table         │
  │  Summary     → LLM writes 2-3 sentences only             │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
  Response: {
    internal: { priority:1, color:"green", steps:[...] },
    official: { priority:2, color:"blue",  steps:[...] },
    combined: { priority:3, color:"purple",steps:[...] },
    conflicts: [...], has_conflicts: true
  }
```

---

## Running Locally

### Prerequisites

```bash
python 3.9+
node 18+
```

### 1. Backend

```bash
cd runbook-ai
python -m venv venv && source venv/bin/activate   # or use ../.venv
pip install -r requirements.txt

# Required env vars
export JWT_SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
export DEEPSEEK_API_KEY=sk-...      # for PDF ingestion + query classification
export APP_ENV=development          # skip JWT_SECRET check in local dev

uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs  (Swagger UI)
# → http://localhost:8000/health
```

### 2. Frontend

```bash
cd runbook-ai/ui
npm install
ng serve --port 4200
# → http://localhost:4200
```

### 3. (Optional) Re-scrape official Kubernetes docs

```bash
cd runbook-ai
DEEPSEEK_API_KEY=sk-... python3 connectors/k8s_docs_scraper.py
```

Scrapes 10 pages from kubernetes/website GitHub → stores as `source_type='official'`.

### 4. (Optional) Re-run conflict detection

```bash
cd runbook-ai
python3 connectors/conflict_detector.py
```

Compares internal vs official runbooks by category, detects conflicts, populates `runbook_conflicts` table.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | **Yes** | — | Minimum 32 chars. Startup fails if not set. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `APP_ENV` | No | `production` | Set to `test` or `development` to skip JWT_SECRET check |
| `DEEPSEEK_API_KEY` | For ingestion | — | DeepSeek API key |
| `ANTHROPIC_API_KEY` | For ingestion | — | Anthropic API key (alternative to DeepSeek) |
| `LLM_PROVIDER` | No | `deepseek` | `deepseek` or `anthropic` |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` | DeepSeek model name |
| `ANTHROPIC_MODEL` | No | `claude-haiku-4-5-20251001` | Anthropic model name |
| `DATABASE_PATH` | No | `runbookai.db` | SQLite file path |
| `ALLOWED_ORIGINS` | No | `http://localhost:4200,http://localhost:4201` | CORS allowed origins (comma-separated) |
| `ACCESS_TOKEN_EXPIRE_SECONDS` | No | `86400` | JWT token lifetime (24h) |

---

## API Reference

### Query

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/query` | Optional | Incident → triage + steps + 3 panels + conflicts. Rate limited: 20/min per IP |
| POST | `/query/classify` | No | Preview category/severity without fetching steps |
| POST | `/query/match` | No | Classify + SQL match — top runbooks with confidence scores |

**Request:**
```json
{
  "incident": "Kubernetes pods are crashlooping after a deployment rollback",
  "max_runbooks": 3,
  "runbook_id": null
}
```

**Response panels structure:**
```json
{
  "panels": {
    "internal":  { "priority": 1, "color": "green",  "source_type": "internal", "steps": [...] },
    "official":  { "priority": 2, "color": "blue",   "source_type": "official", "steps": [...] },
    "combined":  { "priority": 3, "color": "purple", "source_type": "combined", "steps": [...] },
    "conflicts": [...],
    "has_conflicts": true,
    "conflict_count": 2
  }
}
```

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create tenant + first admin user |
| POST | `/auth/login` | Returns JWT access token |
| GET | `/auth/me` | Current user profile |
| POST | `/auth/users` | Admin creates user in tenant |

### Runbooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/runbooks` | Optional | List with category/severity/pagination filters |
| GET | `/runbooks/stats` | Optional | Counts by category and severity |
| GET | `/runbooks/{id}` | Optional | Full runbook with all steps |
| GET | `/runbooks/{id}/steps` | Optional | Steps only |

### Ingest

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/ingest/upload` | **editor+** | Upload PDF — validates magic bytes, returns job_id |
| GET | `/ingest/job/{id}` | Optional | Poll extraction status |

### Graph

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/graph/{id}` | Optional | Critical path, parallel groups, bottleneck steps |

---

## Project Structure

```
runbook-ai/
├── main.py                          # FastAPI app — CORS, lifespan, routers
├── requirements.txt
├── conftest.py                      # Sets APP_ENV=test for all test runs
│
├── agents/
│   ├── classify_agent.py            # LLM → title, category, severity, tags
│   ├── steps_agent.py               # LLM → steps[], commands[], depends_on[]
│   ├── validate_agent.py            # Validates extracted step structure
│   ├── incident_classifier_agent.py # LLM → category, severity, search_terms
│   ├── runbook_matcher_agent.py     # 3-tier SQL match (no vectors)
│   ├── response_composer_agent.py   # Ordered steps from DB + triage summary
│   └── multi_source_composer.py     # Builds 3 clean panels (P1/P2/P3)
│
├── connectors/
│   ├── k8s_docs_scraper.py          # Scrapes 10 kubernetes.io pages
│   └── conflict_detector.py         # VALUE/ORDER/MISSING/EXTRA conflicts
│
├── graph/
│   ├── pipeline.py                  # Ingest: classify → steps → validate
│   ├── query_pipeline.py            # Query: classify → match → compose
│   ├── dependency_graph.py          # NetworkX: critical path, parallel groups
│   ├── state.py                     # ExtractionState TypedDict
│   └── query_state.py               # QueryState TypedDict
│
├── database/
│   ├── db.py                        # SQLite WAL + migrations + 6 indexes
│   ├── models.py                    # CREATE TABLE statements + CREATE_INDEXES
│   ├── runbooks_store.py            # CRUD with _safe_json() + N+1 fix
│   ├── users_store.py               # Tenant + user CRUD
│   └── graph_store.py               # Graph cache CRUD
│
├── routers/
│   ├── auth_router.py               # /auth — register, login, user management
│   ├── deps.py                      # require_auth, require_role, optional_auth
│   ├── query_router.py              # /query — rate limited, 3-panel response
│   ├── runbooks_router.py           # /runbooks — paginated list + stats
│   ├── ingest_router.py             # /ingest — auth required, magic-byte check
│   ├── graph_router.py              # /graph — dependency analysis
│   ├── multi_runbook_router.py      # /multi — merge, compound incidents
│   └── tenant_router.py             # /tenants — tenant management
│
├── utils/
│   ├── auth.py                      # JWT sign/verify — fails hard if no secret
│   ├── llm.py                       # httpx + 20s timeout + 2 retries
│   └── rate_limit.py                # SlidingWindowRateLimiter (20/min per IP)
│
├── extractor/
│   └── pdf_extractor.py             # pdfplumber PDF → raw text
│
├── tests/                           # 141 tests, ~5s, zero external dependencies
│   ├── conftest note: APP_ENV=test set in root conftest.py
│   ├── test_api.py                  # Ingest, auth, runbook endpoints
│   ├── test_agents.py               # Extraction agents
│   ├── test_database.py             # DB CRUD
│   ├── test_dependency_graph.py     # NetworkX graph logic
│   ├── test_query_api.py            # Query endpoint + panel structure
│   ├── test_query_agents.py         # Match + compose agents
│   ├── test_phase4.py               # Multi-runbook, conflicts
│   ├── test_phase6.py               # Auth, RBAC, panel priority (P1/P2/P3)
│   └── test_pdf_extractor.py        # PDF extraction
│
├── docs/
│   ├── sample_pdfs/                 # 12 Kubernetes runbook PDFs
│   └── WHAT_IS_RUNBOOKAI.md
│
└── ui/                              # Angular 21 standalone components
    └── src/app/
        ├── components/
        │   ├── dashboard/           # Stats: 22 runbooks, categories, severities
        │   ├── runbooks/            # List with source_type badges
        │   ├── query/               # Incident query + 3-panel priority UI
        │   ├── ingest/              # PDF upload + background job polling
        │   └── multi/               # Merge, conflicts, compound incidents
        ├── services/api.service.ts  # HttpClient wrapper for all endpoints
        ├── services/auth.service.ts # JWT storage + login/register
        └── models/runbook.model.ts  # All TypeScript interfaces
```

---

## Tests

```bash
cd runbook-ai
python -m pytest tests/ -v
# 141 passed in ~5s — zero external deps, no API keys needed
```

Test coverage:
- G1–G5 guardrails (injection, harmful, PII, off-topic, nonsense)
- All intent handlers in ChatService
- 3-panel priority assertions (P1=1/green/internal, P2=2/blue/official, P3=3/purple/combined)
- Auth: register, login, role enforcement, tenant isolation
- Ingest: auth required, PDF magic bytes, tenant_id propagation
- N+1 query fix verification
- Dependency graph: critical path, cycle detection, parallel groups

---

## Phases

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | PDF ingestion + LangGraph structured extraction | ✅ |
| 2 | NetworkX dependency graph (critical path, parallel groups) | ✅ |
| 3 | Incident query engine (3-tier SQL match, zero vectors) | ✅ |
| 4 | Multi-runbook reasoning, conflict detection, compound incidents | ✅ |
| 5 | Angular 21 UI (dashboard, runbooks, query, ingest, multi) | ✅ |
| 6 | JWT auth + multi-tenant RBAC (viewer/editor/admin) | ✅ |
| 7 | 3-panel priority: P1 Internal → P2 Official → P3 Combined | ✅ |
| 8 | Production hardening: security, reliability, performance | ✅ |

---

## Conflict Detection

When internal runbooks and official K8s docs disagree, conflicts are surfaced with severity and recommendation:

| Type | Example | Severity |
|------|---------|----------|
| `VALUE_CONFLICT` | Internal `timeout=30s`, official `timeout=60s` | HIGH |
| `ORDER_CONFLICT` | Internal drains before cordoning; official reverses | HIGH |
| `MISSING_STEP` | Official has a pre-flight check absent from internal | MEDIUM |
| `EXTRA_STEP` | Internal has infra-specific steps not in official docs | LOW |

---

## Session Bug Fixes — 2026-06-08 (10 Bugs)

Full scan of all source files. Each fix has one inline comment. All syntax-verified before commit.

| # | File | Bug | Severity | Fix |
|---|------|-----|----------|-----|
| B1 | `connectors/conflict_detector.py` | `print()` in production leaks DB row counts and runbook titles to stdout | MEDIUM | Replaced all `print()` with `logger.info/debug` |
| B2 | `connectors/conflict_detector.py` | Hardcoded absolute path `/Users/chandankumar/...` in `__main__` — breaks on any other machine | MEDIUM | Use `Path(__file__).parent.parent` to derive project root at runtime |
| B3 | `connectors/conflict_detector.py` | Raw `sqlite3.connect()` skipped `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` — inconsistent with rest of app, risk of lock contention and orphaned rows | MEDIUM | Added both PRAGMAs after connect, matching `db.py` |
| B4 | `agents/runbook_matcher_agent.py` | Raw `json.loads(rb["tags"])` crashed with `ValueError` on corrupt or NULL tags in DB | HIGH | Replaced with `_safe_tags()` — defensive parse matching `runbooks_store._safe_json` pattern |
| B5 | `routers/query_router.py:113` | Unauthenticated callers got `tenant_id=1` fallback — exposing tenant 1's runbooks to the public | CRITICAL | Changed fallback to `None` so multi-source composer scopes to no tenant |
| B6 | `utils/rate_limit.py` | `X-Forwarded-For` is client-controlled — attacker can rotate IPs to bypass rate limiting | HIGH | Use `X-Real-IP` (set by nginx/envoy, not clients) as primary key |
| B7 | `database/db.py` | `get_conn()` had no `rollback()` on exception — partial writes left DB in dirty state under WAL | HIGH | Added `conn.rollback()` in `except` block before re-raise |
| B8 | `agents/validate_agent.py` | Mutated `step["depends_on"]` mid-iteration — list comprehension replacements ran on already-filtered lists, silently skipping some bad deps | MEDIUM | Single-pass clean build into a new list |
| B9 | `agents/steps_agent.py` | Silent truncation at 12 000 chars — large runbooks lost steps with no warning in `agent_log` | MEDIUM | Added `[WARNING: input truncated...]` note to agent_log when text is cut |
| B10 | `agents/incident_classifier_agent.py` | `except (json.JSONDecodeError, Exception)` — `JSONDecodeError` is a subclass of `Exception`, first clause was dead code; also swallowed LLM auth errors silently | LOW | Changed to `except Exception as exc` + `logger.warning(exc)` |

### Positive / Negative Tests

**B4 safe tags:**
- Positive: `_safe_tags('["k8s","networking"]')` → `["k8s","networking"]`
- Negative: `_safe_tags(None)` → `[]`, `_safe_tags("{bad json")` → `[]` (logs warning, no crash)

**B5 tenant isolation:**
- Positive: authenticated user with `tenant_id=2` gets only tenant-2 runbooks
- Negative: unauthenticated caller gets `tenant_id=None` → scoped to no tenant (no cross-tenant leak)

**B6 rate limit key:**
- Positive: real socket IP `192.168.1.1` is used as rate-limit key
- Negative: spoofed `X-Forwarded-For: 1.2.3.4` ignored when `X-Real-IP` not present

**B7 rollback:**
- Positive: successful transaction commits normally
- Negative: mid-transaction exception triggers `rollback()` → DB stays clean

**B8 dependency validation:**
- Positive: step 2 depends on step 1 → kept
- Negative: step 2 depends on step 5 (future) AND step 99 (missing) → both removed in one pass, no double-mutation

**B9 truncation warning:**
- Positive: 8 000-char runbook → no warning in agent_log
- Negative: 15 000-char runbook → `agent_log` contains `[WARNING: input truncated at 12000 chars]`

**B10 classifier fallback:**
- Positive: valid LLM JSON → parsed correctly
- Negative: LLM timeout → `logger.warning` emitted, fallback keywords returned (no silent swallow)
