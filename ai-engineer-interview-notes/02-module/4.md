
# Module 2 — LLM Core  
# Topic: Vector Databases

---

## 1. Intuition

Vector database stores embeddings and helps find similar items quickly.

Simple idea:
- Store vectors  
- Search similar vectors  

Like:
Google search → but based on meaning, not keywords  

---

## 2. Core Concept

- Vector DB stores embeddings (high-dimensional vectors)  
- Supports similarity search (nearest neighbors)

Key operations:
- Insert vectors  
- Search similar vectors  
- Update/delete vectors  

Common Vector DBs:
- FAISS  
- Pinecone  
- Weaviate  

---

## 3. Why / When to Use

- When using embeddings  
- RAG systems  
- Semantic search  
- Recommendation systems  

Important:
Without vector DB → embeddings are useless  

---

## 4. How It Works (Pipeline)

1. Convert data into embeddings  
2. Store embeddings in vector DB  
3. User query → convert to embedding  
4. Perform similarity search  
5. Retrieve top-K results  
6. Use results in LLM  

---

## 5. Code Skeleton

### Using FAISS
```python
import faiss
import numpy as np

# Create index
dimension = 128
index = faiss.IndexFlatL2(dimension)

# Add vectors
vectors = np.random.rand(10, dimension).astype('float32')
index.add(vectors)

# Search
query = np.random.rand(1, dimension).astype('float32')
distances, indices = index.search(query, k=3)

print(indices)
````

---

## 6. Example (Real System)

* RAG:
  Store document embeddings → retrieve relevant chunks

* Chatbot:
  Search knowledge base

* Your system:
  Skill matching using vector similarity

---

## 7. Trade-offs

Vector DB:

* Fast similarity search
* Scalable

- Extra infrastructure

Exact search:

* Accurate

- Slow

Approximate search (ANN):

* Fast

- Slightly less accurate

---

## 8. Interview Questions

* What is a vector database?
* Why is it used in RAG?
* What is ANN search?

---

## 9. Answer Framework

Start:
“Vector database stores embeddings and supports similarity search”

Then:
“It is used in RAG to retrieve relevant data”

Then:
“It uses algorithms like ANN for fast search”

Then:
“Examples include FAISS and Pinecone”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What is ANN (Approximate Nearest Neighbor)?

Answer:
ANN is a technique to find similar vectors quickly instead of exact search.
It trades a little accuracy for much faster performance.

---

Q2: Why not use normal database?

Answer:
Normal databases are not optimized for high-dimensional vector similarity search.
They are slow for this use case.

---

Q3: What is indexing in vector DB?

Answer:
Indexing organizes vectors for faster search.
Example: FAISS uses special data structures for efficient retrieval.

---

Q4: How does vector DB scale?

Answer:

* Partition data
* Use distributed systems
* Optimize indexing

---

Q5: How many vectors can be stored?

Answer:
Depends on system, but can scale to millions or billions using distributed vector databases.

---

```
```
