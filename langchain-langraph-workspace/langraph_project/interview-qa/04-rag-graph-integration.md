
---

# 🔷 RAG (Retrieval Augmented Generation) in LangGraph — Complete Interview Answer

## ✅ Core Answer (Use this in interview)

**WHAT (What is RAG?)**
RAG is a pattern where an LLM's response is **grounded in retrieved documents** rather than trained knowledge. Instead of hallucinating, the LLM answers based only on relevant chunks retrieved from a vector store.

---

**WHY (Why RAG in banking?)**
LLMs have a knowledge cutoff and can hallucinate regulations:
* "What is the KYC requirement?" → LLM invents an answer
* With RAG → LLM answers from the **actual KYC policy document**

In banking, incorrect compliance information is a **regulatory risk**.

---

**HOW (How it works in LangGraph?)**

```
prepare_query → retrieve_documents → grade_documents → generate_answer → END
                                          ↓ (no relevant docs)
                                    fallback_response → END
```

Each stage is a separate node — **modular, testable, replaceable**.

---

**WHERE (Where used?)**

* Compliance assistants (KYC, AML, GDPR, PCI DSS)
* Policy Q&A systems
* Internal knowledge bases
* Regulatory document search

---

**WHEN (When to use RAG?)**

* When answers must come from specific documents
* When hallucination risk is unacceptable
* When documents change (regulations update)
* When audit trail of source is required

---

**IMPACT (Why it matters in production?)**

* Eliminates hallucination on policy questions
* Answers are **source-cited and verifiable**
* Document updates automatically improve answers — no retraining
* Compliance-ready: every answer points to its source policy

---

## 🔷 Key Concepts (Interview Deep Dive)

### 🔹 Embeddings

Text → dense vector representation.
Similar meaning → vectors close in space.
Used to find documents semantically similar to a query.

```
"KYC requirements" → [0.12, -0.34, 0.89, ...]
"Customer identity verification" → [0.11, -0.31, 0.91, ...] ← similar!
```

---

### 🔹 Vector Store (FAISS)

Stores document embeddings.
At query time: embed the question → find nearest document vectors.

```
FAISS.similarity_search(query, k=4)
→ returns top 4 most similar document chunks
```

In banking production: use `pgvector` (Postgres) or `Chroma` for persistence.

---

### 🔹 Chunking Strategy

Documents are split before embedding:
* `chunk_size=1000` — each chunk ≈ 1000 characters
* `chunk_overlap=200` — 200 chars shared between adjacent chunks

Poor chunking = poor retrieval.
Overlap prevents answers from being split across chunk boundaries.

---

### 🔹 Relevance Grading (CRITICAL in Banking)

After retrieval, filter out low-relevance chunks:
```python
graded = [d for d in raw_docs if d["score"] <= RELEVANCE_THRESHOLD]
```
FAISS returns L2 distance — **lower = more similar**.
If no chunk passes the threshold → use fallback response.

This is the **graded retrieval** pattern — prevents hallucination from off-topic chunks.

---

### 🔹 Grounded Generation

System prompt enforces strict grounding:
```
"Answer ONLY from the context below. If context is insufficient, say so clearly.
 Cite the source policy whenever possible."
```
Prevents LLM from "filling gaps" with invented facts.

---

### 🔹 Sources as Audit Trail

Every RAG answer returns which documents it used:
```json
{
  "answer": "Per KYC Policy v3.2, customers must provide...",
  "sources": ["kyc_policy.txt", "aml_policy.txt"]
}
```
Compliance officers can verify the source directly.

---

## 🔥 Real-World (Banking Example)

### Compliance Assistant Flow

User: *"What documents are required for a business account KYC?"*

```
prepare_query → normalize + extract category hint (KYC)
     │
retrieve_documents → FAISS search KYC + AML docs (top 4 chunks)
     │
grade_documents → keep chunks with L2 distance < 0.8
     │ (3 chunks passed, 1 filtered)
generate_answer → LLM with system: "answer from context only"
     │
Response: "Per KYC Policy v3.2, business accounts require: Certificate of Incorporation,
           Board Resolution, PAN Card, and address proof for all directors.
           Source: kyc_policy.txt"
```

---

## 🔥 5 High-Impact Follow-Up Questions (with answers)

### 1. Why use RAG instead of fine-tuning for compliance Q&A?

Fine-tuning is expensive and static — regulations change constantly.
RAG updates automatically when you update the document store.
No retraining = lower cost, always current.

---

### 2. What is the difference between similarity search and hybrid search?

Similarity search = semantic (vector distance).
Hybrid = semantic + keyword (BM25).
Hybrid is better for banking: "Basel III Tier 1 capital" → keyword helps narrow down exact regulation.

---

### 3. What is MMR (Maximal Marginal Relevance)?

Retrieval strategy that balances **relevance + diversity**.
Avoids returning 4 chunks all saying the same thing.
Better answer coverage with fewer tokens.

---

### 4. How do you evaluate a RAG system?

Use **RAGAS** framework:
* **Faithfulness** — is the answer supported by the retrieved context?
* **Answer Relevancy** — does the answer address the question?
* **Context Recall** — did retrieval find the right chunks?

---

### 5. What happens if the retrieved context doesn't contain the answer?

The grading step filters out low-relevance chunks.
If no chunks pass → graph routes to `fallback_response`:
*"I could not find relevant compliance documentation. Please contact Compliance directly."*
This is **safe degradation** — no hallucinated answer.

---

## 🔥 Advanced Follow-Up Questions (with answers)

### 1. What is re-ranking and why is it needed?

Initial retrieval uses fast approximate search (FAISS).
Re-ranking uses a slower cross-encoder to re-score the top results.
Better precision before sending to LLM — especially important for long document collections.

---

### 2. How does chunk overlap help?

Ensures that sentences near chunk boundaries are not split.
Example: a KYC requirement that spans two chunks → overlap means both chunks contain the key sentence.

---

### 3. How do you handle multi-document RAG (KYC + AML + GDPR at once)?

Store all documents in the same FAISS index with `category` metadata.
Optional: filter by category at query time.
This is what the Compliance RAG in the banking project does.

---

### 4. What is the token cost impact of RAG?

Retrieved context adds tokens to every prompt.
4 chunks × 1000 chars ≈ 1000 extra tokens per query.
Mitigate: grade aggressively, use smaller chunks, limit to top-2 most relevant.

---

### 5. How do you keep the vector store up to date when regulations change?

Re-ingest updated documents → re-embed → update FAISS index.
Use version tags in metadata: `{"source": "kyc_policy.txt", "version": "v3.3"}`.
Re-ranking ensures newer chunks are preferred when both exist.

---

## 🔥 RAG Graph Design Practice

### ❌ Bad Design

```python
def compliance_node(state):
    return llm.invoke(f"Answer about KYC: {state['query']}")
```
Zero grounding — pure hallucination risk.

---

### ✅ Good Design

```
prepare_query → retrieve_documents → grade_documents → generate_answer
                                          ↓ (no relevant docs)
                                    fallback_response
```
Every answer is grounded, graded, and cited.

---

### ❌ Bad Retrieval

Return all retrieved chunks without grading → LLM uses low-relevance chunks → off-topic answers.

---

### ✅ Good Retrieval

Grade chunks by relevance score.
Only pass chunks above threshold to LLM.
If empty → fallback (never hallucinate).

---

## 🔥 Security (Banking Critical)

### 🔹 Risks

* Injecting malicious content into the vector store
* User extracting full document content via RAG
* Cross-user document leakage

---

### 🔹 Prevention

* Access control on document ingestion — only compliance team can update
* Limit chunk size in responses — don't return full documents
* User-scoped vector stores if documents are user-specific
* Never include internal account numbers or sensitive data in compliance documents
* Log every query and retrieved sources for audit

---

## 🔥 Summary (Interview Revision)

* RAG = retrieval + generation — answers grounded in real documents
* Prevents hallucination on compliance and policy questions
* Pipeline: prepare → retrieve → grade → generate (or fallback)
* Embeddings convert text to semantic vectors
* FAISS stores and searches vectors by similarity
* Chunking splits documents — chunk_size + chunk_overlap
* Graded retrieval filters out low-relevance chunks
* Grounded generation: LLM answers only from retrieved context
* Sources returned as audit trail
* Evaluate with RAGAS: faithfulness, relevancy, context recall
* RAG > fine-tuning for dynamic regulatory content
* Re-ranking improves precision for large document sets
* Hybrid search (semantic + keyword) best for banking queries

---
