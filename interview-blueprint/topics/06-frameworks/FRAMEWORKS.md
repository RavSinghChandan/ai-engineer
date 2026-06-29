# Frameworks & Tools — Complete Interview Guide

> Know the tools. Know when to use each. Know the trade-offs.

---

## LangChain

### WHAT
LangChain is a Python framework for building LLM applications. It provides ready-made building blocks: LLMs, Prompts, Chains, Retrievers, Memory.

### The Core Abstractions

```python
# 1. LLM (the model)
from langchain.llms import OpenAI
llm = OpenAI(temperature=0)

# 2. Prompt Template (structured input)
from langchain.prompts import PromptTemplate
prompt = PromptTemplate(
    input_variables=["question", "context"],
    template="Context: {context}\nQuestion: {question}\nAnswer:"
)

# 3. Chain (connect prompt + LLM)
from langchain.chains import LLMChain
chain = LLMChain(llm=llm, prompt=prompt)
result = chain.run(question="What is RAG?", context="RAG is...")

# 4. LCEL (modern way — pipe operator)
chain = prompt | llm
result = chain.invoke({"question": "What is RAG?", "context": "RAG is..."})
```

### When to Use LangChain vs When NOT to

| Use LangChain | Don't Use LangChain |
|--------------|-------------------|
| Rapid prototyping | Production-critical latency systems (overhead) |
| Simple chains | Custom agent logic (use LangGraph instead) |
| Standard RAG | When you need full control of every step |

### 📌 KEY POINT
> LangChain is great for getting started. For complex agents in production → LangGraph.

---

## LangGraph

### WHAT
LangGraph extends LangChain for **stateful, cyclical agent workflows** using a directed graph model.

See detailed explanation in: [Agentic AI](../03-agentic-ai/AGENTIC-AI.md)

### Quick Reference

```python
# The pattern you must know:
from langgraph.graph import StateGraph, END

graph = StateGraph(State)
graph.add_node("node_name", node_function)
graph.add_edge("node_a", "node_b")                           # always A → B
graph.add_conditional_edges("node_a", routing_function)     # A → (B or C)
graph.set_entry_point("node_a")
app = graph.compile()

result = app.invoke({"messages": [HumanMessage(content="Hello")]})
```

---

## FastAPI

### WHAT
FastAPI is a modern Python web framework for building REST APIs with automatic documentation and type safety.

### The Pattern Every AI Engineer Must Know

```python
from fastapi import FastAPI
from pydantic import BaseModel
from langchain.chains import RetrievalQA

app = FastAPI()

class ChatRequest(BaseModel):
    question: str
    session_id: str | None = None

class ChatResponse(BaseModel):
    answer: str
    sources: list[str]

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    # Your RAG pipeline here
    answer = qa_chain.run(request.question)
    return ChatResponse(answer=answer, sources=["doc1.pdf"])

# Streaming response (for real-time token output):
from fastapi.responses import StreamingResponse

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        async for chunk in llm.astream(request.question):
            yield f"data: {chunk.content}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### 📌 KEY POINT
> Always use `async def` for LLM endpoints. LLM calls are I/O bound, not CPU bound.
> Sync endpoints block the server. Async endpoints serve many users simultaneously.

---

## Vector Databases Comparison

| DB | Use Case | Hosting | Cost | Standout |
|----|---------|---------|------|---------|
| FAISS | Local dev, fast | Self | Free | Fastest in-memory |
| Pinecone | Production | Managed | $$ | No infra, auto-scale |
| Chroma | Local/dev | Self | Free | Easiest setup |
| Weaviate | Production + graph | Self/Managed | $$ | Multi-modal, hybrid |
| Qdrant | Production | Self/Managed | $ | Rust, very fast |
| pgvector | You use Postgres | Self | Free | No new DB needed |

**Interview tip:** "I chose FAISS for local development because it's free and fast. For production at scale, I'd migrate to Pinecone for managed scaling and built-in hybrid search."

---

## Embedding Models

| Model | Provider | Dimensions | Best For |
|-------|---------|-----------|---------|
| text-embedding-3-small | OpenAI | 1536 | Cost-efficient |
| text-embedding-3-large | OpenAI | 3072 | Best quality |
| embed-english-v3.0 | Cohere | 1024 | Reranking use cases |
| all-MiniLM-L6-v2 | Sentence Transformers | 384 | Free, local |
| bge-large-en | BAAI | 1024 | Free, high quality |
| nomic-embed-text | Nomic | 768 | Free, long documents |

**Rule of thumb:** For quick demo → OpenAI text-embedding-3-small. For free/local → all-MiniLM or bge-large. For production quality → text-embedding-3-large.

---

*Topic: Frameworks & Tools | Updated: 2026-06-29*
