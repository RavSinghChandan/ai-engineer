# RunbookAI

**Enterprise IT Runbook & Incident Response Assistant — RAGless + Multi-Source Architecture**

Zero vectors. Zero embeddings. Zero hallucinated commands. Three knowledge sources compared and ranked for every incident.

---

## What Problem Does This Solve?

When an on-call engineer gets paged at 3 AM:

- They need the **exact** `kubectl` command to run — not a paraphrase
- They need the steps **in order** — Step 3 cannot run before Step 2
- They need to know which steps can run **in parallel** — to save time
- They need **both** their internal company runbook **and** the official Kubernetes docs — compared, conflict-checked, and prioritised

Traditional AI search (RAG/vector search) cannot reliably do any of these.  
RunbookAI extracts runbook structure **once** at upload time and answers queries with **deterministic SQL + graph traversal**. The LLM never touches commands at query time.

**No login required** — open the UI and start querying immediately.

---

## Multi-Source Knowledge Architecture (Phase 7)

Every query now returns **three ranked panels** side by side:

| Panel | Source | Color | Priority | When to use |
|-------|--------|-------|----------|-------------|
| **Internal** | Your company's uploaded runbooks | Green | 1 — First | Verified on your infrastructure |
| **Combined** | Steps both sources agree on | Purple | 2 — Second | Highest confidence — both teams aligned |
| **Official** | kubernetes.io / official docs | Blue | 3 — Fallback | Generic — use if internal steps don't apply |

### Conflict Detection

When internal and official steps disagree, RunbookAI surfaces the conflict with severity and recommendation:

| Conflict Type | Example | Severity |
|--------------|---------|----------|
| `VALUE_CONFLICT` | Internal uses `timeout=30s`, official uses `timeout=60s` | HIGH |
| `ORDER_CONFLICT` | Internal drains before cordoning, official does the reverse | HIGH |
| `MISSING_STEP` | Official has a pre-flight check not in internal runbook | MEDIUM |
| `EXTRA_STEP` | Internal has infra-specific steps not in official docs | LOW |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          RUNBOOK AI SYSTEM                              │
│                                                                         │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────────────────┐   │
│  │  Angular  │    │   FastAPI   │    │      Background Worker       │   │
│  │  UI :4200 │◄──►│  API :8000  │◄──►│   LangGraph Pipeline         │   │
│  └──────────┘    └──────┬──────┘    └──────────┬─────────────────  ┘   │
│                         │                       │                       │
│              ┌──────────▼──────────┐            │                       │
│              │    SQLite Database   │◄───────────┘                      │
│              │  runbooks           │                                    │
│              │  steps              │   source_type: internal | official │
│              │  runbook_conflicts  │   conflicts: VALUE | ORDER |        │
│              │  ingest_jobs        │             MISSING | EXTRA        │
│              │  graph_cache        │                                    │
│              └──────────┬──────────┘                                   │
│                         │                                               │
│         ┌───────────────┼──────────────────┐                           │
│         ▼               ▼                  ▼                           │
│  ┌─────────────┐ ┌─────────────┐  ┌───────────────────┐               │
│  │  NetworkX   │ │  K8s Docs   │  │  Conflict Detector │               │
│  │  DiGraph    │ │  Scraper    │  │  (regex + order)   │               │
│  │  critical   │ │  10 pages   │  │  Populates         │               │
│  │  path,      │ │  from       │  │  runbook_conflicts │               │
│  │  parallel   │ │  k8s.io     │  │  table             │               │
│  │  groups     │ └─────────────┘  └───────────────────┘               │
│  └─────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### How the layers interact

| Layer | What it does | Technology |
|-------|-------------|------------|
| **Extraction** | Reads PDF text, calls LLM once to produce strict JSON (title, steps, commands, dependencies), stores permanently | pdfplumber + DeepSeek + LangGraph |
| **Official Connector** | Scrapes 10 Kubernetes docs pages from kubernetes/website GitHub, extracts steps via LLM, stores as `source_type='official'` | urllib + DeepSeek |
| **Conflict Detector** | Compares internal vs official runbooks by category, detects VALUE/ORDER/MISSING/EXTRA conflicts, populates `runbook_conflicts` table | Python regex + SQLite |
| **Storage** | All runbook data with full fidelity. Commands stored verbatim — never re-generated | SQLite (WAL mode) + NetworkX |
| **Query** | Classifies incident text, SQL match, builds 3 panels + conflict list, LLM writes 2-3 sentence summary only | FastAPI + LangGraph |

---

## User Flow — Query an Incident

```
Engineer types: "Pods are stuck in CrashLoopBackOff in the payments namespace"
         │
         │  POST /query  { "incident": "..." }
         ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 1 — Classify (LLM)                                │
  │  → { category: "kubernetes", severity: "P1",            │
  │      search_terms: ["CrashLoopBackOff", "pod crash"] }  │
  └──────────────────────────┬──────────────────────────────┘
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 2 — 3-Tier SQL Match (no vectors)                 │
  │  Tier 1: category + severity → HIGH confidence          │
  │  Tier 2: category only → MEDIUM confidence              │
  │  Tier 3: keyword LIKE → LOW confidence                  │
  └──────────────────────────┬──────────────────────────────┘
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  STEP 3 — Build Multi-Source Response                   │
  │                                                         │
  │  Internal panel  → fetch steps from source_type=internal│
  │  Official panel  → fetch steps from source_type=official│
  │  Combined panel  → steps where titles overlap ≥ 40%     │
  │  Conflicts       → load from runbook_conflicts table     │
  │  Triage summary  → LLM writes 2 sentences only          │
  └──────────────────────────┬──────────────────────────────┘
                             ▼
  Response: { internal: {...}, combined: {...}, official: {...},
              conflicts: [...], has_conflicts: true }
```

**What the engineer sees:**

```
Triage Summary  |  Steps (8)  |  Execution Graph  |  Multi-Source ●

  ● Internal  7 steps  PRIORITY 1   ● Combined  2 steps  PRIORITY 2   ● Official  8 steps  PRIORITY 3

  ┌─────────────────────────────────────────────────────────┐
  │ YOUR INTERNAL RUNBOOK    K8S Pod Crashloop Recovery      │ ← green header
  │ Follow this first — verified on your infrastructure      │
  │                                                         │
  │  1  Identify the Affected Pod                           │
  │     kubectl get pods -n payments | grep CrashLoopBackOff│
  │  2  Inspect Pod Events                                  │
  │     kubectl describe pod <name> -n payments             │
  │  ...                                                    │
  └─────────────────────────────────────────────────────────┘

  ⚠ 2 conflicts detected between internal and official runbooks
  VALUE_CONFLICT  HIGH  timeout: internal=30s, official=60s
  ORDER_CONFLICT  HIGH  internal drains before cordoning; official reverses this
```

---

## Running Locally — No Account Needed

### 1. Backend

```bash
cd runbook-ai
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

export DEEPSEEK_API_KEY=sk-...

uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd runbook-ai/ui
npm install
npm start
```

Open **http://localhost:4200** — no login, no account, straight to the dashboard.

### 3. (Optional) Re-scrape official docs

```bash
cd runbook-ai
python3 connectors/k8s_docs_scraper.py
```

### 4. (Optional) Re-run conflict detection

```bash
cd runbook-ai
python3 connectors/conflict_detector.py
```

---

## Project Structure

```
runbook-ai/
├── main.py
├── requirements.txt
│
├── agents/
│   ├── classify_agent.py            # LLM → title, category, severity, tags
│   ├── steps_agent.py               # LLM → steps[], commands[], depends_on[]
│   ├── validate_agent.py
│   ├── incident_classifier_agent.py # LLM → category, severity, search_terms
│   ├── runbook_matcher_agent.py     # 3-tier SQL match
│   ├── response_composer_agent.py   # Ordered steps from DB + triage summary
│   └── multi_source_composer.py     # Builds internal / combined / official panels
│
├── connectors/
│   ├── k8s_docs_scraper.py          # Scrapes 10 kubernetes.io pages → official runbooks
│   └── conflict_detector.py         # Compares internal vs official, populates conflicts
│
├── graph/
│   ├── pipeline.py                  # Ingest: classify → steps → validate
│   ├── query_pipeline.py            # Query: classify → match → compose
│   ├── dependency_graph.py          # NetworkX: critical path, parallel groups
│   └── state.py / query_state.py
│
├── database/
│   ├── db.py                        # SQLite + migrations (incl. runbook_conflicts table)
│   ├── runbooks_store.py
│   └── users_store.py
│
├── routers/
│   ├── query_router.py              # /query — returns panels + conflicts
│   ├── runbooks_router.py           # /runbooks — list with source_type filter
│   └── ...
│
├── docs/
│   ├── sample_pdfs/                 # 12 enterprise Kubernetes runbook PDFs
│   └── WHAT_IS_RUNBOOKAI.md         # Explained for CEO, CTO, VP, angry client, class 6 student
│
└── ui/                              # Angular 21 frontend (no login required)
    └── src/app/
        ├── components/
        │   ├── dashboard/           # 22 runbooks: 12 internal + 10 official K8s
        │   ├── runbooks/            # List with Source column: Internal/Official/Combined badges
        │   ├── query/               # Incident query + three-panel multi-source view
        │   ├── ingest/              # PDF upload + job polling
        │   └── multi/               # Merge, conflicts, compound incidents
        └── models/runbook.model.ts  # QueryResult, MultiSourcePanels, SourcePanel, PanelConflict
```

---

## API Reference

### Query

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/query` | Describe incident → triage + steps + 3 panels + conflicts |
| POST | `/query/classify` | Classify only — preview category/severity |
| POST | `/query/match` | Classify + match — top runbooks with confidence scores |

### Runbooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/runbooks` | List with category/severity filters (includes source_type) |
| GET | `/runbooks/stats` | Counts by category, severity, source_type |
| GET | `/runbooks/{id}` | Full runbook with steps |

### Ingest

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ingest/upload` | Upload PDF → background extraction |
| GET | `/ingest/job/{id}` | Poll extraction status |

### Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/graph/{id}` | Critical path, parallel groups, bottlenecks |
| GET | `/graph/{id}/execution-order` | Topological step order |

---

## Phases

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | PDF ingestion + LLM structured extraction | ✅ |
| 2 | NetworkX dependency graph | ✅ |
| 3 | Incident query engine (3-tier SQL match) | ✅ |
| 4 | Multi-runbook reasoning, conflict detection, compound incidents | ✅ |
| 5 | Angular 21 UI | ✅ |
| 6 | JWT auth + multi-tenant RBAC | ✅ |
| 7 | Multi-source architecture: Official K8s docs + conflict detection + 3-panel UI | ✅ |

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
