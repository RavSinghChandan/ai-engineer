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

### 4. AstroIntel 360° — `astro-intel/` + `astro-intel-backend/`

Production multi-agent astrological analysis platform. The flagship project demonstrating senior-level AI architecture.

**Covers:** 5 parallel domain agents (ThreadPoolExecutor), LangGraph interrupt/resume for admin review, consensus voting across agents, SSE streaming of pipeline progress, Angular neural graph visualization.

**Architecture:** User submits birth profile → 5 specialist agents run in parallel (career, health, finance, relationships, spiritual) → consensus layer → synthesis agent → admin review (optional) → final report.

**Key numbers:** 6 LLM calls per analysis, ~15s pipeline, ~$0.07 cost per analysis at gpt-4o-mini × 5 + gpt-4o × 1.

**Tech:** Python, FastAPI, LangGraph, Angular, OpenAI

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

Chandan Kumar — Senior Full Stack Engineer transitioning to Senior AI Engineer.
Background: Java, Spring Boot, Angular, DevOps, Cloud (6+ years).
