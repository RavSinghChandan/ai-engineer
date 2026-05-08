# Senior AI Engineer — Module 3
# Topic: Advanced RAG Patterns — Self-RAG, Corrective RAG, HyDE (Senior-Only Topic)

---

## 1. Intuition

Standard RAG is retrieve-once, generate-once. Advanced RAG patterns are for when standard RAG fails — when the retrieval quality is inconsistent, when the query needs reformulation, or when the first answer is not good enough.

These are the patterns that separate senior AI engineers from engineers who only know the basic pipeline. Expect these to come up in senior interviews.

---

## 2. Core Concept

### HyDE (Hypothetical Document Embeddings)
Problem: user queries and document text are stylistically different. A question like "how do I handle timeout errors?" has a different embedding than the answer "To handle timeout exceptions, use a try/catch block with TimeoutException...".
HyDE solution: generate a hypothetical ideal answer to the query first, then use that answer's embedding for retrieval — answers find answers, not questions.

```
User Query: "How do I handle timeout errors?"
    ↓
LLM generates hypothetical answer (no retrieval yet):
  "TimeoutException handling requires configuring socket timeout settings and implementing retry logic..."
    ↓
Embed the hypothetical answer
    ↓
Search vector DB with this embedding
    ↓
Retrieved chunks match the style and content of real answers
    ↓
Re-run LLM with retrieved chunks (actual grounded answer)
```

### Self-RAG
Self-RAG adds self-reflection — the LLM decides when retrieval is needed and evaluates its own output.

Special tokens:
- [Retrieve]: model decides retrieval is needed for this query
- [No Retrieve]: model decides it can answer from knowledge alone
- [Relevant]: retrieved chunk is relevant — use it
- [Irrelevant]: retrieved chunk is not useful — discard it
- [Supported]: generated statement is supported by retrieved context
- [Contradicted]: statement contradicts retrieved context — revise

Flow:
```
Query
    ↓
LLM outputs [Retrieve] or [No Retrieve]
    ↓ (if Retrieve)
Retrieve chunks
    ↓
LLM evaluates each chunk: [Relevant] or [Irrelevant]
    ↓
LLM generates answer using only Relevant chunks
    ↓
LLM self-evaluates: [Supported] or [Contradicted] per statement
    ↓
Final answer with self-verified claims
```

### Corrective RAG (CRAG)
Problem: standard RAG uses whatever was retrieved, even if it is not actually relevant.
CRAG solution: after retrieval, evaluate retrieved document quality. If quality is LOW, trigger web search or corpus expansion. If quality is AMBIGUOUS, use both retrieved docs + web search.

```
Query
    ↓
Retrieve from vector DB
    ↓
Relevance evaluator scores retrieved docs (0-1)
    ↓
Score > 0.7 → use retrieved docs → generate answer
Score 0.3-0.7 → AMBIGUOUS → use retrieved + web search results
Score < 0.3 → POOR → fall back to web search entirely
    ↓
Knowledge refinement: strip irrelevant content from retrieved docs
    ↓
LLM generates answer from refined context
```

### Multi-Query RAG
Problem: a single query embedding may miss relevant documents phrased differently.
Solution: generate multiple semantic variations of the query, retrieve for each, merge results.

```
User Query: "What are the side effects of aspirin?"
    ↓
LLM generates variants:
  - "Aspirin adverse reactions"
  - "Side effects of acetylsalicylic acid"
  - "When should you not take aspirin?"
    ↓
Retrieve for each → merge → deduplicate → rerank
    ↓
Use merged context for generation
```

---

## 3. Why / When to Use

| Pattern | Use When | Cost |
|---|---|---|
| HyDE | Retrieval quality is poor despite good embedding model; query and document styles differ significantly | One extra LLM call before retrieval |
| Self-RAG | Need selective retrieval (not every query needs retrieval); need self-verified answers | More complex, requires fine-tuned model or prompt simulation |
| CRAG | Retrieved docs are sometimes irrelevant; need fallback to external knowledge | Relevance evaluator + optional web search cost |
| Multi-Query | Single query retrieval misses relevant documents; diverse query formulations needed | 2-3x retrieval calls, slightly higher latency |

---

## 4. How It Works (Code)

```python
# HyDE implementation
def hyde_retrieval(user_query: str, vector_store, top_k: int = 5) -> list[dict]:
    # Step 1: generate hypothetical answer
    hypothetical_answer = call_llm(
        system_prompt="Generate a detailed, factual answer to the following question. This will be used for document retrieval — write it in the style of an expert technical document.",
        user_message=user_query
    )
    
    # Step 2: embed the hypothetical answer (not the query)
    hyde_vector = embed_text(hypothetical_answer)
    
    # Step 3: retrieve using hypothetical answer embedding
    results = vector_store.search(hyde_vector, top_k=top_k)
    
    return results

# Multi-Query RAG
def multi_query_retrieval(user_query: str, vector_store, top_k: int = 5) -> list[dict]:
    # Step 1: generate query variants
    variants_response = call_llm(
        system_prompt="Generate 3 different ways to search for the answer to this question. Return as a JSON array of strings.",
        user_message=user_query
    )
    
    import json
    try:
        query_variants = json.loads(variants_response)
    except json.JSONDecodeError:
        query_variants = [user_query]  # fallback to original
    
    # Step 2: retrieve for each variant
    all_results = []
    seen_ids = set()
    
    for variant in [user_query] + query_variants[:2]:  # original + 2 variants max
        results = vector_store.search(embed_text(variant), top_k=top_k * 2)
        for r in results:
            if r["id"] not in seen_ids:
                all_results.append(r)
                seen_ids.add(r["id"])
    
    # Step 3: sort by score, return top-k
    all_results.sort(key=lambda x: x["score"], reverse=True)
    return all_results[:top_k]

# CRAG relevance evaluator
def crag_pipeline(query: str, vector_store, web_search_fn=None) -> str:
    # Step 1: retrieve
    results = vector_store.search(embed_text(query), top_k=5)
    
    if not results:
        relevance_score = 0.0
    else:
        # Step 2: evaluate relevance using LLM
        top_doc_text = results[0]["text"]
        eval_response = call_llm(
            system_prompt="Rate the relevance of this document to the question on a scale of 0.0 to 1.0. Respond with only a number.",
            user_message=f"Question: {query}\n\nDocument: {top_doc_text}"
        )
        try:
            relevance_score = float(eval_response.strip())
        except ValueError:
            relevance_score = 0.5
    
    # Step 3: route based on relevance
    if relevance_score >= 0.7:
        context_sources = [r["text"] for r in results[:3]]
        source_label = "retrieved documents"
    elif relevance_score >= 0.3 and web_search_fn:
        web_results = web_search_fn(query)
        context_sources = [r["text"] for r in results[:2]] + web_results[:2]
        source_label = "retrieved documents and web search"
    elif web_search_fn:
        context_sources = web_search_fn(query)[:4]
        source_label = "web search"
    else:
        return "I don't have reliable information to answer this question."
    
    context = "\n\n".join(context_sources)
    return call_llm(
        f"Answer based on {source_label}. If answer is not in the context, say 'I don't know.'",
        f"Context:\n{context}\n\nQuestion: {query}"
    )
```

---

## 5. Example (From Your Projects — Senior Framing)

**When would I apply these in AstroIntel or LangChain?**

HyDE application:
The LangChain service handles queries about technical documentation. User asks "connection pool error spring boot" — a terse developer query. The document might say "Configure the maximum number of pooled connections using spring.datasource.hikari.maximum-pool-size". These have different embeddings.
HyDE would generate "A connection pool error in Spring Boot typically occurs when HikariCP exhausts the maximum-pool-size..." — this hypothetical answer matches the documentation style much better.

Multi-query application:
AstroIntel could benefit if it had a document RAG layer. A question like "when will I get married?" would generate variants:
- "Marriage timing prediction in Vedic astrology"
- "Transit aspects indicating marriage"
- "Dasha periods associated with relationship"
Multi-query ensures all relevant astrological literature is retrieved, not just documents that match the literal phrasing.

In interview: "I know these advanced patterns and would apply them selectively. HyDE when query-document style mismatch is measured. Multi-query when single-query recall is below target. I would not apply all of them by default — each adds latency and complexity that must be justified by measured quality improvement."

---

## 6. Trade-offs

HyDE:
+ Significant retrieval improvement when query and document styles differ
- One extra LLM call before retrieval adds 500-1000ms; hypothetical answer may be wrong

Self-RAG:
+ Selective retrieval (cheaper for queries that don't need it), self-verified output
- Requires special training or complex prompt simulation; harder to control reliably

CRAG:
+ Handles poor retrieval gracefully with fallback
- Relevance evaluation adds latency and cost; web search adds external dependency

Multi-query:
+ Higher recall, handles diverse query formulations
- 2-3x retrieval cost and latency; more complex deduplication logic

---

## 7. Interview Questions (Senior Level)

- What is HyDE and when would you use it over standard embedding retrieval?
- What is Self-RAG and how does it differ from standard RAG architecturally?
- If your RAG system sometimes returns irrelevant context, what advanced pattern would you apply?
- How would you decide which advanced RAG pattern to implement first for a system with poor retrieval quality?
- What is the cost-quality trade-off of adding multi-query retrieval to a production system?

---

## 8. Answer Framework

Step 1 — Acknowledge advanced patterns are selective improvements:
"Advanced RAG patterns add complexity and latency. I apply them only when standard RAG has a measured quality gap that the pattern specifically addresses."

Step 2 — Map symptoms to patterns:
"Poor retrieval precision → CRAG or reranker. Query-document style mismatch → HyDE. Single-query missing relevant docs → multi-query. Need selective retrieval → Self-RAG framing."

Step 3 — From your project:
"In the LangChain service, the basic RAG worked well for conversational queries. For technical documentation with jargon, HyDE would improve retrieval quality — developer queries are sparse, documents are detailed."

Step 4 — Cost awareness:
"Each advanced pattern adds one or more LLM calls. HyDE adds one LLM call before retrieval. Multi-query adds 2-3 additional retrieval calls. I budget for this in the latency SLA before implementing."

Step 5 — Measurement-first approach:
"Before applying any advanced pattern, I measure baseline recall and precision with RAGAS. I apply the pattern, measure again. If quality improves by more than 10% and latency is acceptable, I keep it."

---

## 9. Advanced Follow-ups (Senior-Level Answers)

Q1: In an interview, how do you explain HyDE to a non-technical interviewer?

Answer:
"Imagine you are trying to find a book in a library by asking a librarian 'where are books about handling errors in programming?' The librarian might not understand your question precisely.
But if you write out what you expect the answer to look like — 'I need something that says: when an exception occurs, catch it and retry with exponential backoff' — and the librarian searches for books that look like THAT, they find the right section immediately.
HyDE does the same thing: instead of searching with your question, we first write out what a good answer would look like, then search for documents that match that answer. This is much more reliable when user questions are phrased differently from how the documents are written."

---

Q2: What are the risks of HyDE?

Answer:
Two main risks.
First, the hypothetical answer may be wrong. If the LLM generates an incorrect hypothetical answer, its embedding leads you to retrieve documents that support a wrong premise. You then generate a response grounded in documents that confirmed a false hypothesis.
Mitigation: use HyDE alongside standard retrieval, not instead of it. Run both, merge results. A wrong hypothetical answer's retrieval will be diluted by correct standard retrieval results.
Second, extra latency: HyDE adds one LLM call before the retrieval step. This adds 500-2000ms depending on the model and query complexity. For latency-sensitive applications, this may be unacceptable.
Mitigation: apply HyDE only to queries where standard retrieval failed (below similarity threshold). Use it as a fallback, not as the primary path.

---

Q3: How would you implement Self-RAG without a fine-tuned model?

Answer:
Self-RAG as a research paper requires a fine-tuned model that produces special tokens. But you can simulate the key behaviors with prompt engineering.
Simulate retrieval decision: add a pre-retrieval check. Ask the LLM: "Can you answer this question accurately from general knowledge, or do you need to search documents?" Route based on the response.
Simulate relevance evaluation: after retrieval, for each chunk ask the LLM: "Is this document relevant to the question? Answer yes or no." Filter to relevant chunks only.
Simulate output verification: after generation, ask the LLM to review each claim in the answer against the retrieved context. Flag claims that lack context support.
This is more expensive than a fine-tuned Self-RAG model but works without training. It is practical for production systems where fine-tuning is not an option.

---

Q4: How do you handle the case where advanced RAG patterns conflict — e.g., HyDE suggests different documents than standard retrieval?

Answer:
Treat conflicting signals as a signal, not an error.
If HyDE retrieves different documents than standard retrieval, it means the query is ambiguous — there are multiple valid interpretations.
Resolution strategy:
First, merge both result sets via RRF. Documents that appear in both have strong combined evidence and should be ranked highest.
Second, use the top-3 from each set (6 total after deduplication) as the context. The LLM will naturally weight the most relevant ones.
Third, if the two result sets are entirely disjoint (no overlap), surface both interpretations in the answer: "Based on technical documentation about X... and also from guides about Y..."
This transparent approach is better than silently picking one result set. It gives the user visibility into the system's uncertainty.

---

Q5: How do you decide whether to use CRAG vs adding a reranker?

Answer:
Different tools for different problems.
Reranker: the right tool when your retrieval is returning mostly relevant documents but in the wrong order. It improves precision without changing which documents are in the candidate set.
CRAG: the right tool when your retrieval is sometimes returning entirely irrelevant documents — not just poorly ranked, but wrong. CRAG detects and replaces low-quality retrievals.
Diagnostic test: look at your RAGAS context precision scores per query. If precision is low (0.3-0.5) on some queries and high on others (0.85+), the variance suggests CRAG. The problem is not ranking — it is that some queries retrieve from the wrong part of the index entirely.
If precision is consistently moderate (0.6-0.7) across all queries, the problem is ranking and a reranker is the better intervention.
In practice: for most production systems, add the reranker first (simpler, lower latency overhead). Add CRAG if you see a pattern of total retrieval failures on specific query types even after reranking.
