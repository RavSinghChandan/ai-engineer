
# Module 3 — RAG Systems  
# Topic: Retrieval Optimization (Top-K, Hybrid Search, Reranking)

---

## 1. Intuition

Retrieval optimization means getting the **most relevant chunks** for a query.

Simple idea:
- Better retrieval → Better answer  
- Wrong retrieval → Wrong answer  

---

## 2. Core Concept

In RAG, retrieval quality is critical.

Key techniques:
- Top-K retrieval  
- Hybrid search (keyword + vector)  
- Reranking  

Goal:
Return the **best possible context** to LLM  

---

## 3. Why / When to Use

- When results are irrelevant  
- When accuracy is low  
- When documents are large  

Important:
LLM is only as good as retrieved data  

---

## 4. How It Works (Pipeline)

1. User query  
2. Convert to embedding  
3. Retrieve top-K chunks  
4. (Optional) apply keyword search  
5. Combine results (hybrid search)  
6. Rerank results based on relevance  
7. Send best chunks to LLM  

---

## 5. Code Skeleton

### Top-K Retrieval
```python
results = vector_db.search(query_vector, k=5)
````

### Hybrid Search (Vector + Keyword)

```python
vector_results = vector_db.search(query_vector, k=5)
keyword_results = keyword_search(query_text)

combined = merge(vector_results, keyword_results)
```

### Reranking

```python id="9v3kzt"
reranked = sorted(combined, key=lambda x: relevance_score(x, query), reverse=True)
top_results = reranked[:3]
```

---

## 6. Example (Real System)

* Chatbot:
  Retrieves top 5 chunks → selects best 2

* Search system:
  Combines keyword + semantic search

* Your system:
  Skill matching improves with reranking

---

## 7. Trade-offs

Top-K:

* Simple

- May include irrelevant chunks

Hybrid Search:

* Better accuracy

- More computation

Reranking:

* Highly relevant results

- Adds latency

---

## 8. Interview Questions

* What is Top-K retrieval?
* What is hybrid search?
* What is reranking?
* How to improve retrieval quality?

---

## 9. Answer Framework

Start:
“Retrieval optimization improves relevance of data sent to LLM”

Then:
“We use Top-K, hybrid search, and reranking”

Then:
“This ensures only best context is passed”

Then:
“It directly improves accuracy of RAG systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What is Top-K retrieval?

Answer:
It means retrieving top K most similar chunks based on similarity score.
Example: Top 5 most relevant results.

---

Q2: Why is Top-K not enough?

Answer:
Because similarity score alone may not capture full relevance.
Some irrelevant chunks may still be included.

---

Q3: What is hybrid search?

Answer:
Combining keyword search (BM25) with vector search.
This improves both exact match and semantic understanding.

---

Q4: What is reranking?

Answer:
Reordering retrieved results based on deeper relevance scoring.
Usually done using another model or scoring logic.

---

Q5: How do you improve retrieval quality?

Answer:

* Better embeddings
* Proper chunking
* Use hybrid search
* Apply reranking
* Tune Top-K value

---

```
```
