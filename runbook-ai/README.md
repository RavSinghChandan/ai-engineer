# RunbookAI

**Enterprise IT Runbook & Incident Response Assistant — RAGless Architecture**

Zero vectors. Zero embeddings. Zero hallucinated commands.  
PDF → LLM structured extraction → SQLite + NetworkX graph → deterministic SQL + graph traversal.

---

## What is RAGless?

Traditional RAG (Retrieval-Augmented Generation) chunks documents, embeds them into vectors, and retrieves similar chunks at query time. For IT runbooks this fails because:

- Step ordering matters — chunking breaks it
- Commands must be 100% exact — similarity is lossy
- Dependency chains need graph traversal — vectors cannot do this

**RunbookAI's approach:**
1. LLM extracts structure **once** at ingest time → strict JSON schema
2. Everything stored in SQLite with full fidelity
3. All queries are deterministic SQL + NetworkX graph traversal
4. LLM only writes the 2-3 sentence triage summary — **commands always come from the DB**

---

## Architecture

```
PDF Upload
    │
    ▼
pdfplumber (text + tables)
    │
    ▼
LangGraph Extraction Pipeline
    ├── classify_agent    → title, category, severity, tags, duration
    ├── steps_agent       → steps[], commands[], depends_on[], timeout
    └── validate_agent    → cycle check, command completeness
    │
    ▼
SQLite Storage
    ├── tenants           → multi-tenant isolation
    ├── users             → JWT auth + RBAC
    ├── runbooks          → metadata, tenant_id
    ├── steps             → commands[], depends_on[], is_rollback
    ├── ingest_jobs       → status polling
    └── graph_cache       → critical_path, parallel_groups
    │
    ▼
NetworkX DiGraph
    ├── critical_path     → dag_longest_path
    ├── parallel_groups   → topological_generations
    ├── bottleneck_steps  → high out_degree nodes
    └── failure_impact    → descendants(failed_step)
    │
    ▼
Query / Multi-Runbook APIs
    ├── 3-tier SQL match  → HIGH (category+severity) → MEDIUM → LOW (LIKE)
    ├── conflict_detector → regex on exact commands (scale, service, network)
    ├── merger_agent      → domain priority ordering + rollback sequence
    └── compound_incident → LLM decomposes → SQL match per domain → merge
```

---

## Project Structure

```
runbook-ai/
├── main.py                          # FastAPI app, routers, health endpoint
├── requirements.txt                 # Python dependencies
│
├── agents/
│   ├── classify_agent.py            # LLM: title, category, severity, tags
│   ├── steps_agent.py               # LLM: structured step extraction
│   ├── validate_agent.py            # Validates commands, checks for cycles
│   ├── incident_classifier_agent.py # Classifies free-text incident description
│   ├── runbook_matcher_agent.py     # 3-tier SQL matching (no vectors)
│   ├── response_composer_agent.py   # Builds triage response from DB steps
│   ├── conflict_detector_agent.py   # Regex-based cross-runbook conflict detection
│   ├── compound_incident_agent.py   # LLM decomposes multi-domain incidents
│   └── multi_runbook_merger_agent.py # Merges N runbooks with domain ordering
│
├── graph/
│   ├── state.py                     # ExtractionState TypedDict
│   ├── pipeline.py                  # LangGraph: classify→steps→validate
│   ├── query_state.py               # QueryState TypedDict
│   ├── query_pipeline.py            # LangGraph: classify→match→compose
│   └── dependency_graph.py          # NetworkX: critical path, parallel groups
│
├── database/
│   ├── db.py                        # SQLite connection, init_db, migrations
│   ├── models.py                    # DDL: tenants, users, runbooks, steps, jobs
│   ├── runbooks_store.py            # CRUD: runbooks, steps, ingest_jobs
│   ├── graph_store.py               # Graph cache build and retrieval
│   └── users_store.py               # CRUD: tenants, users (Phase 6)
│
├── routers/
│   ├── deps.py                      # FastAPI deps: require_auth, require_role
│   ├── auth_router.py               # /auth/* — register, login, me, users
│   ├── tenant_router.py             # /tenants/* — me, list (superadmin)
│   ├── ingest_router.py             # /ingest/upload, /ingest/job/{id}
│   ├── runbooks_router.py           # /runbooks — list, stats, detail, steps
│   ├── graph_router.py              # /graph/{id} — dependency analysis
│   ├── query_router.py              # /query — incident → runbook steps
│   └── multi_runbook_router.py      # /multi — merge, conflicts, compound
│
├── extractor/
│   └── pdf_extractor.py             # pdfplumber: text + table extraction
│
├── utils/
│   ├── llm.py                       # DeepSeek/Anthropic API (urllib, no SDK)
│   └── auth.py                      # bcrypt hashing, JWT sign/verify
│
├── tests/
│   ├── test_api.py                  # Phase 1-3: ingest, runbooks, health
│   ├── test_graph_api.py            # Phase 2: dependency graph endpoints
│   ├── test_query_api.py            # Phase 3: incident query engine
│   ├── test_phase4.py               # Phase 4: multi-runbook reasoning (24 tests)
│   └── test_phase6.py               # Phase 6: auth, RBAC, tenant isolation (22 tests)
│
├── docs/
│   └── sample_pdfs/                 # Sample runbook PDFs for testing
│
└── ui/                              # Angular 21 frontend (Phase 5-6)
    └── src/app/
        ├── components/
        │   ├── auth/                # Login + Register page
        │   ├── nav/                 # Top navigation bar
        │   ├── dashboard/           # Health + stats overview
        │   ├── runbooks/            # Filterable runbook list
        │   ├── runbook-detail/      # Steps, graph, rollback tabs
        │   ├── ingest/              # PDF upload + job polling
        │   ├── query/               # Incident query interface
        │   └── multi/               # Merge, conflicts, compound
        ├── services/
        │   ├── api.service.ts       # All backend HTTP calls
        │   └── auth.service.ts      # JWT storage, login, logout
        ├── guards/auth.guard.ts     # Route protection
        └── interceptors/auth.interceptor.ts  # Auto Bearer token
```

---

## Phases

| Phase | Feature | Tests | Status |
|-------|---------|-------|--------|
| 1 | PDF ingestion + LLM structured extraction | 13 | ✅ |
| 2 | NetworkX dependency graph (critical path, parallel groups) | 18 | ✅ |
| 3 | Incident query engine (3-tier SQL match + graph response) | 12 | ✅ |
| 4 | Multi-runbook reasoning, conflict detection, compound incidents | 24 | ✅ |
| 5 | Angular 21 UI — Apple aesthetic, all pages | — | ✅ |
| 6 | JWT auth + multi-tenant RBAC + Angular login | 22 | ✅ |

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

### Tenants

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/tenants/me` | Bearer | Tenant info + usage stats |
| GET | `/tenants` | superadmin | List all tenants |

### Runbooks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/runbooks` | optional | List with category/severity filters |
| GET | `/runbooks/stats` | optional | Counts by category and severity |
| GET | `/runbooks/{id}` | optional | Full runbook with steps |
| GET | `/runbooks/{id}/steps` | optional | Steps + rollback steps only |

### Ingest

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/ingest/upload` | optional | Upload PDF, starts background extraction |
| GET | `/ingest/job/{id}` | optional | Poll extraction job status |

### Graph

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/graph/{id}` | optional | Critical path, parallel groups, bottlenecks |
| GET | `/graph/{id}/execution-order` | optional | Topologically sorted step list |
| GET | `/graph/{id}/failure-impact/{step}` | optional | Steps blocked if this step fails |

### Query

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/query` | optional | Describe incident → get runbook steps + triage summary |

### Multi-Runbook

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/multi/merge` | optional | Merge N runbooks into composite plan |
| POST | `/multi/conflicts` | optional | Check for conflicting commands |
| POST | `/multi/compound` | optional | Decompose compound incident + full plan |
| GET | `/multi/runbooks/{id}/similar` | optional | Find runbooks in same category/severity |

---

## RBAC Roles

| Role | Can do |
|------|--------|
| `viewer` | Read runbooks, query incidents |
| `editor` | viewer + upload PDFs |
| `admin` | editor + manage users in their tenant |
| `superadmin` | admin + manage all tenants |

Hierarchy: `viewer < editor < admin < superadmin`

---

## Running Locally

### Backend

```bash
cd runbook-ai
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set your LLM key (DeepSeek or Anthropic)
export DEEPSEEK_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...

uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd runbook-ai/ui
npm install
npm start
```

UI: http://localhost:4200

### Tests

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
| `JWT_SECRET` | dev default | Change in production |
| `ACCESS_TOKEN_EXPIRE_SECONDS` | `86400` | JWT expiry (24h) |

---

## Key Design Decisions

**Why no vectors?**
- IT runbook steps must execute in exact order — chunking destroys order
- Commands like `kubectl scale deployment/myapp --replicas=0` must be stored and returned verbatim — similarity search could return a wrong command
- Dependency graph reasoning (critical path, parallel execution) requires graph traversal, not nearest-neighbor search

**Why LLM only at ingest + summary?**
- At ingest: LLM extracts structured data once → stored in DB permanently
- At query: SQL + graph traversal finds the right runbook → LLM writes 2-3 sentence triage summary
- Commands in responses always carry `"commands_source": "database"` — fully auditable

**Why NetworkX?**
- `topological_sort` gives safe execution order
- `dag_longest_path` gives critical path (minimum time)
- `topological_generations` gives parallel execution waves
- `descendants(failed_step)` gives blast radius of a failure
- All deterministic — same input always gives same output

**Conflict detection without LLM:**
- Pure regex on exact command strings
- Patterns: `kubectl scale`, `systemctl start/stop`, `docker start/stop`, `ip link set up/down`, `DROP/CREATE TABLE`
- Fully deterministic — no hallucination risk on safety-critical conflict detection
