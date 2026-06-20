# AstroIntel 360° — Enterprise Multi-Agent AI Platform

> **Built by Rav Singh Chandan · Senior AI Engineer**
> *A production-grade, full-stack AI system demonstrating LLM orchestration, multi-agent design, enterprise security, and scalable cloud architecture — end to end.*

---

## What Is This?

**AstroIntel 360°** is a personalised spiritual intelligence platform that combines **Vedic Astrology, KP Astrology, Western Astrology, Numerology (3 traditions), Palmistry, Tarot, and Vastu** into a single coherent reading — powered by a 12-agent LangGraph AI pipeline, a human-in-the-loop admin review workflow, and a branded PDF report engine.


A user submits their birth profile. Within seconds, 5 domain AI agents run in parallel, a meta-agent synthesises cross-domain consensus, an admin reviews and approves insights, and a branded 20-page PDF report is generated — with multi-language translation support.


**This is not a demo. Every layer is production-grade:**

- 4-layer security guardrail stack
- JWT + RBAC multi-tenant auth
- Semantic response caching (30-day TTL)
- Circuit breaker + graceful degradation
- Real-time KPI metrics dashboard
- GitHub Actions CI/CD → AWS ECS Fargate

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AstroIntel 360° — System Map                       │
│                                                                             │
│   ┌─────────────────┐      HTTPS / JWT       ┌──────────────────────────┐  │
│   │  Angular 17     │ ◀────────────────────▶ │   FastAPI (Python 3.11)  │  │
│   │  Frontend SPA   │                         │   Port 8080              │  │
│   │  Port 4200      │                         └─────────────┬────────────┘  │
│   │                 │                                       │               │
│   │  Pages:         │                         ┌─────────────▼────────────┐  │
│   │  · Intake       │                         │   LangGraph StateGraph   │  │
│   │  · Review       │                         │   12-Node Pipeline       │  │
│   │  · Report/PDF   │                         │                          │  │
│   │  · Metrics      │                         │  security_check          │  │
│   │  · Admin Panel  │                         │      ↓                   │  │
│   └─────────────────┘                         │  question_agent          │  │
│                                               │      ↓                   │  │
│   ┌─────────────────┐                         │  ┌──── PARALLEL ─────┐   │  │
│   │  DeepSeek LLM   │ ◀─────────────────────▶ │  │ numerology_agent  │   │  │
│   │  (Primary LLM)  │                         │  │ astrology_agent   │   │  │
│   └─────────────────┘                         │  │ palmistry_agent   │   │  │
│                                               │  │ tarot_agent       │   │  │
│   ┌─────────────────┐                         │  │ vastu_agent       │   │  │
│   │  SQLite / RDS   │ ◀─────────────────────▶ │  └───────────────────┘   │  │
│   │  PostgreSQL     │                         │      ↓                   │  │
│   └─────────────────┘                         │  meta_agent              │  │
│                                               │      ↓                   │  │
│   ┌─────────────────┐                         │  hallucination_check     │  │
│   │  In-Memory      │ ◀─────────────────────▶ │      ↓                   │  │
│   │  Semantic Cache │                         │  remedy_agent            │  │
│   └─────────────────┘                         │      ↓                   │  │
│                                               │  admin_review_agent      │  │
│   ┌─────────────────┐                         └──────────────────────────┘  │
│   │  AWS ECS        │                                                        │
│   │  S3 + CDN       │   GitHub Actions CI/CD → ECR → ECS Rolling Deploy      │
│   │  RDS / pgvector │                                                        │
│   └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The 12-Agent LangGraph Pipeline

Every user request flows through a stateful directed graph — each node is an isolated agent that reads from and writes to shared state.

```
  [INPUT]
     │
     ▼
┌──────────────────┐   Layer 1 security gate — blocks prompt injection,
│  security_check  │   PII in question field, jailbreak patterns.
└────────┬─────────┘   Raises SecurityError before any LLM sees input.
         │
         ▼
┌──────────────────┐   Parses + normalises user questions.
│  question_agent  │   RAG-based intent classification.
└────────┬─────────┘   Outputs: normalised_questions[], focus_context
         │
         ▼  ┌──────────────────────────────────────────────────────────────┐
            │              PARALLEL DOMAIN FAN-OUT                         │
            │  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐ │
            │  │ numerology    │  │  astrology     │  │   palmistry      │ │
            │  │ · Indian      │  │  · Vedic       │  │   · Indian       │ │
            │  │ · Chaldean    │  │  · KP          │  │   · Chinese      │ │
            │  │ · Pythagorean │  │  · Western     │  │   · Western      │ │
            │  └───────────────┘  └───────────────┘  └──────────────────┘ │
            │  ┌───────────────┐  ┌───────────────┐                       │
            │  │    tarot      │  │    vastu       │                       │
            │  │ · Major/Minor │  │ · Directions   │                       │
            │  │   Arcana      │  │ · 5 elements   │                       │
            │  └───────────────┘  └───────────────┘                       │
            │  Each agent: graceful degradation on failure →               │
            │  LOW-confidence placeholder, pipeline continues.             │
            └──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐   Cross-domain synthesis.
│   meta_agent     │   Consensus scoring: HIGH (≥3 domains agree) /
└────────┬─────────┘   MEDIUM (2 agree) / LOW (1 domain only).
         │
         ▼
┌─────────────────────┐  Layer 2/3 guardrail — checks for hallucination
│ hallucination_check │  signals: system prompt leakage, off-topic output,
└────────┬────────────┘  jailbreak compliance. Flags LOW-confidence outliers.
         │
         ▼
┌──────────────────┐   Generates personalised remedies: mantras, gemstones,
│  remedy_agent    │   fasting, charity, yoga & meditation, lucky colours.
└────────┬─────────┘
         │
         ▼
┌────────────────────┐  Structures all insights into AdminReview format.
│ admin_review_agent │  Each insight: id, content, confidence, domains[],
└────────┬───────────┘  is_common, editable. PII output filter applied here.
         │
         ▼
     [OUTPUT: AdminReviewResponse]
     Passed to frontend for human-in-the-loop admin approval.
```

**After admin approval, the report pipeline runs:**

```
  [Approved Insight IDs]
         │
         ▼
  plain_english_agent   ← Deterministic jargon replacement + LLM rewrite
         │                  (Lagna→rising sign, Mahadasha→main life phase…)
         ▼                  Runs ONLY at report generation time, not in pipeline.
  report_agent          ← Builds structured FinalReportPayload
         │
         ▼
  translation_agent     ← 22 Indian Constitutional languages via DeepSeek
                           story-arc markers [HOOK]/[TENSION]/[TURN]/[RESOLUTION]/[CLOSING]/[REMEDIES] preserved
                           newline-escape prevents multi-section bullet truncation
                           parallel ThreadPoolExecutor (~5–8s full report)
         │
         ▼
  [Branded 20-page PDF] ← Angular @media print CSS — no external PDF library
```

---

## Enterprise Security — 4-Layer Guardrail Stack

Security is treated as a cross-cutting concern, not an afterthought.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                               │
│                                                                         │
│  LAYER 1 — Input Validation (security_check node)                       │
│  ─────────────────────────────────────────────────                       │
│  · 12 regex patterns block prompt injection & jailbreaks                │
│  · Birth profile fields validated before any LLM call                   │
│  · Raises SecurityError → pipeline never starts on bad input            │
│  · Pattern examples:                                                    │
│      "ignore all previous instructions"                                 │
│      "you are now [not the agent role]"                                 │
│      "reveal your system prompt"                                        │
│                                                                         │
│  LAYER 2 — Prompt Hardening (every agent system prompt)                 │
│  ──────────────────────────────────────────────────────                  │
│  · SECURITY_HEADER + SECURITY_FOOTER constants injected into            │
│    every agent's system prompt via agent_prompts.py                     │
│  · Principle of least privilege: each agent only sees its own           │
│    state fields — no cross-contamination                                │
│  · Explicit override-resistance instructions                            │
│                                                                         │
│  LAYER 3 — Output Validation (hallucination_check node)                 │
│  ──────────────────────────────────────────────────────                  │
│  · System prompt leak detection                                         │
│  · Off-topic content detection (is this about astrology?)               │
│  · Jailbreak compliance detector                                        │
│  · Safety filter: forbidden phrase removal                              │
│    ("divorce is certain", "financial ruin", "will die")                 │
│                                                                         │
│  LAYER 4 — Audit + Infrastructure Isolation                             │
│  ─────────────────────────────────────────                               │
│  · Every LLM call: audit_llm_call() logs                               │
│    request_id + user_id + input_hash + output_len + cost               │
│  · Append-only audit log — application code cannot modify               │
│  · Session isolation: no state shared between users                     │
│  · Production guard: fatal exit if secrets = default placeholders       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Production Guardrails (G1–G5)

| Guardrail | What It Does | Where Wired |
|-----------|-------------|-------------|
| **G1 — Rate Limiter** | Sliding-window per-tenant (10 req/60s). Returns HTTP 429 with retry-after. | `POST /api/v1/analysis/run` |
| **G2 — Circuit Breaker** | Stops LLM calls when failure rate > threshold. Auto-resets after cooldown. | `safe_node()` wrapper on every pipeline node |
| **G3 — JSON Output Repair** | On `JSONDecodeError`, retries once with LLM repair prompt before failing. | Domain agents that parse LLM JSON |
| **G4 — PII Output Filter** | Blocks any insight that echoes back user's birth date, time, or location. | `admin_review_agent` |
| **G5 — Graceful Degradation** | Failed domain = LOW-confidence placeholder. Pipeline never crashes. | `domain_agents_parallel()` |

---

## Auth — Multi-Tenant RBAC System

```
┌───────────────────────────────────────────────────────┐
│                  AUTH SYSTEM                          │
│                                                       │
│  JWT Bearer Token ──▶ get_tenant_ctx() dependency     │
│                         │                             │
│                         ▼                             │
│             ┌─────────────────────┐                   │
│             │  TenantContext      │                   │
│             │  · tenant_id        │                   │
│             │  · role             │                   │
│             │  · permissions[]    │                   │
│             └─────────────────────┘                   │
│                                                       │
│  Roles (hierarchy):                                   │
│  ┌──────────────────────────────────────────────┐     │
│  │ SUPERADMIN — full system access              │     │
│  │   └─ create tenants, issue API keys          │     │
│  │ ADMIN — manage own tenant                    │     │
│  │   └─ review insights, approve reports        │     │
│  │ USER — run analysis, view reports            │     │
│  │   └─ read-only on own sessions               │     │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│  OTP email auth for users (Resend.com API)            │
│  API key auth for tenants                             │
│  Rate-limited OTP send (3/15min/IP — anti-spam)       │
└───────────────────────────────────────────────────────┘
```

---

## Semantic Caching — Two-Tier TTL Strategy

Instead of naive request caching, AstroIntel uses **profile-aware semantic caching**:

```python
# Birth chart data is permanent — same person, same chart forever
PROFILE_TTL = 30 days   # hash(name + DOB + TOB + place)

# Full pipeline response is session-scoped
SESSION_TTL = 20 min    # hash(profile_key + sorted_questions)
```

**Result:** Repeat readings for the same person are served instantly — zero LLM cost.
The cache also exposes a `/cache/entries` admin endpoint and per-key invalidation.

---

## Real-Time Metrics Dashboard

The metrics page tracks 10 live KPIs — all mapped to **RAGAS-style evaluation proxies**:

| Metric | Description | Interview Relevance |
|--------|-------------|---------------------|
| Pipeline Latency | P50 / P95 / P99 across all runs | Operational readiness |
| Consensus Confidence | HIGH / MEDIUM / LOW distribution | Reliability proxy |
| Hallucination Proxy | % LOW-confidence insights | LLM output quality |
| Domain Coverage | Avg domains contributing per report | System completeness |
| Faithfulness Proxy | % insights not flagged by hallucination layer | RAGAS analogue |
| Context Precision Proxy | % domains producing HIGH-confidence output | RAGAS analogue |
| Answer Relevancy Proxy | % questions with HIGH consensus | RAGAS analogue |
| Domain Recall Proxy | Active domains / 5 | RAGAS analogue |
| Error Rate | % runs with agent failures | System stability |
| Throughput | Requests/min (rolling 60s window) | Scale readiness |

---

## Plain English Agent — Jargon Simplification Engine

AI-generated spiritual insights are notoriously jargon-heavy. A custom **two-stage simplification pipeline** makes every insight readable by anyone:

```
Stage 1 — Deterministic Jargon Replacement (regex, no LLM cost)
  "Lagna"        →  "rising sign"
  "Mahadasha"    →  "main life phase"
  "Nakshatra"    →  "lunar star"
  "exalted"      →  "at its strongest"
  "retrograde"   →  "moving backward"
  "auspicious"   →  "favourable"
  "debilitated"  →  "weakened"
  "10th house"   →  "career area of your chart"
  "7th house"    →  "marriage area of your chart"
  ... (30+ patterns)

Stage 2 — LLM Rewrite (Grade-6 readable, facts preserved)
  Rules enforced in system prompt:
  · Keep all numbers, dates, planet names, timing windows
  · Max 60 words per insight
  · Active voice only ("Jupiter helps you" not "you are helped by Jupiter")
  · No absolute predictions ("this suggests" not "you WILL")
  · Warm, encouraging tone

Stage 3 — Safety Filter (post-LLM, deterministic)
  Removes entire sentences containing:
  "divorce is certain" / "financial ruin" / "will die" / "inevitable" …
  → Replaced with grounded, supportive fallback sentence.
```

**Architectural decision:** This runs ONLY at report generation time (post-admin-approval), never in the pipeline. Review page always shows raw LLM output for admin inspection.

---

## PDF Report Engine — No External Library

The 20-page branded PDF is generated entirely using **Angular's `@media print` CSS** — no Puppeteer, no wkhtmltopdf, no server-side PDF library:

```
Pages generated:
  1. Cover page          — dark gradient, client name, date, modules used
  2. Welcome letter      — personalised message from "Rav"
  3. Cosmic Blueprint    — birth chart (SVG), numerology grid, planetary positions
  4. Domain pages (per Q)— findings per tradition, confidence badges, insight bullets
  5. Remedies page       — 8-category grid: daily habits, mantras, gemstones,
                           fasting, charity, lucky colours, yoga, adjustments
  6. Thank you page      — closing message, branding
```

**Engineering challenges solved:**
- Watermarks as CSS `::after` pseudo-elements (never interfere with page flow)
- Cross-page break prevention with `break-inside: avoid`
- All font sizes doubled for print legibility without breaking screen layout
- 22 Indian Constitutional languages via `translation_agent`; story-arc markers and mantra script preserved; report page auto-detects translated language and displays in Hindi (or chosen language) without reload

---

## Tech Stack

| Layer | Technology | Decision Rationale |
|-------|-----------|-------------------|
| Frontend | Angular 17, standalone components, signals | Reactive state without NgRx complexity |
| Backend | FastAPI, Python 3.11, uvicorn | Async-native, auto-docs, type-safe |
| AI Pipeline | LangGraph StateGraph | Explicit state, debuggable, resumable |
| LLM | DeepSeek (primary) | Cost-efficient, strong instruction following |
| Relational DB | SQLite → PostgreSQL (cloud) | Zero-config local, production-grade cloud |
| Auth | JWT + RBAC + OTP email | Multi-tenant, role-aware, standard patterns |
| Cache | In-memory (2-tier TTL) | No Redis dependency for local dev |
| Guardrails | Custom G1–G5 stack | Defence-in-depth, non-invasive to pipeline |
| CI/CD | GitHub Actions | PR gates + ECR push + ECS deploy |
| Cloud | AWS ECS Fargate + S3 + RDS | Serverless containers, managed DB, CDN |

---

## Cloud Architecture — AWS

```
Developer Push → GitHub
       │
       ▼
┌────────────────────────────┐
│   GitHub Actions CI/CD     │
│                            │
│  on PR:                    │
│   ① pytest (backend)       │
│   ② ng build (frontend)    │
│                            │
│  on merge to main:         │
│   ③ docker build           │
│   ④ push → AWS ECR         │
│   ⑤ ECS rolling deploy     │
│      (circuit-breaker      │
│       auto-rollback)       │
└────────────┬───────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                          AWS Cloud                              │
│                                                                 │
│  ┌──────────────┐  HTTPS   ┌─────────────────────────────────┐ │
│  │  CloudFront  │─────────▶│  Application Load Balancer      │ │
│  │  (CDN)       │          └────────────────┬────────────────┘ │
│  └──────┬───────┘                           │                  │
│         │                                   ▼                  │
│  ┌──────▼───────┐          ┌─────────────────────────────────┐ │
│  │  S3 Bucket   │          │  ECS Fargate (FastAPI)          │ │
│  │  Angular SPA │          │  · 2 tasks min, 10 max          │ │
│  │  dist/       │          │  · Auto-scale on CPU > 60%      │ │
│  └──────────────┘          │  · Health-check gated deploys   │ │
│                            └────────────────┬────────────────┘ │
│                                             │                  │
│                            ┌────────────────▼────────────────┐ │
│                            │  RDS PostgreSQL + pgvector      │ │
│                            │  (replaces SQLite in cloud)     │ │
│                            └─────────────────────────────────┘ │
│                                                                 │
│  AWS Secrets Manager: OpenAI key, JWT secret, DB password      │
│  CloudWatch: error rate, P95 latency, DB connection alarms     │
│  Budget alert: $50/month cap                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Infrastructure as Code

All cloud resources are scripted — zero ClickOps:

| Script | What It Creates |
|--------|----------------|
| `infra/01-ecr.sh` | ECR image registry |
| `infra/02-s3-cloudfront.sh` | S3 bucket + CloudFront + ACM HTTPS cert |
| `infra/03-rds-postgres.sh` | RDS PostgreSQL + pgvector extension |
| `infra/04-secrets-manager.sh` | All app secrets (rotatable, auditable) |
| `infra/05-ecs-fargate.sh` | ECS cluster + Fargate task + ALB |
| `infra/06-autoscaling-alarms.sh` | CloudWatch alarms + auto-scaling |

---

## Project Structure

```
astro-intel/                          ← Angular 17 Frontend
├── src/app/
│   ├── pages/
│   │   ├── intake/                   ← Birth profile form + module selection
│   │   ├── review/                   ← Admin insight review (raw JSON)
│   │   ├── report/                   ← 20-page PDF report engine
│   │   ├── metrics/                  ← Live KPI dashboard
│   │   ├── admin-users/              ← User management
│   │   └── profile/                  ← User profile
│   ├── services/
│   │   ├── api.service.ts            ← All HTTP calls + error handling
│   │   └── orchestrator.service.ts  ← Report assembly + plain English pass
│   └── models/astro.models.ts        ← All shared TypeScript interfaces
└── Dockerfile                        ← Multi-stage: ng build → Nginx

astro-intel-backend/                  ← FastAPI + LangGraph Backend
├── agents/
│   ├── question_agent.py             ← RAG-based intent classification
│   ├── numerology_agent.py           ← 3 traditions (Indian/Chaldean/Pythagorean)
│   ├── astrology_agent.py            ← Vedic + KP + Western
│   ├── palmistry_agent.py            ← 3 traditions
│   ├── tarot_agent.py                ← Major + Minor Arcana
│   ├── vastu_agent.py                ← Directions + elements
│   ├── meta_agent.py                 ← Cross-domain consensus
│   ├── hallucination_check           ← Output validation
│   ├── remedy_agent.py               ← 8-category remedies
│   ├── admin_review_agent.py         ← Human-in-the-loop packaging
│   ├── plain_english_agent.py        ← Jargon → plain English (2-stage)
│   ├── report_agent.py               ← FinalReportPayload builder
│   ├── translation_agent.py          ← 22 Indian languages; story-arc marker-safe; newline-escape fix
│   └── simplify_agent.py             ← Narrative simplification
├── auth/                             ← JWT + RBAC + OTP
├── guardrails/
│   ├── core.py                       ← safe_node() wrapper (G2 circuit breaker)
│   ├── security.py                   ← Layer 1–4 security (G1 input validation)
│   ├── production.py                 ← G1 rate limiter, G3 JSON repair, G4 PII filter
│   ├── hallucination.py              ← Layer 3 output validation
│   └── validators.py                 ← Input + output validator registry
├── graph/pipeline.py                 ← LangGraph StateGraph — full pipeline wiring
├── cache/store.py                    ← 2-tier TTL semantic cache
├── metrics/collector.py             ← 10 KPIs + RAGAS-proxy metrics
├── routers/
│   ├── analysis.py                   ← /run, /approve, /translate, /simplify-bullets
│   ├── metrics.py                    ← /metrics dashboard endpoint
│   └── geocode.py                    ← Birth location → lat/lon/timezone
├── database.py                       ← SQLite + PostgreSQL dual-backend
└── main.py                           ← FastAPI app + tenant bootstrap
```

---

## Quick Start (Local)

### Prerequisites
- Node.js 20+, Angular CLI 17+
- Python 3.11+
- `.env` file in `astro-intel-backend/`

### Backend
```bash
cd astro-intel-backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
bash start.sh
# API docs: http://localhost:8080/docs
```

### Frontend
```bash
cd astro-intel
npm install
ng serve
# App: http://localhost:4200
```

### Full Stack (Docker)
```bash
docker-compose up --build
# Frontend: http://localhost:4200
# Backend:  http://localhost:8080/docs
```

---

## Key Engineering Decisions

| Decision | Chosen Approach | Alternative Considered | Why This One |
|----------|----------------|----------------------|-------------|
| LLM orchestration | LangGraph StateGraph | LangChain LCEL | Explicit state, debuggable, resumable — critical for 12-node pipeline |
| PDF generation | Angular @media print CSS | Puppeteer / wkhtmltopdf | Zero server cost, no extra process, full Angular component reuse |
| Caching | In-memory 2-tier TTL | Redis | Zero infra dependency for local dev; Redis swap is one line in production |
| Security | 4-layer inline guardrails | API Gateway WAF only | Defense in depth — each layer catches what the others miss |
| Plain English | Regex pre-pass + LLM | LLM only | 40% fewer tokens, deterministic for known jargon, LLM handles rest |
| Graceful degradation | Domain-level try/except | All-or-nothing | Partial report is always better than no report |
| Auth | JWT + RBAC | OAuth2 social login | B2B tenant model requires API key + role hierarchy |

---

## What Makes This Enterprise-Grade

1. **Stateful agent pipeline** — LangGraph with explicit state schema, not a chain of prompts
2. **Human-in-the-loop** — admin must approve every insight before it reaches the user
3. **Multi-tenant security** — every API call scoped to a tenant, permissions enforced at the dependency layer
4. **Observability built in** — 10 KPIs tracked per run, RAGAS-proxy metrics, CloudWatch alarms
5. **Graceful degradation everywhere** — if one domain agent fails, other 4 continue; report still generates
6. **Non-blocking AI passes** — plain English simplification wrapped in try/catch; failure keeps original
7. **Infrastructure as code** — 6 Bash scripts recreate the entire AWS stack from scratch
8. **Test suite** — pytest covering auth, API endpoints, metrics, and negative/edge cases
9. **Cost controls** — semantic cache eliminates repeat LLM calls; budget alert at $50/month
10. **Zero hardcoded secrets** — production guard exits fatally if any secret is still a default placeholder

---

## Running Tests

```bash
# Backend — full test suite
cd astro-intel-backend
pytest tests/ -v

# Specific test files
pytest tests/test_api.py -v
pytest tests/test_auth.py -v
pytest tests/test_metrics.py -v
pytest tests/test_negative_edge_cases.py -v

# Frontend — TypeScript compile check
cd astro-intel
npx tsc --noEmit

# Frontend — production build
ng build --configuration production
```

---

## Environment Variables

```env
# astro-intel-backend/.env

# LLM
DEEPSEEK_API_KEY=sk-...
OPENAI_API_KEY=sk-...          # fallback

# Auth
JWT_SECRET=<64-char random hex>
MASTER_API_KEY=<64-char random hex>
PW_SALT=<64-char random hex>
SUPERADMIN_PASSWORD=<strong password>

# App
APP_ENV=development             # → production in cloud
DATABASE_URL=sqlite:///...      # → postgresql://... in cloud
SQLITE_DB_PATH=astrointel.db
ALLOWED_ORIGINS=http://localhost:4200

# Email
RESEND_API_KEY=re_...
```

---

## GitHub Actions CI/CD

```
On every PR:
  ✅ pytest (all backend tests)
  ✅ ng build --configuration production

On merge to main:
  ✅ Docker build (multi-stage)
  ✅ Push to AWS ECR
  ✅ ECS rolling deploy (health-check gated)
  ✅ Auto-rollback if health checks fail

Manual:
  ✅ Promote: dev → staging → production
  ✅ Rollback: enter previous image tag in workflow dispatch
```

---

## Optimizations & Changelog

### 2026-06-08 (Session 3) — 5 Critical/Medium Bug Fixes (Full Scan)

**Bug 1 — orchestrator.service.ts: Wrong field name `profile` → `user_profile` (MEDIUM)**
- **Bug:** `(this.currentInput() as any)?.profile?.full_name` — field is `user_profile`, not `profile`. `subject` was always `''`, so numerology story merge API never received the person's name. Narrative quality degraded silently.
- **Fix:** `this.currentInput()?.user_profile?.full_name ?? ''` — correct field, no cast needed.
- **Test positive:** Submit analysis for "Ravi Kumar" → story merge API receives `subject="Ravi Kumar"`.
- **Test negative:** `currentInput()` null → `''` returned safely via optional chaining.

**Bug 2 — astrology.service.ts: Dasha periods hardcoded to year 2020 (CRITICAL)**
- **Bug:** `let year = 2020` made all local dasha period calculations start from 2020, showing stale/wrong periods for every user every year after 2020.
- **Fix:** `let year = new Date().getFullYear()` — window always centred on the current year.
- **Test positive:** Run in 2026 → first dasha period shows `2026–2036`. Run in 2030 → shows `2030–2040`.
- **Test negative:** No change to the period durations or planet order — only the start anchor changes.

**Bug 3 — orchestrator.service.ts: Tradition assignment — wrong threshold and wrong index (MEDIUM)**
- **Bug 1:** Threshold `unresolved >= list.length / 2` skipped assignment when < 50% were unresolved (e.g., 1 of 3 insights missing a tradition label was silently left blank).
- **Bug 2:** `traditions[i]` used full-list position `i` not position among unresolved items only, so the 3rd insight got `traditions[2]` instead of `traditions[0]`.
- **Fix:** Removed threshold entirely. Track `unresolvedIdx` separately — only increments when an item is actually unresolved.
- **Test positive:** 3 insights, 1 unresolved → gets `traditions[0]`. All 3 unresolved → get `traditions[0,1,2]`.
- **Test negative:** All already resolved → loop skips every item, `unresolvedIdx` stays 0, no mutation.

**Bug 4 — orchestrator.service.ts: `console.log` leaking internal state in production (MEDIUM)**
- **Bug:** `console.log('[APPROVE] approvedIds count:', approvedIds.length, '| backendMode:', ...)` ran on every report approval. Exposed internal backend mode and approval counts in browser DevTools to any curious user.
- **Fix:** Line removed. Comment explains why.
- **Test:** Open DevTools → approve report → no `[APPROVE]` log appears.

**Bug 5 — astro-agent.component.ts: XSS in markdown renderer (CRITICAL)**
- **Bug:** `renderMarkdown()` injected raw LLM text directly into HTML tag bodies (`<h2>${text}</h2>`) then called `bypassSecurityTrustHtml()`. A jailbroken LLM response like `# <img src=x onerror=alert(1)>` would execute JavaScript.
- **Fix:** Added `_escapeHtml()` step first — escapes `& < > " '` to HTML entities before any markdown pattern is applied. Markdown patterns then operate on safe text.
- **Test positive:** LLM returns `# Hello **world**` → renders `<h2>Hello <strong>world</strong></h2>` correctly.
- **Test negative:** LLM returns `<script>alert(1)</script>` → renders as literal visible text `&lt;script&gt;alert(1)&lt;/script&gt;`, no execution.

---

### 2026-06-08 (Session 2) — 5 Bug Fixes

**Fix 1 — GrammarService: Safari-incompatible lookbehind regex**
- **Bug:** Rule 10 used `(?<=[.!?])` lookbehind — unsupported in Safari < 16.4. Grammar corrections silently skipped on iOS/macOS Safari.
- **Fix:** Replaced with two-pass: capitalise `^[a-z]` first, then `([.!?]\s+)([a-z])` — works in all browsers.
- **Test:** `"hello world. next sentence"` → `"Hello world. Next sentence."` on Safari and Chrome.

**Fix 2 — LoginPage: `setInterval` memory leak on navigation**
- **Bug:** OTP countdown timer (`setInterval`) was never cleared when user navigated away from login page. Timer kept firing in background, accumulating with each visit.
- **Fix:** Implemented `OnDestroy` interface, calls `_stopCountdown()` in `ngOnDestroy()`.
- **Test:** Navigate to login → start OTP flow → navigate away → timer stops (verified via console).

**Fix 3 — NumerologyService: Wrong Chaldean letter map**
- **Bug:** `_letterValueChaldean` was an exact copy of `_letterValueIndian`. In Chaldean numerology, 9 is sacred and never assigned to any letter, and Q maps to 8 (not 1). This produced incorrect name numbers for Chaldean readings.
- **Fix:** Corrected Chaldean map — Q moved from 1 → 8, no letter maps to 9.
- **Test:** Name "QUEEN" — Indian: Q=1, Chaldean: Q=8. Distinct correct results now.

**Fix 4 — AstroAgentService: Question quota burned on failed stream**
- **Bug:** `qCount` was incremented before `_readStream()` completed. A network failure still counted against the user's 10-question session limit.
- **Fix:** Moved increment + `sessionStorage` write to inside the `try` block, after `_readStream()` resolves successfully. Failed requests no longer consume quota.
- **Test:** Kill the agent server → send message → error shown → qCount unchanged.

**Fix 5 — AuthService: Corrupt meta wiped valid token**
- **Bug:** If only `astro_meta` was corrupt (invalid JSON), the `catch` block removed BOTH token and meta. On next load the user was forced to log in again even though their token was valid.
- **Fix:** Separated parse failure path — corrupt meta removes only `META_KEY`, token preserved. Expired session still clears both correctly.
- **Bonus:** Added `readonly` to `_token`, `_meta`, `http`, `router` — eliminated 4 pre-existing static analysis warnings.
- **Test:** Manually corrupt `astro_meta` in DevTools → refresh → page stays logged out gracefully, no crash.

---

### 2026-06-08 (Session 1)
**GeocodeService — Persistent localStorage Cache**
- **Problem:** `GeocodeService` used an in-memory `Map` as its session cache. Every page refresh discarded all previously resolved city coordinates, forcing a backend roundtrip (or fallback lookup) on every new session — even for cities already resolved recently.
- **Fix:** Added a `localStorage` persistence layer with 30-day TTL (matching backend cache TTL). Lookup order is now: in-memory → localStorage → backend API → built-in fallback.
- **Impact:** Zero network calls for repeat city lookups across sessions. Geocode data persists until TTL expires or storage is cleared. Fully backward-compatible — existing fallback chain unchanged.
- **What this teaches:** Multi-layer caching strategy. In-memory (fastest, session-only) → persistent storage (cross-session, TTL-gated) → network (authoritative) → hardcoded fallback (offline resilience). This is the same pattern used in production feature stores: L1 in-memory, L2 Redis, L3 database.

---

## About the Builder

**Rav Singh Chandan** — Senior AI Engineer

This project demonstrates production-level skills across:
- **LLM Orchestration** — LangGraph multi-agent pipelines, prompt engineering, hallucination mitigation
- **Backend Engineering** — FastAPI, async Python, RBAC auth, semantic caching, metrics
- **Frontend Engineering** — Angular 17 signals, reactive state, complex PDF rendering
- **Security Engineering** — 4-layer guardrail stack, prompt injection defence, PII filtering
- **DevOps / MLOps** — Docker, GitHub Actions CI/CD, AWS ECS + S3 + RDS + Secrets Manager
- **AI Evaluation** — RAGAS-proxy metrics, confidence scoring, domain coverage tracking

> *"I didn't just build an AI app — I built the infrastructure, security, observability, and deployment pipeline around it. Because that's what production AI systems actually require."*

---

*Last updated: May 2026 · [API Docs](http://localhost:8080/docs) · [Live Metrics](http://localhost:4200/metrics)*
