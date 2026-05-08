
# Module 5 — AI System Design  
# Topic: Designing RAG at Scale (Latency, Cost, Caching)

---

## 1. Intuition

Scaling RAG means handling many users while keeping system fast and cost-effective.

Simple idea:
- More users → more requests  
- Need fast response + low cost  

---

## 2. Core Concept

At scale, RAG faces:

- High latency (slow responses)  
- High cost (LLM + embeddings)  
- Large data volume  

Key components to optimize:
- Retrieval  
- LLM calls  
- Infrastructure  

---

## 3. Why / When to Use

- Production systems  
- High traffic applications  
- Enterprise AI platforms  

Important:
Basic RAG works for small scale, but not for production  

---

## 4. How It Works (Pipeline)

1. User request  
2. Check cache  
3. If not cached → process query  
4. Retrieve embeddings  
5. Get top-K results  
6. Call LLM  
7. Store result in cache  
8. Return response  

---

## 5. Code Skeleton

### Caching Layer
```python
cache = {}

def get_response(query):
    if query in cache:
        return cache[query]

    results = vector_db.search(embed(query))
    response = llm.generate(results + query)

    cache[query] = response
    return response
````

### Async Processing

```python id="m4q7zt"
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor()

future = executor.submit(llm.generate, prompt)
result = future.result()
```

---

## 6. Example (Real System)

* ChatGPT-like system:
  Uses caching + optimized retrieval

* Enterprise chatbot:
  Handles thousands of queries

* Your system:
  Real-time AI pipelines using Kafka

---

## 7. Trade-offs

Caching:

* Faster responses

- May return outdated data

Large models:

* Better quality

- Higher cost

Small models:

* Faster

- Lower accuracy

---

## 8. Interview Questions

* How do you scale RAG?
* How to reduce latency?
* How to reduce cost?

---

## 9. Answer Framework

Start:
“To scale RAG, we optimize latency and cost”

Then:
“We use caching, efficient retrieval, and async processing”

Then:
“We also choose appropriate models”

Then:
“This ensures fast and cost-effective system”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: How do you reduce latency in RAG?

Answer:

* Use caching
* Optimize vector search
* Reduce Top-K
* Use faster LLM

---

Q2: How do you reduce cost?

Answer:

* Use smaller models
* Cache responses
* Reduce token usage
* Batch requests

---

Q3: What is role of caching?

Answer:
Caching stores previous responses.
If same query comes again, system returns cached result without calling LLM.

---

Q4: What is bottleneck in RAG systems?

Answer:

* Vector search
* LLM inference
  These are the main performance bottlenecks.

---

Q5: How do you scale vector DB?

Answer:

* Use distributed systems
* Partition data
* Optimize indexing

---

```
```
