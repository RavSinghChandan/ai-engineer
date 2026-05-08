
# Module 5 — AI System Design  
# Topic: Designing Chat with PDF (RAG System)

---

## 1. Intuition

User uploads a PDF and asks questions.  
System reads PDF and answers based on its content.

Simple idea:
- Store PDF knowledge  
- Retrieve relevant part  
- LLM generates answer  

---

## 2. Core Concept

This system uses RAG:

- Input: PDF document  
- Processing: Chunk + Embeddings  
- Storage: Vector DB  
- Query: Retrieve + Generate  

Components:
- Document loader  
- Chunking  
- Embedding model  
- Vector database  
- LLM  

---

## 3. Why / When to Use

- Document Q&A systems  
- Knowledge base chatbot  
- Company internal tools  

Important:
LLM alone cannot read large documents directly  

---

## 4. How It Works (Pipeline)

1. Upload PDF  
2. Extract text  
3. Split into chunks  
4. Convert chunks into embeddings  
5. Store in vector DB  

At query time:
6. User asks question  
7. Convert query to embedding  
8. Retrieve top-K chunks  
9. Send chunks + query to LLM  
10. Generate answer  

---

## 5. Code Skeleton

```python
# Load PDF
docs = load_pdf("file.pdf")

# Chunking
chunks = split_documents(docs)

# Embeddings
embeddings = embed(chunks)

# Store
vector_db.store(embeddings)

# Query
query_vec = embed(user_query)

results = vector_db.search(query_vec, k=5)

# Generate response
response = llm.generate(results + user_query)
````

---

## 6. Example (Real System)

* Chat with legal documents
* Company policy assistant
* Resume analysis system

Your system:
Knowledge-based answering using RAG

---

## 7. Trade-offs

RAG System:

* Accurate
* Uses real data

- Latency
- Depends on retrieval

Without RAG:

* Fast

- Hallucination

---

## 8. Interview Questions

* How do you design chat with PDF?
* What are key components?
* How to improve performance?

---

## 9. Answer Framework

Start:
“We use RAG to build chat with PDF”

Then:
“PDF is chunked and stored as embeddings”

Then:
“Query retrieves relevant chunks”

Then:
“LLM generates answer using context”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: How do you handle large PDFs?

Answer:
Split into chunks and use vector DB for retrieval.
Only relevant chunks are sent to LLM.

---

Q2: How to improve accuracy?

Answer:

* Better chunking
* Good embeddings
* Use reranking
* Optimize Top-K

---

Q3: How to reduce latency?

Answer:

* Cache embeddings
* Optimize retrieval
* Reduce chunk size
* Use faster models

---

Q4: What if retrieved data is wrong?

Answer:
LLM will generate incorrect answer.
So retrieval quality is very important.

---

Q5: How to scale this system?

Answer:

* Use distributed vector DB
* Use caching (Redis)
* Load balancing
* Async processing

---

```
```
