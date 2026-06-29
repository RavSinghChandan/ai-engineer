# Senior AI Engineer — Interview Blueprint

> **Target:** 3–7 years experience | Product companies, enterprise, Series A–C startups
> **Your job in an interview:** Show you can DESIGN, LEAD, and SCALE AI systems — not just build them.

---

## What Changes at the Senior Level

```
Junior AI Engineer                 Senior AI Engineer
─────────────────────────────────────────────────────
"I built a RAG chatbot"      →    "I designed a RAG system that serves
                                   10,000 queries/day with <2s latency
                                   and 92% user satisfaction"

"I used LangChain"           →    "I chose LangChain for rapid prototyping
                                   but replaced it with raw LangGraph for
                                   production because we needed fine-grained
                                   control over agent state"

"I fixed the hallucination"  →    "I implemented a 3-layer hallucination
                                   guard: reranking + faithfulness scoring
                                   + human-in-the-loop for low-confidence
                                   answers"
```

**The shift:** From "I built X" → "I decided Y because of Z trade-off"

---

## Interview Rounds (Typical for Senior AI Engineer)

| Round | What They Test | How to Crack It |
|-------|----------------|-----------------|
| HR Screen | Leadership, impact, growth mindset | Have quantified impact stories |
| Technical Deep Dive 1 | LLM internals, RAG advanced, evaluations | Go deep on internals |
| Technical Deep Dive 2 | Live system design | Use the SCALE frame below |
| Live Coding | Agentic pipeline / evaluation script | Know LangGraph + RAGAS |
| Architecture Review | Review their existing system, suggest improvements | Ask clarifying Qs first |
| Leadership Round | Mentoring, decisions, failures | STAR with depth |
| CTO/VP Round | Vision, roadmap thinking | Talk about where AI is going |

---

## Topics You MUST Know (Priority Order)

### 🔴 MUST KNOW — Senior-level depth required

| # | Topic | Depth Required | Study File |
|---|-------|----------------|------------|
| 1 | LLM Internals | Transformer, attention, RLHF, quantization | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 2 | Advanced RAG | Reranking, hybrid search, MMR, HyDE | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 3 | Hallucination at scale | Faithfulness scoring, RAGAS, guardrails | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 4 | Agentic AI (production) | LangGraph, multi-agent, state management | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 5 | AI System Design | Scalable, observable, evaluatable | [System Design](../../topics/04-system-design/SYSTEM-DESIGN.md) |
| 6 | Fine-tuning (full picture) | LoRA, QLoRA, SFT, RLHF, when to use | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 7 | LLMOps | Observability, cost control, versioning | [MLOps](../../topics/05-mlops/MLOPS.md) |

### 🟡 SHOULD KNOW — Differentiates senior from staff

| # | Topic | Depth Required | Study File |
|---|-------|----------------|------------|
| 8 | Evaluation frameworks | RAGAS, LLM-as-judge, A/B testing | [MLOps](../../topics/05-mlops/MLOPS.md) |
| 9 | Security in AI | Prompt injection, data leakage, guardrails | [System Design](../../topics/04-system-design/SYSTEM-DESIGN.md) |
| 10 | Cost optimization | Token budgeting, caching, model routing | [MLOps](../../topics/05-mlops/MLOPS.md) |
| 11 | Multi-modal basics | Vision + LLM, document understanding | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 12 | MCP (Model Context Protocol) | Architecture, tool registration | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |

---

## The SCALE Frame for Senior System Design

When asked to design ANY AI system at the senior level:

```
S — SCOPE     → What is the problem? What are the constraints?
                  (scale, latency, accuracy, cost, privacy)

C — COMPONENTS→ What are the moving parts?
                  (ingestion, embedding, retrieval, generation, serving)

A — ACCURACY  → How do you ensure quality?
                  (evaluation, guardrails, human-in-the-loop)

L — LATENCY   → How do you make it fast?
                  (caching, async, streaming, model size choices)

E — EVOLUTION → How does it improve over time?
                  (feedback loops, fine-tuning pipeline, A/B tests)
```

---

## Senior-Level Questions That Trip People Up

These are the questions that test DEPTH, not breadth:

| Question | What They're Really Testing |
|----------|-----------------------------|
| "Why did you choose that chunk size?" | Trade-off thinking, not just building |
| "How do you evaluate RAG quality?" | Know RAGAS: faithfulness, relevance, recall |
| "How would you reduce hallucination without changing the LLM?" | Retrieval quality, reranking, confidence thresholds |
| "Your agent is looping — how do you debug it?" | LangGraph state inspection, max iterations, fallback |
| "How do you do A/B testing for an LLM response?" | You can't use standard metrics — need LLM judge |
| "We have 1M documents — how do you scale?" | Chunking strategy, index sharding, approximate NN |
| "Fine-tune or RAG — which and when?" | Cost, data freshness, accuracy trade-off |

---

## Behavioral Stories — Senior Level

At senior level, every story needs: **context → decision → trade-off → impact**

Have stories for:
- **Led a technical decision** that had real trade-offs
- **Mentored someone** and changed their trajectory
- **Failed at something** — what you learned, what you changed
- **Shipped under pressure** — how you managed quality vs speed
- **Disagreed with your manager/team** — how you handled it professionally

→ Full STAR stories: [Behavioral](../../topics/08-behavioral/BEHAVIORAL.md)

---

## Questions to Ask the Interviewer (Senior Level)

1. "What is your current biggest challenge in your AI system?"
2. "How do you currently measure the quality of your AI responses?"
3. "What does the AI roadmap look like for the next 6 months?"
4. "How close is the AI team to the product team here?"

These questions signal senior thinking. Ask them.

---

*Role: Senior AI Engineer | Level: 3–7 years | Updated: 2026-06-29*
