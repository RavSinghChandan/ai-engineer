
# Module 8 — Frameworks & Tools  
# Topic: FAISS (Vector Search Internals)

---

## 1. Intuition

FAISS is a library that helps find similar vectors very fast.

Simple idea:
- Store vectors → search nearest vectors quickly  

---

## 2. Core Concept

- FAISS = Facebook AI Similarity Search  
- Used for:
  - Nearest neighbor search  
  - High-dimensional vector search  

Key idea:
Instead of checking all vectors, FAISS uses optimized indexing  

---

## 3. Why / When to Use

- RAG systems  
- Embedding search  
- Large datasets  

Important:
FAISS is faster than brute-force search  

---

## 4. How It Works (Pipeline)

1. Convert data into embeddings  
2. Create index  
3. Store vectors in index  
4. Query → convert to embedding  
5. Search nearest vectors  
6. Return top results  

---

## 5. Code Skeleton

### Create Index
```python
import faiss
import numpy as np

dimension = 128
index = faiss.IndexFlatL2(dimension)
````

### Add Vectors

```python id="k5n2qt"
vectors = np.random.rand(100, dimension).astype('float32')
index.add(vectors)
```

### Search

```python id="m9p4zx"
query = np.random.rand(1, dimension).astype('float32')
distances, indices = index.search(query, k=5)

print(indices)
```

---

## 6. Example (Real System)

* RAG:
  Store document embeddings

* Search engine:
  Find similar documents

* Your system:
  Skill matching using FAISS

---

## 7. Trade-offs

FAISS:

* Fast
* Scalable

- Requires tuning

Exact Search:

* Accurate

- Slow

ANN Search:

* Fast

- Slight accuracy loss

---

## 8. Interview Questions

* What is FAISS?
* Why is FAISS used?
* What is ANN search?

---

## 9. Answer Framework

Start:
“FAISS is a library for fast vector similarity search”

Then:
“It uses indexing for efficient nearest neighbor search”

Then:
“Used in RAG and embedding-based systems”

Then:
“It is faster than brute-force search”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What is ANN search?

Answer:
Approximate Nearest Neighbor search finds similar vectors quickly with slight loss in accuracy.

---

Q2: What is indexing in FAISS?

Answer:
Organizing vectors in a structure to allow fast searching.

---

Q3: What is difference between L2 and cosine similarity?

Answer:
L2 measures distance between vectors.
Cosine measures angle between vectors.

---

Q4: How does FAISS scale?

Answer:

* Uses optimized indexing
* Supports large datasets
* Can run on GPU

---

Q5: When not to use FAISS?

Answer:

* Small datasets
* When exact precision is required

---

```
```
