# RunbookAI

**Enterprise IT Runbook & Incident Response Assistant — RAGless Architecture**

Zero vectors. Zero embeddings. Zero hallucinated commands.

---

## Table of Contents

1. [What Problem Does This Solve?](#what-problem-does-this-solve)
2. [System Architecture](#system-architecture)
3. [User Flow 1 — Upload a Runbook PDF](#user-flow-1--upload-a-runbook-pdf)
4. [User Flow 2 — Query an Incident](#user-flow-2--query-an-incident)
5. [Why RAGless?](#why-ragless)
6. [Project Structure](#project-structure)
7. [API Reference](#api-reference)
8. [RBAC Roles](#rbac-roles)
9. [Running Locally](#running-locally)
10. [Environment Variables](#environment-variables)

---

## What Problem Does This Solve?

When an on-call engineer gets paged at 3 AM:

- They need the **exact** `kubectl` command to run — not a paraphrase
- They need the steps **in order** — Step 3 cannot run before Step 2
- They need to know which steps can run **in parallel** — to save time
- They need to know what **breaks** if one step fails — blast radius

Traditional AI search (RAG/vector search) cannot reliably do any of these.  
RunbookAI extracts runbook structure **once** at upload time and answers queries with **deterministic SQL + graph traversal** — the LLM never touches commands at query time.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RUNBOOK AI SYSTEM                            │
│                                                                     │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────────┐   │
│  │  Angular  │    │   FastAPI   │    │     Background Worker    │   │
│  │  UI :4200 │◄──►│  API :8000  │◄──►│  LangGraph Pipeline      │   │
│  └──────────┘    └──────┬──────┘    └──────────┬───────────────┘   │
│                         │                       │                   │
│              ┌──────────▼──────────┐            │                   │
│              │    SQLite Database   │◄───────────┘                  │
│              │  ┌────────────────┐ │                               │
│              │  │ tenants        │ │   Multi-tenant: every          │
│              │  │ users          │ │   runbook belongs to a         │
│              │  │ runbooks       │ │   tenant. JWT auth gates       │
│              │  │ steps          │ │   all writes.                  │
│              │  │ ingest_jobs    │ │                               │
│              │  │ graph_cache    │ │                               │
│              │  └────────────────┘ │                               │
│              └──────────┬──────────┘                               │
│                         │                                           │
│              ┌──────────▼──────────┐                               │
│              │   NetworkX DiGraph   │   Built from steps.depends_on │
│              │  critical_path      │   on first graph request.      │
│              │  parallel_groups    │   Cached in graph_cache table. │
│              │  bottleneck_steps   │                               │
│              │  failure_impact     │                               │
│              └─────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

### How the three layers interact

| Layer | What it does | Technology |
|-------|-------------|------------|
| **Extraction layer** | Reads PDF text, calls LLM once to produce strict JSON (title, steps, commands, dependencies), stores permanently in SQLite | pdfplumber + DeepSeek/Anthropic + LangGraph |
| **Storage layer** | Holds all runbook data with full fidelity. Commands are stored verbatim — never re-generated | SQLite (WAL mode) + NetworkX graph cache |
| **Query layer** | Classifies incident text, matches via SQL (no vectors), assembles ordered steps from DB, LLM writes 2-3 sentence summary only | FastAPI + LangGraph query pipeline |

---

## User Flow 1 — Upload a Runbook PDF

This flow runs every time an engineer uploads a new runbook.

```
Engineer opens UI at http://localhost:4200
         │
         ▼
  ┌─────────────────┐
  │  /ingest page   │  Engineer clicks "Choose File", selects PDF,
  │  Upload button  │  clicks Upload.
  └────────┬────────┘
           │  POST /ingest/upload (multipart/form-data)
           │  Bearer token in header (editor role required)
           ▼
  ┌─────────────────────────────────────────────────────────┐
  │  FastAPI: ingest_router                                  │
  │  1. Saves PDF bytes to temp file                        │
  │  2. Creates ingest_job row (status = "pending")         │
  │  3. Returns job_id immediately (non-blocking)           │
  │  4. Fires BackgroundTask → runs extraction pipeline     │
  └──────────────────────────┬──────────────────────────────┘
                             │  (runs in background)
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP A — PDF Extraction (pdfplumber)                   │
  │  • Reads all pages, extracts text + tables              │
  │  • Combines into single clean text string               │
  │  • No chunking — full document sent to LLM              │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP B — LangGraph Extraction Pipeline                  │
  │                                                         │
  │  classify_agent ──────────────────────────────────────► │
  │  LLM reads full text, returns JSON:                     │
  │    { title, category, severity, tags, duration }        │
  │                                                         │
  │  steps_agent ─────────────────────────────────────────► │
  │  LLM reads full text, returns JSON:                     │
  │    { steps: [ { step_number, title, description,        │
  │                 commands[], depends_on[], timeout } ],   │
  │      rollback_steps: [...],                             │
  │      prerequisites: [...] }                             │
  │                                                         │
  │  validate_agent ──────────────────────────────────────► │
  │  Checks: no empty commands, no dependency cycles        │
  │  Marks job failed if critical errors found              │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP C — SQLite Storage                                │
  │  • Inserts row into runbooks table                      │
  │  • Inserts one row per step into steps table            │
  │    (commands stored as JSON array verbatim)             │
  │  • Updates ingest_job → status = "completed"            │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  UI: polling GET /ingest/job/{id} every 3 seconds       │
  │  Shows progress bar while status = "processing"         │
  │  On "completed" → shows "View Runbook" button           │
  │  On "failed"    → shows error message                   │
  └─────────────────────────────────────────────────────────┘
```

**What the engineer sees in the UI:**

```
[ Uploading... ] ████████████░░░░ 60%  Processing PDF

[ Done! ] ✓ Kubernetes Pod CrashLoopBackOff Recovery
           7 steps extracted · P1 Critical · kubernetes
           [ View Runbook ]
```

---

## User Flow 2 — Query an Incident

This flow runs when an on-call engineer describes a live incident.

```
Engineer types incident in UI at http://localhost:4200/query:
"Pod is stuck in CrashLoopBackOff, restart count 15, after deployment"
         │
         │  POST /query  { "incident": "..." }
         ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 1 — Incident Classification (LLM)                 │
  │                                                         │
  │  LLM reads the plain-English incident description       │
  │  Returns structured JSON:                               │
  │    {                                                    │
  │      "category":   "kubernetes",                        │
  │      "severity":   "P1",                                │
  │      "keywords":   ["pod", "CrashLoopBackOff"],         │
  │      "search_terms": ["crashloop", "pod restart loop"]  │
  │    }                                                    │
  │                                                         │
  │  ← LLM is ONLY used here and for the triage summary     │
  │    Commands are NEVER touched by the LLM again          │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 2 — 3-Tier SQL Runbook Matching (no vectors)      │
  │                                                         │
  │  Tier 1 — HIGH confidence:                              │
  │    SELECT * FROM runbooks                               │
  │    WHERE category = 'kubernetes' AND severity = 'P1'    │
  │    → If match found, use it. Done.                      │
  │                                                         │
  │  Tier 2 — MEDIUM confidence (if Tier 1 empty):          │
  │    SELECT * FROM runbooks                               │
  │    WHERE category = 'kubernetes'                        │
  │    → If match found, use it. Done.                      │
  │                                                         │
  │  Tier 3 — LOW confidence (if Tier 2 empty):             │
  │    SELECT * FROM runbooks                               │
  │    WHERE title LIKE '%crashloop%'                       │
  │    OR description LIKE '%crashloop%'                    │
  │    → Best-effort keyword match                          │
  └──────────────────────────┬──────────────────────────────┘
                             │  runbook_id = 1 (matched)
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 3 — Response Assembly (DB + Graph)                │
  │                                                         │
  │  a) Fetch ALL steps for runbook_id=1 from SQLite        │
  │     Steps are sorted by depends_on graph order          │
  │     (topological sort — safe execution sequence)        │
  │                                                         │
  │  b) Build NetworkX DiGraph from depends_on links        │
  │     Calculate: critical_path, parallel_groups           │
  │                                                         │
  │  c) LLM writes 2-3 sentence triage summary only:        │
  │     "This runbook addresses CrashLoopBackOff with 15    │
  │      restarts. Start with Step 1 to identify the pod,   │
  │      then Steps 4 and 5 can run in parallel..."         │
  │                                                         │
  │  d) Attach commands_source = "database" to response     │
  │     Every command is provably from the DB, not LLM      │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  Response returned to engineer                          │
  │                                                         │
  │  {                                                      │
  │    "runbook_title": "K8s CrashLoopBackOff Recovery",    │
  │    "match_confidence": "MEDIUM",                        │
  │    "triage_summary": "This runbook addresses...",       │
  │    "commands_source": "database",   ← auditable         │
  │    "steps": [                                           │
  │      { "step_number": 1,                                │
  │        "title": "Identify the Affected Pod",            │
  │        "commands": [                                    │
  │          "kubectl get pods -n <namespace> | grep CrashLoopBackOff"
  │        ],                                               │
  │        "depends_on": []  },                             │
  │      { "step_number": 2, ... depends_on: [1] },         │
  │      { "step_number": 3, ... depends_on: [1] },  ← parallel with 2
  │      ...                                                │
  │    ]                                                    │
  │  }                                                      │
  └─────────────────────────────────────────────────────────┘
```

**What the engineer sees in the UI:**

```
Incident: "Pod stuck in CrashLoopBackOff after deployment"

Triage Summary
─────────────────────────────────────────────────────────
This runbook addresses CrashLoopBackOff pods with high
restart counts. Begin with Step 1 to identify affected
pods. Steps 4 and 5 can be executed in parallel.

Steps  (commands from database — not AI-generated)
─────────────────────────────────────────────────────────
Step 1  Identify the Affected Pod
  kubectl get pods -n <namespace> | grep CrashLoopBackOff

Step 2  Inspect Pod Events                    ← after Step 1
  kubectl describe pod <pod-name> -n <namespace>

Step 3  Retrieve Logs                         ← parallel with Step 2
  kubectl logs <pod-name> -n <namespace> --previous

Step 4  Check Resource Limits                 ← after Steps 2+3
  kubectl top pods -n <namespace>

Step 5  Verify Env Variables                  ← parallel with Step 4
  kubectl get secrets -n <namespace>

Step 6  Scale Down and Redeploy               ← after Steps 4+5
  kubectl scale deployment/myapp --replicas=0 -n <namespace>

Step 7  Verify Recovery                       ← after Step 6
  kubectl rollout status deployment/myapp -n <namespace>
```

---

## Why RAGless?

| Problem | Traditional RAG | RunbookAI |
|---------|----------------|-----------|
| Step ordering | Lost when document is chunked | Preserved: extracted as `step_number` + `depends_on` |
| Exact commands | Similarity search may return a similar but wrong command | Commands stored verbatim in SQLite, returned as-is |
| Dependency graph | Vectors cannot represent DAG relationships | NetworkX DiGraph built from `depends_on` fields |
| Audit trail | No way to know if a command came from the doc or was hallucinated | Every response includes `"commands_source": "database"` |
| Determinism | Same query may return different results | Same query always returns same SQL result |

---

## Project Structure

```
runbook-ai/
├── main.py                          # FastAPI app entry point
├── requirements.txt
│
├── agents/                          # LangGraph agent nodes
│   ├── classify_agent.py            # LLM → title, category, severity, tags
│   ├── steps_agent.py               # LLM → steps[], commands[], depends_on[]
│   ├── validate_agent.py            # Cycle check, command completeness
│   ├── incident_classifier_agent.py # LLM → category, severity, search_terms
│   ├── runbook_matcher_agent.py     # 3-tier SQL match (no vectors)
│   ├── response_composer_agent.py   # Ordered steps from DB + triage summary
│   ├── conflict_detector_agent.py   # Regex-based cross-runbook conflict check
│   ├── compound_incident_agent.py   # LLM decomposes multi-domain incident
│   └── multi_runbook_merger_agent.py
│
├── graph/                           # LangGraph pipelines + NetworkX
│   ├── pipeline.py                  # Ingest: classify → steps → validate
│   ├── query_pipeline.py            # Query: classify → match → compose
│   ├── dependency_graph.py          # NetworkX: critical path, parallel groups
│   ├── state.py                     # ExtractionState TypedDict
│   └── query_state.py               # QueryState TypedDict
│
├── database/
│   ├── db.py                        # SQLite connection + migrations
│   ├── models.py                    # DDL: all CREATE TABLE statements
│   ├── runbooks_store.py            # CRUD: runbooks, steps, ingest_jobs
│   ├── graph_store.py               # Graph cache build + retrieval
│   └── users_store.py               # CRUD: tenants, users
│
├── routers/                         # FastAPI route handlers
│   ├── deps.py                      # JWT auth dependency, RBAC checks
│   ├── auth_router.py               # /auth/* — register, login, users
│   ├── tenant_router.py             # /tenants/*
│   ├── ingest_router.py             # /ingest/upload, /ingest/job/{id}
│   ├── runbooks_router.py           # /runbooks — list, detail, steps
│   ├── graph_router.py              # /graph/{id} — dependency analysis
│   ├── query_router.py              # /query — incident → steps
│   └── multi_runbook_router.py      # /multi — merge, conflicts, compound
│
├── extractor/
│   └── pdf_extractor.py             # pdfplumber: text + table extraction
│
├── utils/
│   ├── llm.py                       # DeepSeek/Anthropic API calls
│   └── auth.py                      # bcrypt + JWT sign/verify
│
├── tests/                           # 137 tests, all passing
│   ├── test_api.py                  # Phase 1-3
│   ├── test_graph_api.py            # Phase 2: graph endpoints
│   ├── test_query_api.py            # Phase 3: query engine
│   ├── test_phase4.py               # Phase 4: multi-runbook (24 tests)
│   └── test_phase6.py               # Phase 6: auth + RBAC (22 tests)
│
├── docs/sample_pdfs/                # 11 enterprise Kubernetes runbook PDFs
│   ├── k8s-pod-crashloop-recovery.pdf
│   ├── k8s-oomkilled-recovery.pdf
│   ├── k8s-node-not-ready.pdf
│   ├── k8s-deployment-rollout-stuck.pdf
│   ├── k8s-pvc-pending.pdf
│   ├── k8s-certificate-expiry.pdf
│   ├── k8s-ingress-503.pdf
│   ├── k8s-etcd-disk-full.pdf
│   ├── k8s-hpa-not-scaling.pdf
│   ├── k8s-namespace-stuck-terminating.pdf
│   └── k8s-rbac-permission-denied.pdf
│
└── ui/                              # Angular 21 frontend
    └── src/app/
        ├── components/
        │   ├── auth/                # Login + Register
        │   ├── nav/                 # Navigation bar
        │   ├── dashboard/           # Health + stats
        │   ├── runbooks/            # Runbook list with filters
        │   ├── runbook-detail/      # Steps, graph, rollback tabs
        │   ├── ingest/              # PDF upload + job polling
        │   ├── query/               # Incident query interface
        │   └── multi/               # Merge, conflicts, compound
        ├── services/
        │   ├── api.service.ts       # All HTTP calls
        │   └── auth.service.ts      # JWT storage, login, logout
        ├── guards/auth.guard.ts
        └── interceptors/auth.interceptor.ts
```

---

## Phases

| Phase | Feature | Tests | Status |
|-------|---------|-------|--------|
| 1 | PDF ingestion + LLM structured extraction | 13 | ✅ |
| 2 | NetworkX dependency graph | 18 | ✅ |
| 3 | Incident query engine (3-tier SQL match) | 12 | ✅ |
| 4 | Multi-runbook reasoning, conflict detection, compound incidents | 24 | ✅ |
| 5 | Angular 21 UI — Apple aesthetic | — | ✅ |
| 6 | JWT auth + multi-tenant RBAC | 22 | ✅ |

**Total: 137 tests, all passing.**

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Create tenant + first admin user |
| POST | `/auth/login` | — | Returns JWT access token |
| GET | `/auth/me` | Bearer | Current user profile |
| POST | `/auth/users` | admin | Create user in tenant |
| GET | `/auth/users` | admin | List users in tenant |
| PUT | `/auth/users/{id}/role` | admin | Update user role |

### Ingest

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/ingest/upload` | editor+ | Upload PDF, starts background extraction |
| GET | `/ingest/job/{id}` | — | Poll extraction job status |

### Runbooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/runbooks` | — | List with category/severity filters |
| GET | `/runbooks/stats` | — | Counts by category and severity |
| GET | `/runbooks/{id}` | — | Full runbook with steps |
| GET | `/runbooks/{id}/steps` | — | Steps + rollback steps |

### Graph

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/graph/{id}` | — | Critical path, parallel groups, bottlenecks |
| GET | `/graph/{id}/execution-order` | — | Topologically sorted step list |
| GET | `/graph/{id}/failure-impact/{step}` | — | Steps blocked if this step fails |

### Query

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/query` | — | Describe incident → get runbook steps + triage summary |

### Multi-Runbook

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/multi/merge` | — | Merge N runbooks into composite plan |
| POST | `/multi/conflicts` | — | Check for conflicting commands across runbooks |
| POST | `/multi/compound` | — | Decompose compound incident + full plan |
| GET | `/multi/runbooks/{id}/similar` | — | Find runbooks in same category/severity |

---

## RBAC Roles

| Role | Permissions |
|------|-------------|
| `viewer` | Read runbooks, query incidents |
| `editor` | viewer + upload PDFs |
| `admin` | editor + manage users in their tenant |
| `superadmin` | admin + manage all tenants |

Hierarchy: `viewer < editor < admin < superadmin`

---

## Running Locally

### 1. Backend

```bash
cd runbook-ai
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export DEEPSEEK_API_KEY=sk-...       # or ANTHROPIC_API_KEY + LLM_PROVIDER=anthropic

uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

### 2. Frontend

```bash
cd runbook-ai/ui
npm install
npm start
```

- UI: http://localhost:4200

### 3. Register your first user

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "Your Company",
    "tenant_slug": "your-company",
    "email": "admin@yourcompany.com",
    "password": "YourPassword123!",
    "full_name": "Your Name"
  }'
```

This creates your tenant and the first admin account. Then sign in at http://localhost:4200/login.

### 4. Run tests

```bash
cd runbook-ai
source venv/bin/activate
python -m pytest tests/ -q
# Expected: 137 passed
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `runbookai.db` | SQLite file path |
| `LLM_PROVIDER` | `deepseek` | `deepseek` or `anthropic` |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `JWT_SECRET` | dev default | **Change in production** |
| `ACCESS_TOKEN_EXPIRE_SECONDS` | `86400` | JWT expiry (24 hours) |
