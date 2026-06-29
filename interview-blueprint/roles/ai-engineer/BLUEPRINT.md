# AI Engineer — Interview Blueprint

> **Target:** 0–3 years experience | Startups to mid-size product companies
> **Your job in an interview:** Show you can BUILD working AI features end-to-end.

---

## What Companies Expect from an AI Engineer

```
┌──────────────────────────────────────────────────────┐
│             AI ENGINEER CORE SKILLS                  │
│                                                      │
│   BUILD  →  LLM APIs + RAG + simple agents           │
│   DEPLOY →  FastAPI or Flask REST endpoints          │
│   DEBUG  →  Hallucinations, latency, token limits    │
│   EXPLAIN→  Explain your system to non-tech people   │
└──────────────────────────────────────────────────────┘
```

---

## Interview Rounds (Typical for AI Engineer)

| Round | What They Test | How to Crack It |
|-------|----------------|-----------------|
| HR Screen | Why AI? Why this company? | Have 1 project story ready |
| Technical Round 1 | LLM basics, RAG concepts, Python | Know WHAT and WHY for each topic |
| Technical Round 2 | Live coding (RAG pipeline / API) | Practice from scratch, no IDE help |
| System Design | Design a chatbot / Q&A system | Use the DESIGN FRAME below |
| Manager Round | Teamwork, ownership, learning pace | STAR format stories |

---

## Topics You MUST Know (Priority Order)

### 🔴 MUST KNOW — Cannot fail the interview without these

| # | Topic | Depth Required | Study File |
|---|-------|----------------|------------|
| 1 | What is an LLM? How does it work? | Explain to a 10-year-old + technical | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 2 | What is RAG? Build it from scratch | Full pipeline code | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 3 | Embeddings — what, why, how | Know cosine similarity | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 4 | Vector Database — what, which ones | FAISS vs Pinecone vs Chroma | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 5 | Prompt Engineering basics | Zero-shot, few-shot, chain-of-thought | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 6 | LangChain basics | Chain, LLM, Prompt, Memory | [Frameworks](../../topics/06-frameworks/FRAMEWORKS.md) |
| 7 | FastAPI — build a REST endpoint | POST /chat endpoint with JSON | [Python for AI](../../topics/07-python-for-ai/PYTHON-FOR-AI.md) |

### 🟡 SHOULD KNOW — These separate good from average

| # | Topic | Depth Required | Study File |
|---|-------|----------------|------------|
| 8 | Hallucination — what causes it, how to fix | 3–4 mitigation strategies | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 9 | Token limits and chunking | Chunk size, overlap | [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md) |
| 10 | Agents basics | What is a tool, what is ReAct | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 11 | Fine-tuning vs RAG (when to use which) | Trade-offs table | [LLM Core](../../topics/01-llm-core/LLM-CORE.md) |
| 12 | Basic System Design: Chatbot | Draw a diagram | [System Design](../../topics/04-system-design/SYSTEM-DESIGN.md) |

### 🟢 GOOD TO KNOW — Shows you are forward-thinking

| # | Topic | Depth Required | Study File |
|---|-------|----------------|------------|
| 13 | LangGraph basics | State machines, nodes, edges | [Agentic AI](../../topics/03-agentic-ai/AGENTIC-AI.md) |
| 14 | Evaluation metrics (RAGAS) | Faithfulness, Relevance, Recall | [MLOps](../../topics/05-mlops/MLOPS.md) |
| 15 | Async Python | async/await patterns | [Python for AI](../../topics/07-python-for-ai/PYTHON-FOR-AI.md) |

---

## The AI Engineer System Design Frame

When asked "Design a chatbot for company X" — use this frame:

```
1. CLARIFY   → What data? How many users? Real-time or batch?
2. INGEST    → How does data come in? PDF, URL, DB?
3. STORE     → Vector DB (Chroma/FAISS/Pinecone) + metadata
4. RETRIEVE  → Embedding model → top-K search → reranking
5. GENERATE  → LLM (GPT-4/Claude) + prompt template + memory
6. SERVE     → FastAPI endpoint → frontend / Slack / WhatsApp
7. MONITOR   → Latency, hallucination rate, user feedback
```

---

## Behavioral Stories — Have These Ready

Have ONE story for each:
- **A project you built end-to-end** (use your LangChain project or BRO)
- **A technical challenge you solved** (hallucination, latency, data quality)
- **A time you learned fast** (new framework / new concept under deadline)

→ Full stories: [Behavioral](../../topics/08-behavioral/BEHAVIORAL.md)

---

## Live Coding Tips (AI Engineer style)

Most companies will ask you to build a RAG pipeline from scratch.

```python
# The skeleton you MUST know by heart:

from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import FAISS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.llms import OpenAI
from langchain.chains import RetrievalQA

# 1. Load → 2. Split → 3. Embed → 4. Store → 5. Retrieve → 6. Answer
```

→ Full code with explanation: [RAG Systems](../../topics/02-rag-systems/RAG-SYSTEMS.md)

---

## Common AI Engineer Interview Questions — Quick List

1. What is the difference between RAG and fine-tuning?
2. How do you handle hallucination in production?
3. What is cosine similarity and why do we use it?
4. What is chunking and why does chunk size matter?
5. Walk me through how you'd build a document Q&A bot.
6. What is the role of embeddings in RAG?
7. How does LangChain work? What is a chain?
8. What is temperature in an LLM API call?
9. What is prompt injection? How do you prevent it?
10. How do you evaluate an AI system?

→ All answered in full Chandan Format in the topic files above.

---

*Role: AI Engineer | Level: 0–3 years | Updated: 2026-06-29*
