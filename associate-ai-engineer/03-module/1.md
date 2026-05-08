
# Module 3 — RAG Systems  
# Topic: RAG (Retrieval Augmented Generation)

---

## 1. Intuition

RAG means giving the model access to external data before generating answer.

Simple idea:
- LLM alone → guesses  
- LLM + data → answers correctly  

---

## 2. Core Concept

RAG combines:
- Retrieval (fetch relevant data)  
- Generation (LLM generates answer)  

So instead of relying only on training data,  
model uses **fresh and relevant information**.

---

## 3. Why / When to Use

- When data is private or dynamic  
- When accuracy is important  
- When reducing hallucination  

Examples:
- Chat with documents  
- Company knowledge bot  
- FAQ system  

---

## 4. How It Works (Pipeline)

1. Load documents  
2. Split into chunks  
3. Convert chunks into embeddings  
4. Store in vector DB  
5. User query → convert to embedding  
6. Retrieve top-K similar chunks  
7. Pass chunks + query to LLM  
8. Generate answer  

---

## 5. Code Skeleton

```python
# Step 1: Load documents
docs = load_documents()

# Step 2: Chunking
chunks = split_documents(docs)

# Step 3: Embeddings
embeddings = embed(chunks)

# Step 4: Store in vector DB
vector_db.store(embeddings)

# Step 5: Query
query_vec = embed(user_query)

# Step 6: Retrieve
results = vector_db.search(query_vec)

# Step 7: Generate
response = llm.generate(results + user_query)
````

---

## 6. Example (Real System)

* Chat with PDF:
  User asks question → system retrieves relevant sections → LLM answers

* Customer support bot:
  Uses company documents

* Your system:
  Resource matching using embeddings + retrieval

---

## 7. Trade-offs

RAG:

* More accurate
* Uses real data

- Adds latency
- Depends on retrieval quality

Without RAG:

* Faster

- High hallucination

---

## 8. Interview Questions

* What is RAG?
* Why use RAG instead of fine-tuning?
* What are components of RAG?
* How to improve RAG performance?

---

## 9. Answer Framework

Start:
“RAG combines retrieval and generation”

Then:
“It retrieves relevant data and sends it to LLM”

Then:
“This improves accuracy and reduces hallucination”

Then:
“Used in chatbots and document Q&A systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why use RAG instead of fine-tuning?

Answer:
RAG is faster and cheaper.
No need to retrain model.
Also works with dynamic data.

---

Q2: What are limitations of RAG?

Answer:

* Depends on retrieval quality
* Limited by context window
* Adds latency

---

Q3: How to improve RAG performance?

Answer:

* Better chunking
* Good embeddings
* Use reranking
* Optimize top-K retrieval

---

Q4: What happens if retrieval is poor?

Answer:
LLM gets wrong context and gives incorrect answer.
So retrieval quality is critical.

---

Q5: Can RAG work without vector DB?

Answer:
Not effectively.
Vector DB is needed for fast similarity search.

---

```
```
