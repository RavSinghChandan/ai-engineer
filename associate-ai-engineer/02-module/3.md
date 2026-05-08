
# Module 2 — LLM Core  
# Topic: Embeddings

---

## 1. Intuition

Embeddings convert text into numbers (vectors) so that similar meanings are close to each other.

Simple idea:
- Similar words → similar vectors  
- Different words → far vectors  

Example:
“king” and “queen” → close  
“king” and “car” → far  

---

## 2. Core Concept

- Embedding = numerical representation of text  
- Output is a vector (list of numbers)

Example:
"AI is powerful" → [0.12, -0.45, 0.89, ...]

Properties:
- Captures semantic meaning  
- Used for similarity search  
- Works in high-dimensional space  

---

## 3. Why / When to Use

- Semantic search  
- RAG systems  
- Recommendation systems  
- Clustering similar data  

Important:
Embeddings are the foundation of vector databases  

---

## 4. How It Works (Pipeline)

1. Input text  
2. Convert text to embedding vector  
3. Store vector in database  
4. Query → convert to embedding  
5. Compare similarity (cosine similarity)  
6. Retrieve most similar results  

---

## 5. Code Skeleton

### Generate Embeddings
```python
from openai import OpenAI

client = OpenAI()

response = client.embeddings.create(
    model="text-embedding-3-small",
    input="AI is powerful"
)

embedding = response.data[0].embedding
````

### Similarity Search

```python id="z9u3dk"
import numpy as np

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

score = cosine_similarity(vec1, vec2)
```

---

## 6. Example (Real System)

* RAG:
  Store document chunks as embeddings → retrieve similar chunks

* Search system:
  Search meaning, not keywords

* Your system:
  Skill matching using vector similarity

---

## 7. Trade-offs

Embeddings:

* Capture meaning
* Enable semantic search

- High storage (vectors)
- Requires similarity computation

High-dimensional vectors:

* Better accuracy

- Slower search

---

## 8. Interview Questions

* What are embeddings?
* Why are embeddings used in RAG?
* How is similarity calculated?

---

## 9. Answer Framework

Start:
“Embeddings convert text into numerical vectors”

Then:
“These vectors capture semantic meaning”

Then:
“We use them for similarity search in RAG systems”

Then:
“Similarity is calculated using cosine similarity”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why use embeddings instead of keywords?

Answer:
Embeddings capture meaning, not exact words.
So “car” and “vehicle” are treated as similar, which keyword search cannot do.

---

Q2: What is cosine similarity?

Answer:
It measures angle between two vectors.
If vectors are close → similarity is high.

---

Q3: How are embeddings used in RAG?

Answer:

* Convert documents into embeddings
* Store in vector DB
* Convert query into embedding
* Retrieve similar documents

---

Q4: What is dimensionality of embeddings?

Answer:
Number of values in the vector.
Example: 768, 1536
Higher dimension → better representation but more cost

---

Q5: Can embeddings be reused?

Answer:
Yes.
Once created, they can be stored and reused for multiple queries.
This improves performance and reduces cost

---

```
```
