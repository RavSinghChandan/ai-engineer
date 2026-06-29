# RAG Systems — Complete Interview Guide

> This is your most important topic. Birla Opus failed you here. Never again.
> Every question below follows the Chandan Format: WHAT → WHY → HOW → WHERE → WHEN → WHO → KEY POINT → DESI HOOK → FOLLOW-UPS

---

## CONCEPT 1: What is RAG?

### WHAT
RAG stands for **Retrieval-Augmented Generation**.
It is a technique where an LLM looks up relevant documents from a knowledge base BEFORE generating an answer.

```
WITHOUT RAG:
User: "What is our refund policy?"
LLM:  "I don't know. My training data has no info about your company."

WITH RAG:
User: "What is our refund policy?"
System: [retrieves your refund policy PDF]
LLM:  "Based on your policy document: refunds are processed in 7–10 days..."
```

### WHY
LLMs are trained on public internet data up to a cutoff date.
They know nothing about:
- Your private company documents
- Events after their training cutoff
- Your product-specific information

RAG solves this. It gives the LLM fresh, relevant, private knowledge at query time.

### HOW — Step by Step

```
┌─────────────────────────────────────────────────────────────────┐
│                     RAG PIPELINE                                │
│                                                                 │
│  OFFLINE (done once):                                          │
│  Documents → Chunk → Embed → Store in Vector DB                │
│                                                                 │
│  ONLINE (every query):                                         │
│  User Query → Embed Query → Search Vector DB → Top-K Chunks   │
│             → [Chunks + Query] → LLM → Answer                 │
└─────────────────────────────────────────────────────────────────┘

Step 1: LOAD       — Load documents (PDF, URL, DB, text files)
Step 2: CHUNK      — Split documents into smaller pieces
                     (why? LLMs have token limits; chunking fits content)
Step 3: EMBED      — Convert each chunk to a vector (list of numbers)
                     that captures its meaning
Step 4: STORE      — Save vectors in a Vector Database (FAISS, Pinecone, Chroma)
Step 5: QUERY      — User asks a question
Step 6: EMBED Q    — Embed the user's question (same embedding model)
Step 7: SEARCH     — Find top-K most similar chunks using cosine similarity
Step 8: GENERATE   — Send [retrieved chunks + question] to LLM → get answer
```

**The code skeleton (know this cold):**

```python
from langchain.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import FAISS
from langchain.llms import OpenAI
from langchain.chains import RetrievalQA

# Step 1: Load
loader = PyPDFLoader("policy.pdf")
docs = loader.load()

# Step 2: Chunk
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = splitter.split_documents(docs)

# Step 3+4: Embed and Store
embeddings = OpenAIEmbeddings()
vectorstore = FAISS.from_documents(chunks, embeddings)

# Step 5-8: Query and Generate
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})
qa_chain = RetrievalQA.from_chain_type(llm=OpenAI(), retriever=retriever)
answer = qa_chain.run("What is the refund policy?")
```

### WHERE
- Customer support bots (Intercom, Zendesk AI)
- Internal HR/Policy chatbots
- Legal document Q&A
- Medical knowledge bases
- Enterprise knowledge management

### WHEN to use RAG (vs alternatives)

| Use RAG when... | Don't use RAG when... |
|-----------------|----------------------|
| Data changes frequently | Data is static and in LLM training data |
| Data is private/proprietary | You need style/format changes (use fine-tune) |
| Data is too large for context window | Simple conversational tasks |
| You need source citations | Real-time data (use tools/APIs instead) |

### WHO
- Google uses it in NotebookLM
- Salesforce uses it in Einstein AI
- Any company with a large internal knowledge base

### 📌 KEY POINT
> **RAG = give the LLM eyes to see YOUR data, not just what it learned in school.**
> The retrieval step is the magic. Without good retrieval, the generation is garbage.
> "Garbage In → Garbage Out" applies here 100%.

### 🇮🇳 DESI HOOK
> Think of RAG like a **UPSC topper** doing an exam.
> Before writing the answer, they OPEN their notes (retrieval).
> Then they write the answer IN THEIR OWN WORDS (generation).
> A student who doesn't open notes → writes wrong answers (hallucination).
> A student who opens wrong notes → still writes wrong answers (bad retrieval).
> **The notes AND the student both need to be good.**

### ❓ FOLLOW-UP QUESTIONS

**Q1: What is cosine similarity and why do we use it in RAG?**
Cosine similarity measures the angle between two vectors. If two vectors point in the same direction (angle = 0°), similarity = 1. If opposite direction, similarity = -1.
We use it because embeddings encode MEANING as direction, not magnitude. A short sentence and a long paragraph on the same topic should be similar — cosine captures this.

**Q2: What is chunk size and why does it matter?**
Chunk size is how many characters/tokens each document piece gets.
- Too small (50 tokens): Each chunk lacks context → LLM doesn't get enough info
- Too large (2000 tokens): Each chunk covers many topics → retrieval finds wrong chunks
- Sweet spot: **256–512 tokens** with **10–15% overlap**
Overlap ensures that a sentence split across two chunks doesn't lose its meaning.

**Q3: What is the difference between RAG and fine-tuning?**
See the comparison table in the GenAI Engineer blueprint. Short answer:
- RAG = give the LLM access to new documents at runtime
- Fine-tuning = teach the LLM new knowledge during training
RAG is cheaper, faster, and works for changing data. Fine-tuning is better for style/format changes.

---

## CONCEPT 2: Hallucination — What It Is and How to Fix It

### WHAT
Hallucination is when an LLM confidently states something FALSE.

```
User: "Who is the CEO of our company?"
LLM (hallucinating): "The CEO is John Smith." [completely made up]
LLM (with RAG + guardrails): "Based on the company website: The CEO is Priya Sharma."
```

### WHY it happens
LLMs are trained to generate PLAUSIBLE text, not FACTUAL text.
They complete patterns. Sometimes the most plausible-sounding thing is wrong.

Root causes:
1. No relevant chunk retrieved (retrieval failure)
2. Retrieved chunk is ambiguous or outdated
3. LLM ignores the context and uses its own "knowledge"
4. Temperature too high → model takes risky, creative leaps

### HOW to fix it — 5 layers of defence

```
Layer 1: BETTER RETRIEVAL
         → Reranking (cross-encoder, Cohere Rerank)
         → Hybrid search (BM25 + dense vectors)
         → MMR to avoid duplicate chunks

Layer 2: BETTER PROMPTING
         → "Answer ONLY from the context below. If unsure, say 'I don't know'."
         → Explicit instruction to not use prior knowledge

Layer 3: CONFIDENCE SCORING
         → RAGAS Faithfulness score (does the answer match the retrieved docs?)
         → Flag answers below threshold for human review

Layer 4: GUARDRAILS
         → NeMo Guardrails / Llama Guard
         → Output filtering: if no source doc cited → reject

Layer 5: HUMAN-IN-THE-LOOP
         → For high-stakes questions (medical, legal, financial)
         → Low-confidence answers go to human review queue
```

### 📌 KEY POINT
> The #1 fix for hallucination is better RETRIEVAL, not a smarter LLM.
> If the right information reaches the LLM, it will usually use it correctly.
> Focus on your retrieval pipeline first.

### 🇮🇳 DESI HOOK
> Hallucination is like a **student who didn't study** but still writes an essay confidently.
> They don't say "I don't know." They write beautifully wrong answers.
> Your job as an AI engineer is to put the RIGHT textbook in front of them BEFORE the exam.

---

## CONCEPT 3: Top-K Retrieval and Reranking

### WHAT
**Top-K Retrieval:** After searching the vector store, return the K most similar chunks.
**Reranking:** After getting Top-K chunks, re-score them with a MORE ACCURATE (but slower) model.

### WHY Reranking exists
Vector similarity is FAST but APPROXIMATE.
It finds chunks that are mathematically close, but not always semantically relevant.

```
Query: "What is the return policy for electronics?"

Top-K by vector similarity:
  Chunk 1: "Electronics return within 30 days..."   (score: 0.91) ✓ RELEVANT
  Chunk 2: "Electronics warranty for 1 year..."     (score: 0.89) ✗ NOT WHAT WE NEED
  Chunk 3: "All products have a 30-day return..."   (score: 0.87) ✓ RELEVANT
  Chunk 4: "Electronics department is on floor 2..." (score: 0.85) ✗ IRRELEVANT

After reranking (cross-encoder reads query + chunk together):
  Chunk 1: re-score 0.97 → KEEP
  Chunk 3: re-score 0.94 → KEEP
  Chunk 2: re-score 0.23 → DROP
  Chunk 4: re-score 0.01 → DROP
```

### HOW

```
Step 1: Vector search → fast, get 20 candidates
Step 2: Cross-encoder reranking → slow but precise, pick top 3–4
Step 3: Send only the top 3–4 to LLM

Tools: Cohere Rerank API, BGE Reranker, Sentence Transformers cross-encoder
```

### Top-K Strategies Table

| Strategy | What It Does | When to Use |
|----------|-------------|-------------|
| Fixed Top-K | Always return K chunks | Simple, fast, baseline |
| Score threshold | Only chunks above similarity X | When precision > recall |
| MMR | Diversify — avoid near-duplicate chunks | When docs have repetitive sections |
| Cross-encoder reranking | Re-score with heavier model | When retrieval precision matters most |
| Hybrid (BM25 + dense) | Keyword + semantic search combined | When users use exact terms AND meaning |
| HyDE | Generate a hypothetical answer → embed it → search | When query is vague or conversational |

### 📌 KEY POINT
> **Two-stage retrieval:** Stage 1 = fast (vector). Stage 2 = accurate (reranker).
> This is how production RAG systems work at scale. Never just Top-K alone.

### 🇮🇳 DESI HOOK
> Think of it like a **civil services exam shortlist**.
> Prelims (vector search) = fast filter → selects 500 candidates from 500,000
> Mains (reranker) = deep evaluation → selects top 10 from 500
> You need both stages. Prelims alone would promote the wrong candidates.

---

## CONCEPT 4: Evaluation — How to Measure RAG Quality

### WHAT
RAGAS (Retrieval-Augmented Generation Assessment) is the standard framework for measuring RAG system quality.

### The 4 Core RAGAS Metrics

```
┌─────────────────────────────────────────────────────────┐
│                   RAGAS METRICS                         │
│                                                         │
│  1. FAITHFULNESS    → Does the answer match the docs?   │
│     (Hallucination check)                               │
│     Score 1.0 = every claim is in the retrieved docs   │
│     Score 0.0 = answer is completely made up           │
│                                                         │
│  2. ANSWER RELEVANCE → Does the answer address the Q?  │
│     (Is the LLM answering what was actually asked?)    │
│                                                         │
│  3. CONTEXT RECALL  → Did retrieval find all needed    │
│     information?                                        │
│     (Compares to ground truth)                         │
│                                                         │
│  4. CONTEXT PRECISION → Were the retrieved chunks      │
│     actually needed?                                    │
│     (No irrelevant chunks wasting context)             │
└─────────────────────────────────────────────────────────┘
```

### HOW to use RAGAS

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall

result = evaluate(
    dataset=your_eval_dataset,  # questions + answers + ground truth
    metrics=[faithfulness, answer_relevancy, context_recall]
)
print(result)
# Output: faithfulness: 0.87, answer_relevancy: 0.91, context_recall: 0.79
```

### 📌 KEY POINT
> **Faithfulness is the most important metric.** Low faithfulness = your LLM is hallucinating.
> If faithfulness < 0.80, your retrieval needs fixing, not your LLM.

---

## CONCEPT 5: Vector Databases — The Storage Layer

### WHAT
A vector database stores and searches embeddings (vectors) efficiently.

### The Key Players

| DB | Best For | Key Feature |
|----|----------|------------|
| **FAISS** (Meta) | Local, fast, no infra | In-memory, no server needed |
| **Pinecone** | Production, managed | Serverless, auto-scale |
| **Chroma** | Local dev, open source | Easy Python integration |
| **Weaviate** | Production + graph | Multi-modal, hybrid search |
| **Qdrant** | Production, self-hosted | Rust-based, very fast |
| **pgvector** | Already using Postgres | Add vector search to existing DB |

### HOW similarity search works

```
Your query:    "What is the refund policy?"
Embed it:      [0.23, -0.87, 0.45, 0.12, ...]  (a vector of 1536 numbers for OpenAI)

For each stored chunk, compute:
cosine_similarity(query_vector, chunk_vector) = dot product / (|A| × |B|)

Return top-K chunks with highest similarity scores.
```

### 📌 KEY POINT
> All vector DBs do the same thing: find nearest neighbors in high-dimensional space.
> The difference is: hosted vs local, speed, cost, and hybrid search support.
> For interviews: know FAISS (free, local) and Pinecone (production, managed).

---

*Topic: RAG Systems | Updated: 2026-06-29 | Birla Opus failed → Never again*
