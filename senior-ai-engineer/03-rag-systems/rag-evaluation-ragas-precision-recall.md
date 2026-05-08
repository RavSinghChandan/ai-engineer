# Senior AI Engineer — Module 3
# Topic: RAG Evaluation — RAGAS Metrics, Precision@K, Recall (Senior-Only Topic)

---

## 1. Intuition

You cannot improve what you cannot measure. RAG evaluation is how you know whether your RAG system is actually working — not just for the 5 queries you tested during development, but systematically.

Senior engineers build eval pipelines before or alongside the RAG pipeline. Junior engineers add evaluation as an afterthought when users start complaining.

---

## 2. Core Concept

RAG evaluation has two components: retrieval evaluation (did we get the right chunks?) and generation evaluation (did the LLM use them correctly?).

### RAGAS Metrics (industry standard for RAG evaluation)

**Faithfulness:**
Does the answer stick only to the provided context?
Score 0-1. Low score = LLM is hallucinating beyond retrieved content.
Formula: number of answer claims supported by context / total claims in answer

**Answer Relevancy:**
Does the answer actually address the question asked?
Score 0-1. Low score = answer is grounded but off-topic.
Measured by: generate N questions from the answer, check how similar they are to the original question.

**Context Precision:**
Of the retrieved chunks, how many were actually useful for generating the answer?
Score 0-1. Low score = retrieval is returning noisy, irrelevant chunks.
Formula: proportion of retrieved chunks that contributed to the answer

**Context Recall:**
Was all the information needed to answer the question actually retrieved?
Score 0-1. Low score = key information was not retrieved (missed by search).
Requires: ground truth answer to compare against.

### Classic Information Retrieval Metrics

**Precision@K:**
Of the top-K retrieved documents, what fraction are relevant?
Precision@5 = 0.8 means 4 out of 5 retrieved chunks were relevant.

**Recall@K:**
Of all the relevant documents in the corpus, what fraction were in the top-K results?
Recall@5 = 0.7 means you retrieved 70% of all relevant documents within top-5.

**MRR (Mean Reciprocal Rank):**
Measures how early the first relevant result appears in the ranked list.
MRR = 1 if the first result is relevant, 0.5 if the second result is first relevant, 0.33 if third, etc.

---

## 3. Why / When It Matters

Evaluate RAG when:
- Before first deployment: establish a quality baseline
- After any change: chunking, embedding model, retrieval strategy, prompt change
- Weekly in production: catch slow degradation from stale indexes or distribution shift
- After user complaint: reproduce the failure and add it to your eval set

If you skip evaluation:
- You deploy improvements that actually hurt quality
- You cannot diagnose user-reported failures
- You cannot compare two retrieval strategies objectively

---

## 4. How It Works (Eval Pipeline)

```
Build eval dataset (one-time effort, ongoing maintenance):
  20-100 representative queries
  + ground truth answers (what the correct answer should be)
  + optionally: ground truth relevant chunks (which documents should be retrieved)

Run eval pipeline:
  For each query:
    → run RAG pipeline (retrieve + generate)
    → collect: retrieved_chunks, generated_answer
  
  Compute per-query RAGAS metrics:
    faithfulness, answer_relevancy, context_precision, context_recall
  
  Aggregate: mean per metric
  
  Compare to baseline → pass/fail → deploy or investigate

Run weekly on a sample of production queries:
  Select 50 queries from recent logs
  Grade them (human or LLM-as-judge)
  Plot metrics over time → alert on degradation
```

---

## 5. Code Skeleton (Production-Grade)

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    context_entity_recall
)
from datasets import Dataset
import pandas as pd
from datetime import datetime

# Build eval dataset
eval_dataset = [
    {
        "question": "What is the refund policy for international orders?",
        "ground_truth": "International order refunds take 14-21 business days and are subject to a 5% processing fee.",
        "ground_truth_context": ["International refunds: 14-21 business days, 5% processing fee applies."]
    },
    {
        "question": "How do I reset my two-factor authentication?",
        "ground_truth": "Go to Security Settings, click Remove Authenticator, verify with email, then set up a new authenticator app.",
        "ground_truth_context": ["2FA reset: Security Settings > Remove Authenticator > email verification > setup new app."]
    }
    # Add 50-100 queries for a solid baseline
]

def run_rag_eval(rag_pipeline, eval_dataset: list[dict]) -> dict:
    results = []
    
    for item in eval_dataset:
        rag_response = rag_pipeline.query(item["question"])
        results.append({
            "question": item["question"],
            "answer": rag_response.answer,
            "contexts": [s["text"] for s in rag_response.sources],
            "ground_truth": item["ground_truth"]
        })
    
    dataset = Dataset.from_list(results)
    
    scores = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall]
    )
    
    return {
        "faithfulness": scores["faithfulness"],
        "answer_relevancy": scores["answer_relevancy"],
        "context_precision": scores["context_precision"],
        "context_recall": scores["context_recall"],
        "timestamp": datetime.utcnow().isoformat(),
        "num_queries": len(eval_dataset)
    }

# Baseline comparison
def compare_to_baseline(current_scores: dict, baseline: dict, thresholds: dict) -> dict:
    regression_alerts = []
    for metric, threshold in thresholds.items():
        if current_scores[metric] < baseline[metric] - threshold:
            regression_alerts.append({
                "metric": metric,
                "baseline": baseline[metric],
                "current": current_scores[metric],
                "drop": baseline[metric] - current_scores[metric]
            })
    return {
        "passed": len(regression_alerts) == 0,
        "regressions": regression_alerts
    }

# Production quality thresholds (tune to your use case)
QUALITY_THRESHOLDS = {
    "faithfulness": 0.85,       # fail if drops below 0.85
    "answer_relevancy": 0.80,
    "context_precision": 0.75,
    "context_recall": 0.70
}

# Precision@K — manual calculation for retrieval-only eval
def precision_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    top_k = retrieved_ids[:k]
    return sum(1 for doc_id in top_k if doc_id in relevant_ids) / k

def recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    top_k = retrieved_ids[:k]
    if not relevant_ids:
        return 0.0
    return sum(1 for doc_id in top_k if doc_id in relevant_ids) / len(relevant_ids)

def mean_reciprocal_rank(retrieved_ids: list[str], relevant_ids: set[str]) -> float:
    for rank, doc_id in enumerate(retrieved_ids, 1):
        if doc_id in relevant_ids:
            return 1.0 / rank
    return 0.0
```

---

## 6. Example (From Your Projects)

**LangChain Service — adding eval:**

The initial LangChain RAG service had no evaluation. To add a production eval layer:

1. Create 30 test Q&A pairs from the document corpus (2-3 hours of work)
2. Run RAGAS eval before each deployment
3. Block deployment if faithfulness drops below 0.85

What we would discover:
- Context precision was likely 0.70-0.75 with 1000-char chunks (many noisy chunks retrieved)
- Reducing to 512-char chunks would likely improve context precision to 0.82-0.85
- Adding reranker would likely push it above 0.88

In interview: "We did not have a formal eval pipeline in the initial demo. For a production version, I would build a 30-50 query eval set on day one, run RAGAS before every deployment, and block releases that drop faithfulness below 0.85 or context precision below 0.75."

---

## 7. Trade-offs

Human evaluation:
+ Gold standard, catches subtle quality issues
- Expensive ($1-5 per evaluated response), slow, not scalable for daily runs

RAGAS automated:
+ Scalable, cheap, consistent, runs in minutes
- Requires a capable LLM to score (costs tokens), not perfect for all query types

Reference-based metrics (need ground truth):
+ Precise measurement against known-correct answers
- Requires building and maintaining a labeled eval dataset

Reference-free metrics (faithfulness, answer relevancy):
+ No ground truth needed, usable on live production traffic
- Less precise than reference-based — measures consistency, not correctness

LLM-as-judge:
+ Flexible, can evaluate nuanced quality
- Inherits LLM biases, results vary with judge model choice

---

## 8. Interview Questions (Senior Level)

- How do you evaluate a RAG system when you have no labeled ground truth?
- What does it mean if context precision is high but context recall is low?
- Your faithfulness score is 0.91 but users are complaining about wrong answers. What do you investigate?
- How do you build and maintain a RAG eval dataset over time?
- What is the difference between evaluating retrieval vs evaluating generation in a RAG system?

---

## 9. Answer Framework

Step 1 — Separate retrieval and generation evaluation:
"RAG evaluation has two components. Retrieval: did we get the right chunks? Generation: did the LLM use them correctly?"

Step 2 — Name the key metrics:
"For retrieval: context precision and context recall. For generation: faithfulness and answer relevancy. I use RAGAS to compute all four."

Step 3 — Explain the eval dataset:
"I maintain a 50-query eval set with ground truth answers. Before every deployment, I run RAGAS on this set. If any metric drops more than 5% from baseline, the deployment is blocked."

Step 4 — From your project:
"The LangChain service demo had no eval. For production, I would build the eval set first — before optimizing anything — because you cannot tune what you cannot measure."

Step 5 — Production monitoring:
"Weekly, I run RAGAS on a 50-sample random batch from live traffic logs. This catches degradation from stale indexes or distribution shift before users notice it."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: Context precision is 0.4 but context recall is 0.9. What does this tell you and what do you do?

Answer:
High recall, low precision means: you are retrieving the relevant chunks (good) but also a lot of irrelevant noise (bad). You are casting a wide net that catches the fish but also a lot of seaweed.
The LLM has to work harder to identify which parts of the context are relevant. With a lot of noise, it may get confused and use irrelevant context, leading to hallucination.
Investigation: look at the retrieved chunks for a few low-precision queries. Are multiple chunks saying the same thing (redundancy)? Are clearly unrelated documents appearing in top-K (wrong embedding or chunking)?
Fix in order: first, add a reranker to filter noisy candidates. Second, raise the similarity threshold to cut low-relevance chunks. Third, apply MMR to reduce redundancy.
After fix: you might see precision rise to 0.75 while recall drops slightly to 0.80 — this is an acceptable trade and significantly improves generation quality.

---

Q2: How do you build a RAG eval dataset when you don't have ground truth?

Answer:
Three approaches to generate synthetic ground truth.
First, use the LLM to generate questions: take each document chunk, ask GPT-4 to generate 2-3 questions that this chunk answers. The chunk becomes the ground truth context for those questions.
Second, use domain experts: have subject matter experts write 20-50 representative questions and answers based on the documents. More accurate but requires human time.
Third, mine production logs: look at real user queries from the first week of production. Sample 50 queries, have a human write the correct answer. These are the most realistic eval examples because they come from actual users.
Quality bar: each eval question should have a clear, verifiable answer in the document corpus. Avoid vague or interpretive questions — they are hard to evaluate consistently.
Maintenance: add new examples whenever you encounter a user-reported failure. The eval set should grow over time, not stay static.

---

Q3: How do you use eval results to decide which RAG optimization to implement next?

Answer:
The metric profile tells you exactly what to fix.
Low context recall (< 0.70): you are missing relevant documents. Fix: improve chunking (reduce chunk size, add overlap), add hybrid search, try query rewriting.
Low context precision (< 0.70): you are retrieving too much noise. Fix: raise similarity threshold, add reranker, reduce top-K.
Low faithfulness (< 0.85): LLM is hallucinating beyond retrieved context. Fix: tighten system prompt ("only answer from context"), lower temperature, add faithfulness gate.
Low answer relevancy (< 0.80): answer is grounded but doesn't address the question. Fix: improve query understanding, check if retrieval is finding the right documents, tune system prompt to be more directive.
This diagnostic framework means you are making targeted improvements based on data — not randomly trying things and hoping quality improves.

---

Q4: What is an acceptable RAGAS score for a production RAG system?

Answer:
There is no universal answer — it depends on the use case and the cost of failure.
General enterprise chatbot (low stakes, informational):
  Faithfulness > 0.85, Answer Relevancy > 0.80, Context Precision > 0.75, Context Recall > 0.70
Medical or legal information system (high stakes, compliance risk):
  Faithfulness > 0.95, add human review for any response below 0.90
Customer support (medium stakes, reputational impact):
  Faithfulness > 0.90, Context Precision > 0.80
The right approach is: establish your baseline on launch day, then track trends. A system at 0.78 faithfulness that is trending upward is healthier than one at 0.85 that is trending downward.
Absolute thresholds matter less than trend detection. Set alerts for drops of more than 5% from your rolling 30-day baseline.

---

Q5: How do you eval a RAG system that has no documents yet (greenfield)?

Answer:
Synthetic evaluation — generate both the documents and the eval dataset.
Step 1: take a representative sample of the document type you will ingest (PDFs, policies, etc.). If you don't have them yet, use representative examples from public domain.
Step 2: generate synthetic Q&A pairs using GPT-4: "Based on this document, write 5 questions and their correct answers."
Step 3: build your RAG pipeline and evaluate against this synthetic dataset.
Step 4: when real documents arrive, run the same evaluation and compare. The synthetic baseline tells you your pipeline is working correctly before real data arrives.
This approach also forces you to think about what types of questions real users will ask — which improves your chunking and retrieval strategy choices before you invest in building them.
The synthetic eval is not your final truth — it is a development scaffold you replace with real eval data as your system matures.
