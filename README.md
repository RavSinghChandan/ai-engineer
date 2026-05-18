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

**What it does:** A user submits their birth profile. A 12-node LangGraph pipeline runs 5 domain agents in parallel (Vedic Astrology, Numerology, Palmistry, Tarot, Vastu), a meta-agent synthesises cross-domain consensus, an admin reviews and approves insights, and a branded 20-page PDF report is generated — with 30+ language translation support.

**Key engineering highlights:**

| Area | What Was Built |
|------|---------------|
| AI Pipeline | 12-agent LangGraph StateGraph — sequential + parallel fan-out |
| Security | 4-layer guardrail stack: input validation, prompt hardening, output validation, audit logging |
| Auth | JWT + multi-tenant RBAC (user / admin / superadmin) + OTP email |
| Caching | 2-tier semantic cache: 30-day profile TTL, 20-min session TTL |
| Observability | 10 KPIs + RAGAS-proxy metrics (faithfulness, precision, relevancy, recall) |
| NLP | Plain English agent: 30+ regex jargon patterns + LLM rewrite + safety filter |
| PDF Engine | 20-page branded PDF via Angular @media print CSS — no server-side library |
| Translation | 30+ language support with LLM translation agent |
| Prod Guardrails | G1 rate limiter, G2 circuit breaker, G3 JSON repair, G4 PII filter, G5 degradation |
| Cloud | AWS ECS Fargate + S3 + CloudFront + RDS + Secrets Manager + GitHub Actions CI/CD |

**→ [Full Architecture & README](astro-intel/README.md)**

**Tech:** Python 3.11, FastAPI, LangGraph, DeepSeek LLM, Angular 17, SQLite/PostgreSQL, Docker, AWS

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

## Study Notes

### Associate AI Engineer — `associate-ai-engineer/`

Structured study notes covering AI engineering fundamentals: RAG, embeddings, vector databases, agents, prompt engineering, MLOps, streaming, and LLM frameworks. 11 modules, 39 files.

### Senior AI Engineer — `senior-ai-engineer/`

Production-depth study notes targeting Senior AI Engineer interview preparation. Covers the same domains as associate level but at production scale: failure modes, cost analysis, reliability patterns, Java/Spring bridge, CI/CD for AI, and cloud deployment. 12 modules, 48 files.

**Module 12 (Java/Spring Bridge)** is the unique differentiator — maps Resilience4j, Spring Batch, and Kafka consumer patterns directly to LLM API resilience, async task processing, and event-driven AI pipelines.

---

## Architecture Progression

```
Phase 1 — Foundation
  langchain_project     Basic RAG + agents + streaming

Phase 2 — State & Orchestration
  langraph_project      Stateful agents, interrupt/resume
  graph-visualizer      Real-time agent graph visualization

Phase 3 — Production Multi-Agent
  astro-intel           Parallel agents, consensus, admin review

Phase 4 — Domain Applications
  agentic-growth-os     Growth planning automation
  ai-report-app         Document intelligence
  bench-resource-optimizer  Resource optimization
  guru-app              Adaptive tutoring
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM APIs | OpenAI GPT-4o, GPT-4o-mini, Anthropic Claude |
| Agent Framework | LangGraph, LangChain |
| Backend | Python, FastAPI, Uvicorn |
| Vector Store | FAISS, pgvector |
| Async | Celery, Redis |
| Frontend | Angular, TypeScript, SSE |
| DevOps | Docker, GitHub Actions |
| Cloud | AWS ECS / GCP Cloud Run |

---

## Author

**Rav Singh Chandan** — Senior AI Engineer

6+ years background in Java, Spring Boot, Angular, DevOps, and Cloud (AWS/GCP).
Now building production AI systems: multi-agent pipelines, LLM guardrails, semantic caching, and full-stack AI applications.

The AstroIntel 360° project (above) is the most complete demonstration of these skills — it is not a tutorial follow-along. Every component — the security stack, the caching layer, the RBAC system, the PDF engine, the CI/CD pipeline — was designed and built from scratch to solve real production problems.

> *Available for Senior AI Engineer, AI Platform Engineer, and Full-Stack AI Engineer roles.*
