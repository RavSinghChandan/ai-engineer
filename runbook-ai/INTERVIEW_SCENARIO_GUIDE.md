# RunbookAI — Interview Scenario Guide
> Built by Chandan Kumar · Senior AI Engineer

---

## One-Minute Pitch (memorise this cold)

"RunbookAI is a **RAGless incident response platform** for Kubernetes.
When a pod crashes at 2AM, even an intern can open the app, type the incident in plain English,
and get back the exact kubectl commands to stabilise production — no guessing, no hallucination.

The system uses a 3-tier SQL matcher to find the right runbook, a NetworkX dependency graph for
safe execution order, and a 3-panel priority display: your company's internal steps first,
official Kubernetes docs second, and a combined consensus view third.

Every single command comes verbatim from the database. The LLM writes only the triage summary —
never the commands. 153 tests, 25 Kubernetes runbooks covering every major failure mode,
JWT RBAC multi-tenant auth, and a full metrics dashboard."

---

## 1. Core Architecture

### What is RAGless? Why not use RAG?

"RAG is probabilistic — it embeds text, does cosine similarity, retrieves 'nearby' chunks.
For incident response that's dangerous. You don't want a 'semantically similar' command —
you want the exact verified command your SRE team has battle-tested.

RunbookAI uses structured SQL matching instead:
- Category + severity exact match (HIGH confidence)
- Title keyword match — cross-severity, so CrashLoopBackOff P1 is found even if LLM says P2
- Category fallback (MEDIUM confidence)

Every kubectl command is stored in the database verbatim. The LLM never generates commands."

### The 3-Tier SQL Matcher (show this file: `agents/runbook_matcher_agent.py`)

```
Tier 1 — Title keyword match  → searches across ALL severities (HIGH)
Tier 2 — Exact category+severity → P1/P2/P3 bucket match (HIGH)
Tier 3 — Category-only fallback → fills remaining slots (MEDIUM)
```

**Why keyword first?** The LLM classifier sometimes mis-classifies severity.
A CrashLoopBackOff incident may be classified P2 by the LLM, but the runbook is P1.
Title keyword match runs cross-severity and is always promoted to the front.

Tenant isolation: `(tenant_id=? OR tenant_id IS NULL OR source_type='official')` —
each tenant sees only their own runbooks plus shared official K8s docs.

### The 3-Panel Priority System (show this file: `agents/multi_source_composer.py`)

| Panel | Color | What it shows | When to use |
|-------|-------|---------------|-------------|
| Priority 1 — Internal | Green | Your company's uploaded runbook ONLY | Always start here (~90% resolution) |
| Priority 2 — Official | Blue | Official kubernetes.io docs ONLY | If internal steps don't resolve |
| Priority 3 — Combined | Purple | Steps agreed by BOTH sources | Highest confidence, cross-validated |

**Key rule: ZERO mixing between panels.** Each panel is completely self-contained.
Internal commands never appear in Official. Official text never appears in Internal.

### Dependency Graph (show this file: `graph/dependency_graph.py`)

Uses **NetworkX DiGraph**:
- Each step is a node
- `depends_on` field creates directed edges
- Topological sort gives safe execution order
- Parallel groups: steps with no dependency between them can run simultaneously
- Cycle detection with fallback to step-number order

**Interview line:** "We don't just give you steps — we give you the safe order to run them.
Step 3 might depend on Step 2's output. The graph tells you that. An intern can follow it blindly."

---

## 2. LangGraph Pipeline

### Query Pipeline (show: `graph/query_pipeline.py`)

```
classify → match → compose
```

| Node | What it does | LLM involved? |
|------|-------------|---------------|
| classify | Extracts category, severity, search_terms | YES — structured JSON extraction |
| match | 3-tier SQL query | NO — pure SQL |
| compose | Topological sort + DB step fetch | NO — graph + DB |

**Panel composition** (`build_multi_source_response`) runs AFTER the pipeline, in the router.
It finds the official K8s docs counterpart for the matched internal runbook.

### Ingest Pipeline (show: `graph/ingest_pipeline.py`)

```
classify_doc → extract_steps → validate_steps → save_to_db → build_graph
```

LLM is used only for extraction (classify_doc, extract_steps).
Validation checks for missing commands, empty titles, step number gaps.
Graph is built and stored immediately after ingest.

---

## 3. The 25 Kubernetes Runbooks

| # | Incident | Severity | Steps |
|---|---------|---------|-------|
| 1 | Pod CrashLoopBackOff Recovery | P1 | 7 |
| 2 | Cluster Certificate Expiry | P1 | 6 |
| 3 | Deployment Rollout Stuck | P2 | 6 |
| 4 | Ingress 503 Service Unavailable | P2 | 6 |
| 5 | OOMKilled Pod Recovery | P1 | 6 |
| 6 | Namespace Stuck Terminating | P3 | 6 |
| 7 | PersistentVolumeClaim Pending | P2 | 6 |
| 8 | HorizontalPodAutoscaler Not Scaling | P2 | 6 |
| 9 | Node NotReady Recovery | P1 | 7 |
| 10 | RBAC Permission Denied | P2 | 6 |
| 11 | Pod CrashLoopBackOff (duplicate/tenant) | P1 | 7 |
| 12 | etcd Disk Full / Quota Exceeded | P1 | 6 |
| 13–22 | Official K8s Docs (10 topics) | — | 6–7 each |

Plus 10 official Kubernetes documentation runbooks auto-scraped and stored.

---

## 4. Auth & Multi-Tenancy

### JWT RBAC (show: `routers/auth_router.py`, `routers/deps.py`)

```
POST /auth/login → JWT token (HS256, 24h expiry)
GET  /runbooks   → optional auth (public view)
POST /ingest/upload → requires editor or admin role
DELETE /runbooks/{id} → requires admin role
```

Three roles: `viewer`, `editor`, `admin`
Three tenants in demo: tenant 1 (main), tenant 3 (second company)
Official K8s docs are shared — no tenant scope.

**Interview answer for "how do you prevent cross-tenant data leaks?"**
"Every SQL query in the matcher and composer includes `(tenant_id=? OR tenant_id IS NULL OR source_type='official')`.
A tenant 2 engineer can never see tenant 1's runbooks. Official docs are shared because they're public knowledge."

---

## 5. Conflict Detection

### What is a conflict? (show: `agents/conflict_detector.py`)

When your internal runbook and the official K8s docs disagree, the system detects:

| Conflict Type | Example |
|--------------|---------|
| VALUE_CONFLICT | Internal says `--grace-period=30`, official says `--grace-period=0` |
| ORDER_CONFLICT | Internal deletes namespace before removing finalizers; official does it after |
| MISSING_STEP | Internal skips the `kubectl drain` step that official requires |
| EXTRA_STEP | Internal has a custom health-check step not in official docs |

Conflicts are stored in `runbook_conflicts` table and surfaced in the Combined panel.
The triage summary flags conflicts so the intern knows to escalate before executing.

---

## 6. Metrics & Observability

### What metrics does RunbookAI track? (show: `utils/metrics.py`, GET `/metrics`)

- `total_queries` — total incidents queried
- `queries_by_category` — kubernetes vs database vs networking breakdown
- `queries_by_confidence` — HIGH/MEDIUM/LOW/NONE distribution
- `avg_latency_ms` — end-to-end query response time
- `rate_limit_hits` — throttle events
- `error_rate` — failed query percentage
- `top_incidents` — most common incident types searched

**Interview line:** "I can show you that 92% of our incidents are resolved at HIGH confidence —
meaning the exact runbook is found. The 8% LOW confidence cases are the ones we use to know
which runbooks are still missing."

---

## 7. Security

| Layer | Implementation |
|-------|---------------|
| Auth | JWT HS256, 24h expiry, role-based |
| Multi-tenant | `tenant_id` scoped SQL on every query |
| Rate limiting | 20 queries/minute per IP on `/query` |
| Input validation | Pydantic models, max 2000 chars incident text |
| SQL injection | Parameterised queries everywhere, LIKE wildcard escaping |
| CORS | Configurable `ALLOWED_ORIGINS` env var |

---

## 8. Tech Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI + Uvicorn |
| Orchestration | LangGraph (DAG pipeline) |
| Graph analysis | NetworkX DiGraph |
| LLM | DeepSeek deepseek-chat (OpenAI-compatible SDK) |
| Database | SQLite (local), PostgreSQL-ready |
| Auth | JWT (python-jose), bcrypt |
| Testing | pytest, 153 tests |
| Frontend | Angular 17 standalone components |

---

## 9. Live Demo Script (4 minutes)

### Step 1 — Show the landing (30s)
"This is RunbookAI. No login needed for queries — that's intentional.
At 2AM, an intern shouldn't need to remember credentials."

### Step 2 — Type a CrashLoopBackOff incident (60s)
Type: `Pods stuck in CrashLoopBackOff in payments namespace`

Point to:
- Classification panel: `category=kubernetes, severity=P1`
- Matched runbooks list: `Kubernetes Pod CrashLoopBackOff Recovery — HIGH confidence`
- Internal steps panel (green): 7 steps with real kubectl commands
- First command: `kubectl get pods -n <namespace> | grep CrashLoopBackOff`

"Every command is from the database. The LLM didn't write a single one."

### Step 3 — Show the panels (60s)
- Green panel: "This is what your team has validated on your infrastructure. Use this first."
- Blue panel: "If this doesn't work, official Kubernetes docs say..."
- Purple panel: "These 3 steps appear in BOTH — highest confidence."

### Step 4 — Show the dependency graph (30s)
Go to `GET /runbooks/{id}/graph`
"The graph tells you which steps must complete before others start.
Steps 1 and 2 can run in parallel. Step 5 must wait for Step 3."

### Step 5 — Ingest a new runbook (30s)
"A new runbook PDF → 90 seconds → it's queryable. The intern never touches SQL."

### Step 6 — Show metrics (30s)
`GET /metrics` → "92% HIGH confidence, avg 1.2s response time, 0 errors in last 100 queries."

---

## 10. Hard Interview Questions

**Q: What happens if the LLM mis-classifies the severity?**
"The keyword title matcher runs cross-severity. If you say P2 but the runbook is P1,
the title match finds it first and promotes it to the top of results.
We tested 11 incident types — all 11 return the correct runbook or a usable fallback."

**Q: How do you prevent hallucinated commands?**
"The LLM has no write path to commands. Commands are stored as `TEXT NOT NULL` in the steps table
during ingest and returned verbatim. The LLM writes only the triage summary — clearly labelled
`source: 'llm-summary'`. Every step has `source: 'database'`."

**Q: What if there's no matching runbook?**
"The response includes `match_confidence: 'NONE'` and three suggestions:
1. Upload the relevant runbook PDF
2. Rephrase the incident description
3. Browse available runbooks at `GET /runbooks`
We never return empty hands."

**Q: Can this scale beyond Kubernetes?**
"The category field supports: kubernetes, networking, database, security, storage, cicd, monitoring.
The same pipeline works for any category — just ingest runbooks for that domain.
The 3-panel system and dependency graph are domain-agnostic."

**Q: Why SQLite not PostgreSQL?**
"For interview demos: zero infrastructure, start in 3 seconds.
The DB layer is abstracted via `database/db.py` — swap `sqlite3` for `psycopg2`
and change the `DATABASE_PATH` env var. The store and query code don't change."

**Q: How does the intern know WHICH panel to follow?**
"The triage summary tells them in plain English:
'Start with the Internal panel. If unresolved after 15 minutes, consult Official Docs.
The Combined panel shows what both sources agree on — execute those with highest confidence.
2 conflicts detected — escalate to SRE lead before step 4.'"

**Q: What does the dependency graph give you that a numbered list doesn't?**
"Safety and speed. Safety: the graph prevents an intern from running step 5 before step 3
finishes (e.g. restarting a pod before the PVC is bound). Speed: steps 1, 2, and 3 have no
dependencies between them — they can run in three terminal tabs in parallel.
A numbered list doesn't tell you either of those things."

---

## 11. Numbers to Memorise

| Metric | Value |
|--------|-------|
| Tests | 153 |
| Test pass rate | 152/153 (99.3%) — 1 test-ordering flakiness |
| Kubernetes runbooks | 25 (12 internal + 10 official + 3 multi-tenant) |
| Steps in DB | 195 |
| Incident scenarios tested | 11/11 PASS |
| Average internal steps per runbook | 6–7 |
| Query pipeline nodes | 3 (classify → match → compose) |
| Ingest pipeline nodes | 5 (classify → extract → validate → save → graph) |
| Conflict types detected | 4 (VALUE, ORDER, MISSING, EXTRA) |
| JWT expiry | 24 hours |
| Rate limit | 20 queries/minute per IP |
| Port | 8005 |

---

## 12. Files Map — "Show me the code for X"

| Topic | File |
|-------|------|
| 3-tier SQL matcher | `agents/runbook_matcher_agent.py` |
| 3-panel composer | `agents/multi_source_composer.py` |
| Incident classifier | `agents/incident_classifier_agent.py` |
| Conflict detector | `agents/conflict_detector.py` |
| Dependency graph | `graph/dependency_graph.py` |
| Query pipeline (LangGraph) | `graph/query_pipeline.py` |
| Ingest pipeline (LangGraph) | `graph/ingest_pipeline.py` |
| Query API endpoint | `routers/query_router.py` |
| JWT auth & RBAC | `routers/auth_router.py` + `routers/deps.py` |
| Metrics collection | `utils/metrics.py` |
| DB schema + init | `database/db.py` |
| Runbook CRUD | `database/runbooks_store.py` |
| LLM wrapper | `utils/llm.py` |

---

## 13. What Makes This Enterprise-Grade

1. **Zero hallucination path for commands** — DB verbatim only
2. **Deterministic matching** — same incident → same runbook, every time, auditable
3. **Multi-tenant isolation** — `tenant_id` scoped on all queries, zero data leakage
4. **Dependency-safe execution order** — NetworkX topological sort prevents human error
5. **Conflict detection** — alerts when internal and official docs disagree before execution
6. **Rate limiting + auth** — production-ready security layer
7. **153 tests** — 99.3% pass rate, every pipeline stage independently tested
8. **11/11 K8s scenarios** — CrashLoop, OOM, Node NotReady, Cert Expiry, PVC, Ingress 503, RBAC, Namespace, Deployment, etcd, HPA — all resolved with correct runbook

---

*For questions about this guide: ravchandan15@gmail.com*
