# AI System Design Blueprint

> **The complete map of AI system design patterns** — everything a Senior AI Engineer is expected to know and build.  
> Each pattern has: `flow.html` (interactive diagram) · `code.py` (production code) · `flow.md` · `mental-model.md` · `cheatsheet.md` · `extensions.md` · `README.md`

---

## How to open all diagrams

```bash
chmod +x open-all.sh && ./open-all.sh
```

---

## TIER 1 — LLM Application Patterns

| # | Pattern | Golden Memory | Key Tech |
|---|---------|---------------|----------|
| [P1](P1-plain-llm/) | Plain LLM Application | Request → Prompt → LLM → Parse → Response | FastAPI, AsyncOpenAI, Pydantic |
| [P2](P2-rag/) | RAG — Retrieval Augmented Generation | Retrieve → Rank → Augment → Generate | FAISS, sentence-transformers, cross-encoder |
| [P3](P3-agent-tool-calling/) | Agent + Tool Calling | Think → Tool → Result → Think → Answer | OpenAI tool_call, asyncio.gather |
| [P4](P4-memory-based-ai/) | Memory-Based AI | Retrieve → Context Build → LLM → Store | Redis (short-term) + FAISS (long-term) |
| [P5](P5-streaming-async/) | Streaming + Async Jobs | Generate → Push Token → Repeat + Accept → Queue → Worker → Status | SSE, Celery, Redis |
| [P6](P6-multi-agent-systems/) | Multi-Agent Systems | Orchestrate → Dispatch Workers → Synthesise → Critique | LangGraph StateGraph, asyncio.gather |
| [P7](P7-guardrails-safety/) | Guardrails & Safety | Input Guard → LLM → Output Guard → Audit | Rate limiter, PII strip, hallucination check |

---

## TIER 2 — Data & Retrieval

| # | Pattern | Golden Memory | Key Tech |
|---|---------|---------------|----------|
| [P8](P8-vector-database-design/) | Vector Database Design | Embed → Index → ANN Search → Rerank | FAISS, Pinecone, pgvector, Weaviate |
| [P9](P9-hybrid-search/) | Hybrid Search | BM25 + Vector → RRF Merge → Rerank → Top-K | rank_bm25, FAISS, RRF, CrossEncoder |
| [P10](P10-fine-tuning-peft/) | Fine-Tuning & PEFT | When to fine-tune → Dataset → LoRA/QLoRA → Train → Eval → Deploy | Hugging Face PEFT, QLoRA, vLLM |

---

## TIER 3 — Production Infrastructure

| # | Pattern | Golden Memory | Key Tech |
|---|---------|---------------|----------|
| [P11](P11-caching-strategy/) | Caching Strategy | L1 In-Memory → L2 Redis → L3 Semantic · 500× cost reduction | LRU dict, Redis, FAISS semantic cache |
| [P12](P12-observability-evals/) | Observability & Evals | Trace → Metrics → RAGAS Evals → Alert | OpenTelemetry, Prometheus, RAGAS, Grafana |
| [P13](P13-cost-latency-optimisation/) | Cost & Latency Optimisation | Route → Budget Tokens → Batch → JSON Mode | DeepSeek, gpt-4o-mini, model routing |

---

## TIER 4 — Security & Compliance

| # | Pattern | Golden Memory | Key Tech |
|---|---------|---------------|----------|
| [P14](P14-prompt-injection-defence/) | Prompt Injection Defence | Detect → Blocklist → LLM Judge → Isolate | Regex, OpenAI moderation, structural isolation |
| [P15](P15-pii-data-privacy/) | PII & Data Privacy | Detect → Tokenise → LLM → Restore · GDPR compliant | spaCy NER, PII vault, TTL, right-to-erasure |

---

## Architecture Progression

```
Foundation                  → P1  Plain LLM
Add knowledge               → P2  RAG
Add reasoning + actions     → P3  Agent + Tool Calling
Add memory                  → P4  Memory-Based AI
Add scale + async           → P5  Streaming + Async Jobs
Add coordination            → P6  Multi-Agent Systems
Add safety                  → P7  Guardrails & Safety
                                   │
Improve retrieval           → P8  Vector Database Design
                            → P9  Hybrid Search
Customise the model         → P10 Fine-Tuning & PEFT
                                   │
Make it production-ready    → P11 Caching Strategy
                            → P12 Observability & Evals
                            → P13 Cost & Latency Optimisation
                                   │
Make it secure & compliant  → P14 Prompt Injection Defence
                            → P15 PII & Data Privacy
```

---

## Interview Coverage

| Interview Topic | Covered By |
|----------------|-----------|
| "Design a chatbot" | P1, P4, P11 |
| "Design a document Q&A system" | P2, P8, P9 |
| "Design an autonomous agent" | P3, P6 |
| "How do you make LLM apps safe?" | P7, P14, P15 |
| "How do you reduce LLM costs?" | P11, P13 |
| "How do you measure LLM quality?" | P12 |
| "When would you fine-tune?" | P10 |
| "Design a production RAG system" | P2, P8, P9, P11, P12, P13 |
| "How do you handle PII?" | P15, P7 |

---

*Author: Rav Singh Chandan · Senior AI Engineer*
