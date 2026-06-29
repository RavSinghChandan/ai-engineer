# Python for AI — Complete Interview Guide

> These Python patterns come up in live coding rounds. Know them cold.

---

## CONCEPT 1: Async Python — Critical for AI APIs

### WHY Async Matters for AI Engineers
LLM API calls take 1–10 seconds. If your server handles them synchronously, one slow call blocks ALL other users.

```python
# BAD — Synchronous (blocks server)
@app.post("/chat")
def chat(request: ChatRequest):
    answer = llm.invoke(request.question)  # blocks for 3 seconds
    return {"answer": answer}
    # During these 3s, no other request can be handled

# GOOD — Asynchronous
@app.post("/chat")
async def chat(request: ChatRequest):
    answer = await llm.ainvoke(request.question)  # releases control during wait
    return {"answer": answer}
    # During the 3s wait, FastAPI handles other requests
```

### The Async Pattern for RAG

```python
import asyncio
from langchain.embeddings import OpenAIEmbeddings

# Run multiple embeddings in parallel:
async def embed_batch(texts: list[str]) -> list[list[float]]:
    embeddings = OpenAIEmbeddings()
    # Sequential: 10 texts × 100ms each = 1 second
    # Parallel:   10 texts in ~100ms total
    tasks = [embeddings.aembed_query(text) for text in texts]
    return await asyncio.gather(*tasks)
```

### 📌 KEY POINT
> Every LangChain method has an async version: `invoke` → `ainvoke`, `run` → `arun`.
> Always use async in production FastAPI apps.

---

## CONCEPT 2: Pydantic — Type Safety for AI Inputs/Outputs

### WHY
LLMs output text. Text is unstructured. Pydantic turns it into validated Python objects.

```python
from pydantic import BaseModel, Field
from typing import Literal

class RAGResponse(BaseModel):
    answer: str = Field(description="The answer to the user's question")
    sources: list[str] = Field(description="List of document names used")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score")
    escalate_to_human: bool = Field(description="True if human review needed")

# Force LLM to output this structure:
from langchain.output_parsers import PydanticOutputParser

parser = PydanticOutputParser(pydantic_object=RAGResponse)
prompt = PromptTemplate(
    template="Answer the question and format as JSON.\n{format_instructions}\nQuestion: {question}",
    input_variables=["question"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)
```

---

## CONCEPT 3: Context Managers and Resource Management

```python
# Pattern for managing LLM connections, DB connections:
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load models, connect to vector DB
    global vectorstore, llm
    vectorstore = FAISS.load_local("index", OpenAIEmbeddings())
    llm = ChatOpenAI(model="gpt-4o")
    print("Models loaded")
    yield
    # Shutdown: cleanup
    print("Shutting down")

app = FastAPI(lifespan=lifespan)
```

---

## CONCEPT 4: Generators for Streaming LLM Output

```python
# Stream LLM output token by token:
from fastapi.responses import StreamingResponse

async def stream_tokens(question: str):
    async for chunk in llm.astream(question):
        if chunk.content:
            yield f"data: {chunk.content}\n\n"
    yield "data: [DONE]\n\n"

@app.get("/stream")
async def stream(question: str):
    return StreamingResponse(
        stream_tokens(question),
        media_type="text/event-stream"
    )
```

---

## CONCEPT 5: Decorators for AI Pipelines

```python
import functools
import time

# Retry decorator for flaky LLM API calls:
def retry(max_attempts=3, delay=1.0):
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise
                    await asyncio.sleep(delay * (attempt + 1))
        return wrapper
    return decorator

@retry(max_attempts=3)
async def call_llm(prompt: str) -> str:
    return await llm.ainvoke(prompt)

# Cache decorator for expensive embeddings:
from functools import lru_cache

@lru_cache(maxsize=1000)
def embed_query(text: str) -> tuple:
    embedding = embeddings.embed_query(text)
    return tuple(embedding)  # lru_cache needs hashable type
```

---

## CONCEPT 6: Common Live Coding Task — RAG From Scratch

**The task you must be able to complete in 20 minutes with no IDE help:**

```python
# FULL RAG PIPELINE FROM SCRATCH
# Given: a text file "company_policy.txt"
# Build: a Q&A system that answers questions from this file

import os
from openai import OpenAI
import numpy as np

client = OpenAI()  # uses OPENAI_API_KEY from environment

# STEP 1: Load document
with open("company_policy.txt") as f:
    text = f.read()

# STEP 2: Chunk (simple version — split by paragraph)
chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]

# STEP 3: Embed all chunks
def get_embedding(text: str) -> list[float]:
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text
    )
    return response.data[0].embedding

chunk_embeddings = [get_embedding(chunk) for chunk in chunks]

# STEP 4: Search
def cosine_similarity(a: list, b: list) -> float:
    a, b = np.array(a), np.array(b)
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def retrieve(query: str, top_k: int = 3) -> list[str]:
    query_embedding = get_embedding(query)
    scores = [cosine_similarity(query_embedding, emb) for emb in chunk_embeddings]
    top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
    return [chunks[i] for i in top_indices]

# STEP 5: Generate
def answer(question: str) -> str:
    relevant_chunks = retrieve(question)
    context = "\n\n".join(relevant_chunks)
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "Answer ONLY from the context. If unsure, say 'I don't know.'"},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
        ],
        temperature=0
    )
    return response.choices[0].message.content

# TEST IT
print(answer("What is the refund policy?"))
```

### 📌 KEY POINT
> In a live coding interview: code this 5-step skeleton first, then explain each step.
> You don't need LangChain. The interviewer wants to see you understand the CONCEPTS.

---

*Topic: Python for AI | Updated: 2026-06-29*
