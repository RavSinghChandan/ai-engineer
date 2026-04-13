# 🚀 AI Service (LangChain)

## 🧠 Objective

Build a **standalone AI service** using LangChain (and optionally LangGraph) that can later plug into backend systems.

---

# 🏆 Definition of DONE

You are **DONE only if all are implemented**:

### Core

* [ ] Multi-step reasoning (chain or graph)
* [ ] Agent with tool usage (minimum 2 tools)
* [ ] Memory (context-aware responses)
* [ ] RAG (document ingestion + retrieval)

### API

* [ ] Exposed via FastAPI
* [ ] Structured JSON response
* [ ] Streaming response support

### Prompts

* [ ] Stored separately (not hardcoded)
* [ ] Versioned
* [ ] Dynamically selectable

### Reliability

* [ ] Retry on failure
* [ ] Fallback response
* [ ] Input validation

### Logging

* [ ] Request + response logging

---

# 🧱 Architecture

```
User Input
   ↓
FastAPI
   ↓
LangChain / LangGraph
   ↓
Agent (Planner → Tools → Executor)
   ↓
Retriever (Vector DB)
   ↓
LLM
   ↓
Structured Output
```

---

# 🔥 Features

## Multi-step reasoning

* Break query into steps
* Execute sequentially or via graph

## Tools

* Minimum 2 tools
* Agent decides when to use

## RAG

* Document → chunks → embeddings → store
* Retrieve relevant context before answering

## Memory

* Maintain conversation context

## Output

Return structured response:

```json
{
  "answer": "...",
  "sources": [],
  "steps": []
}
```

## Streaming

* Token-wise response

---

# ⚙️ Tech Stack

* Python
* LangChain
* LangGraph (optional)
* FastAPI
* FAISS / Chroma
* LLM API

---

# 📂 Project Structure (Use this for ALL your projects)

```
ai-service/
│
├── app/
│   ├── main.py              # FastAPI entrypoint
│
│   ├── api/
│   │   └── routes.py       # endpoints
│
│   ├── core/
│   │   ├── config.py       # configs
│   │   └── logger.py       # logging setup
│
│   ├── agents/
│   │   └── agent.py        # agent logic
│
│   ├── chains/
│   │   └── chain.py        # chains / flows
│
│   ├── tools/
│   │   ├── tool_1.py
│   │   └── tool_2.py
│
│   ├── memory/
│   │   └── memory.py
│
│   ├── rag/
│   │   ├── ingest.py
│   │   └── retrieve.py
│
│   ├── prompts/
│   │   ├── v1.txt
│   │   └── v2.txt
│
│   ├── models/
│   │   └── response_model.py
│
│   └── services/
│       └── ai_service.py   # orchestration
│
├── data/
│   └── documents/
│
├── tests/
│
├── requirements.txt
└── README.md
```

---

# ⚡ Rule

* Do NOT hardcode logic inside one file
* Keep agent, tools, RAG, memory **separate modules**
* Service should be **plug-and-play**

---

# 🏁 Final State

When done, your service should:

* Accept query
* Decide steps
* Use tools if needed
* Retrieve context
* Generate answer
* Return structured output

---
