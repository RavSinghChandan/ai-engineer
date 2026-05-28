# AI Engineer Portfolio

A progressive series of AI engineering projects — from foundational LLM patterns to production-grade multi-agent systems. Each project builds on the previous, demonstrating increasing depth in system design, reliability engineering, and real-world deployment thinking.

---

## Projects

### 1. LangChain AI Service — `langchain_project/`

Production-ready RAG and agent service built with LangChain and FastAPI.

**Covers:** Document ingestion, FAISS vector search, conversational memory, tool-use agents, prompt versioning, streaming responses (SSE), structured JSON output.

**Tech:** Python, FastAPI, LangChain, OpenAI, FAISS, Pydantic

---

### 2. LangGraph Agent System — `langraph_project/`

Stateful multi-step agent built with LangGraph's StateGraph.

**Covers:** Explicit state machines, conditional edges, human-in-the-loop interrupt/resume, SQLite checkpointing for persistent state across sessions.

**Tech:** Python, FastAPI, LangGraph, Angular

---

### 3. Graph Visualizer — `graph-visualizer/`

Angular application that renders LangGraph agent execution graphs in real time.

**Covers:** Live agent state visualization, node/edge rendering, SSE-driven updates as the graph executes.

**Tech:** Angular, TypeScript, D3.js / Cytoscape

---

### 4. ⭐ AstroIntel 360° — `astro-intel/` + `astro-intel-backend/` ← FLAGSHIP PROJECT

**The most complete project in this portfolio.** A production-grade, full-stack AI platform demonstrating every layer of enterprise AI engineering — from LLM orchestration to cloud deployment.

**What it does:** A user submits their birth profile. An 8-node LangGraph pipeline runs 5 domain agents in parallel (Vedic Astrology, Numerology, Palmistry, Tarot, Vastu), a meta-agent synthesises cross-domain consensus, hallucination is checked, an admin reviews and approves insights, and a branded PDF report is generated — with 30+ language translation support.

**Key engineering highlights:**

| Area | What Was Built |
|------|---------------|
| AI Pipeline | 8-node LangGraph StateGraph — security_check → question_agent → domain_agents (parallel) → meta_agent → hallucination_check → remedy_agent → admin_review_agent → grammar_agent |
| Latency | 78s (sequential GPT-4o) → 15s (parallel GPT-4o-mini) → **4s** (parallel + DeepSeek + 3-tier cache) |
| LLM Cost | DeepSeek at $0.000137/analysis (500× cheaper than GPT-4o) |
| Caching | 3-tier: L1 in-memory + L2 Redis DB0 (connection pool, pub/sub invalidation) + L3 semantic (cosine ≥ 0.92) |
| Async Queue | Enterprise Kafka: 3 consumer workers, acks=all, gzip, exponential backoff + jitter, DLQ fallback |
| Security | 4-layer guardrail stack: input validation, prompt hardening, output validation, audit logging |
| Auth | JWT + multi-tenant RBAC (user / admin / superadmin) + OTP email |
| Observability | RAGAS proxy metrics (faithfulness, context precision, answer relevancy, domain recall) + Prometheus |
| Guardrails | G1 rate limiter, G2 circuit breaker (safe_node hard-kill timeout), G3 JSON repair cascade, G4 PII filter, G5 graceful degradation |
| Episodic Memory | Admin correction store (SQLite) — every edited insight logged with cosine-similarity retrieval; injected into LangGraph state at `/run` so agents learn from Chandan's past corrections automatically |
| Persona Injection | Static persona prompt (tone rules, forbidden patterns, structural preferences) + dynamic top-K correction recall merged into every pipeline run via `chandan_preferences` state key |
| Fine-tune Roadmap | Phase 1 (now): correction logging + persona prompting. Phase 2 (100+ corrections): distillation dataset. Phase 3 (500+): LoRA fine-tune on Mistral-7B |
| Feedback API | 7 ADMIN-only endpoints: `POST /corrections`, `GET /corrections`, `GET /corrections/stats`, `POST /persona/preferences`, `GET /persona/preferences`, `GET /persona/preview` |
| Testing | 98 tests — 16 new episodic memory tests (all passing), all Kafka + Redis paths mocked, no real broker needed in CI |
| Cloud | AWS ECS Fargate + ECR + GitHub Actions CI/CD (OIDC auth, rolling deploy) |

**New files added (2025-05-28):**
```
astro-intel-backend/
├── memory/
│   ├── episodic.py       ← correction store: log_correction, retrieve_similar_corrections, persona_preferences
│   └── persona.py        ← CHANDAN_PERSONA prompt + build_chandan_context() + format_for_prompt()
├── routers/
│   └── feedback.py       ← /api/v1/feedback/* — 7 ADMIN endpoints
└── tests/
    └── test_episodic_memory.py  ← 16 tests, all passing
```
**Modified files:** `database.py` (init_episodic_tables on startup), `main.py` (feedback router registered), `routers/analysis.py` (persona injected into `/run` state; corrections auto-logged on `/approve`), `schemas/models.py` (ApprovalRequest extended with `edited_insights[]`)

**Tech:** Python 3.11, FastAPI, LangGraph, DeepSeek LLM, Angular 17, SQLite/PostgreSQL, Redis 7.2, Kafka (Confluent 7.6), Docker, AWS

---

### 5. Agentic Growth OS — `agentic-growth-os/`

AI-powered personal and team growth operating system using agentic workflows.

**Covers:** Goal decomposition, multi-step planning agents, progress tracking, structured output pipelines.

**Tech:** Python, FastAPI, LangChain/LangGraph, Angular

---

### 6. AI Report App — `ai-report-app/`

Automated report generation system using LLM pipelines.

**Covers:** Document analysis, structured report generation, multi-section synthesis, export workflows.

**Tech:** Python, FastAPI, OpenAI, Angular

---

### 7. Bench Resource Optimizer — `bench-resource-optimizer/`

AI-assisted resource allocation and optimization tool for engineering teams.

**Covers:** Skill matching, capacity analysis, LLM-driven recommendations, structured decision outputs.

**Tech:** Python, FastAPI, OpenAI, Angular

---

### 8. Guru App — `guru-app/`

AI tutoring and knowledge assistant application.

**Covers:** Personalized Q&A, adaptive responses, knowledge retrieval, conversational AI patterns.

**Tech:** Python, FastAPI, OpenAI, Angular

---

## Branching Strategy

This repository follows a **trunk-based branching model with environment gates**. Every merge to production goes through a human-approved promotion step — no direct push to `main` is allowed.

```
feature/*  ──PR──→  develop  ──PR──→  staging  ──promote.yml──→  main
hotfix/*   ─────────────────────────────────────────────────────→  main
```

### Branch Roles

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Production-ready code only. No direct push — only `promote.yml` merges here. | AWS ECS prod cluster (`astrointel-cluster`) |
| `staging` | Pre-production verification. Merged from `develop` via PR. | AWS ECS staging cluster (`astrointel-staging-cluster`) |
| `develop` | Integration of all features. Merged from `feature/*` via PR. | No deploy — CI tests only |
| `feature/*` | One branch per feature or fix. Always cut from `develop`. | No deploy |
| `hotfix/*` | Emergency production fix. Cut from `main`, promoted directly. | No deploy |

### Developer Workflow

```bash
# Start new work — always from develop
git checkout develop && git pull origin develop
git checkout -b feature/your-feature-name

# Work, commit, push
git commit -m "feat: description"
git push origin feature/your-feature-name

# Open PR: feature/your-feature-name → develop
# CI must pass (pytest + ng build) before merge is allowed
```

### Path to Production

```
1. PR: feature/* → develop       CI gate (test.yml): pytest + ng build
2. PR: develop  → staging        CI gate again + auto-deploy to staging ECS
3. Verify staging manually        https://staging.aurawithrav.com
4. Run promote.yml (manual)       GitHub Actions → requires production approver
   └─ Verifies staging ECS health
   └─ Merges staging → main
   └─ Triggers build-push.yml on main
   └─ Triggers deploy.yml → prod ECS rolling update
   └─ Syncs develop with main
```

### CI/CD Pipeline Map

| Workflow | Triggers on | What it does |
|----------|-------------|--------------|
| `test.yml` | PR to develop/staging/main + push to develop | pytest + ng build — pure CI gate |
| `build-push.yml` | Push to staging or main | Inline test gate → Docker build → ECR push (`:staging` or `:latest` + `:<sha>`) |
| `deploy.yml` | After build-push on staging/main | ECS rolling update — auto-selects cluster based on branch |
| `promote.yml` | Manual dispatch only | Verifies staging health → merges staging→main → triggers full prod deploy chain |

### Image Tagging

| Branch | Tags |
|--------|------|
| `staging` | `:staging` + `:<8-char-sha>` |
| `main` | `:latest` + `:<8-char-sha>` |

Always reference images by SHA tag in production — SHA tags are immutable; `:latest` is not.

> Full details: see [BRANCH_STRATEGY.md](BRANCH_STRATEGY.md)

---

## Folder Structure

```
ai-engineer/                          ← repo root (monorepo)
├── astro-intel/                      ← Angular 17 frontend (AstroIntel 360°)
├── astro-intel-backend/              ← FastAPI + LangGraph backend (AstroIntel 360°)
│   └── docker-compose.yml            ← Enterprise stack (Kafka + Redis + UIs)
├── bench-resource-optimizer/         ← Bench project
├── langchain_project/                ← Interview demo
├── senior-ai-engineer/               ← Study materials / interview prep (12 modules)
├── .github/workflows/                ← All CI/CD workflows
├── docker-compose.yml                ← Simple dev stack (SQLite, no Kafka/Redis)
├── BRANCH_STRATEGY.md                ← Full branching strategy documentation
├── PRODUCTION_DEPLOYMENT_GUIDE.md    ← AWS/ECS deployment guide
└── README.md                         ← This file
```

**Two docker-compose files:**

| File | Use when |
|------|----------|
| Root `docker-compose.yml` | Local dev — simple SQLite stack, no Kafka/Redis overhead |
| `astro-intel-backend/docker-compose.yml` | Full enterprise stack — Kafka, Redis, ZooKeeper, admin UIs |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| LLM APIs | DeepSeek (primary), OpenAI GPT-4o / GPT-4o-mini |
| Agent Framework | LangGraph, LangChain |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Async Queue | Apache Kafka (Confluent 7.6), kafka-python-ng |
| Cache | Redis 7.2 (L2 response cache + L1 in-memory + L3 semantic) |
| Vector Store | FAISS, pgvector |
| Frontend | Angular 17, TypeScript, SSE |
| Auth | JWT, RBAC, OTP email |
| DevOps | Docker, GitHub Actions (OIDC, no long-lived keys) |
| Cloud | AWS ECS Fargate, ECR, ap-south-1 |

---

## Architecture Progression

```
Phase 1 — Foundation
  langchain_project       Basic RAG + agents + streaming

Phase 2 — State & Orchestration
  langraph_project        Stateful agents, interrupt/resume
  graph-visualizer        Real-time agent graph visualization

Phase 3 — Production Multi-Agent
  astro-intel             Parallel agents, consensus, guardrails, Kafka, Redis

Phase 4 — Domain Applications
  agentic-growth-os       Growth planning automation
  ai-report-app           Document intelligence
  bench-resource-optimizer  Resource optimization
  guru-app                Adaptive tutoring
```

---

## Author

**Rav Singh Chandan** — Senior AI Engineer

6+ years background in Java, Spring Boot, Angular, DevOps, and Cloud (AWS/GCP).
Now building production AI systems: multi-agent pipelines, LLM guardrails, semantic caching, and full-stack AI applications.

The AstroIntel 360° project is the most complete demonstration of these skills — it is not a tutorial follow-along. Every component — the 8-node LangGraph graph, the 3-tier Redis cache, the enterprise Kafka pipeline, the RBAC system, the G1–G5 guardrail stack, the CI/CD pipeline — was designed and built from scratch to solve real production problems.

> *Available for Senior AI Engineer, AI Platform Engineer, and Full-Stack AI Engineer roles.*
