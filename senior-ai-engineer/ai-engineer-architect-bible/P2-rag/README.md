# P2 — RAG Application
### Golden Memory: `Retrieve → Rank → Augment → Generate`

> **2-minute promise:** Read this page top to bottom. Click any link. You will understand the full RAG architecture — and be able to explain it in any interview.

---

## 🗺️ What is this pattern?

You have a user. They ask a question. Instead of trusting the LLM's training data, you **first retrieve relevant documents** from your own knowledge base, then pass them to the LLM as context.

RAG = **Retrieval-Augmented Generation**. The LLM's answer is grounded in YOUR documents, not hallucinated from training.

**When to use it:**
- Company knowledge base Q&A
- Document search / chat-with-PDF
- Product documentation assistant
- Legal / compliance Q&A
- Any domain where accuracy > creativity

---

## 🧭 Navigation — Click to explore

| What you want | Go here |
|---|---|
| 🎨 **See the INTERACTIVE flow** (colorful, clickable, animated) | [→ **flow.html**](./flow.html) ← open in browser |
| 📄 **Mermaid flow** (VS Code / GitHub) | [→ flow.md](./flow.md) |
| 💻 **See the production code** (copy-paste ready) | [→ code.py](./code.py) |
| 🧠 **Understand it in 2 minutes** (mental model, story) | [→ mental-model.md](./mental-model.md) |
| 🎯 **Interview Q&A + what to say** | [→ cheatsheet.md](./cheatsheet.md) |
| ➕ **Add something new to this pattern** | [→ extensions.md](./extensions.md) |

---

## ⚡ 30-second summary

```
User uploads documents
       ↓
Parse → Chunk → Embed → Store in Vector DB    ← INGESTION PIPELINE
               (done once, not per query)

User asks a question
       ↓
Embed the question
       ↓
Search vector DB for similar chunks (top-K)
       ↓
Re-rank chunks by relevance                   ← THIS IS YOUR SKILL
       ↓
Build prompt: question + top chunks as context
       ↓
LLM generates answer grounded in your docs
       ↓
Return answer + source citations
```

---

## 🏗️ Real projects using this pattern

| Project | Where it's used |
|---|---|
| AstroIntel 360° | Tenant correction retrieval (TF-IDF cosine similarity over episodic memory) |
| Bench Resource Optimizer | Skills/project matching against employee profiles |
| Any document chat app | Core retrieval loop |

---

## 🔮 Future additions (track here)

When something new comes to this pattern, add it to [extensions.md](./extensions.md).

Examples of what might come:
- New vector DB (Pinecone, Weaviate, Chroma — add to extensions.md)
- Hybrid search (BM25 + vector — add to extensions.md)
- HyDE (Hypothetical Document Embedding — add to extensions.md)
- Contextual compression (add to extensions.md)
