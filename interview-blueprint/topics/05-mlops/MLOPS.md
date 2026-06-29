# MLOps & LLMOps — Complete Interview Guide

> "How do you know your AI system is working?" — Every senior interview asks this.

---

## CONCEPT 1: LLMOps — What It Is

### WHAT
LLMOps = the practices and tools for deploying, monitoring, and improving LLM-based systems in production.

Traditional MLOps deals with accuracy metrics (precision, recall).
LLMOps is different because:
- LLM output is text → you can't calculate "accuracy" with a simple formula
- Quality is subjective — "good answer" requires human or LLM judgment
- Models are rented (APIs), not owned → cost management is critical

### The 5 Pillars of LLMOps

```
1. EVALUATION  → How good are the responses? (RAGAS, human eval, LLM-judge)
2. OBSERVABILITY → What is happening in production? (logs, traces, dashboards)
3. COST CONTROL → How much are we spending per query? (token budgets, caching)
4. VERSIONING  → Which prompt version is in production? (prompt management)
5. IMPROVEMENT → How do we get better over time? (feedback loops, fine-tuning)
```

---

## CONCEPT 2: Evaluation Frameworks

### RAGAS (Retrieval-Augmented Generation Assessment)

The standard for evaluating RAG systems:

```
┌──────────────────────────────────────────────────────────┐
│                RAGAS METRICS                             │
│                                                          │
│  FAITHFULNESS (0–1):                                    │
│  "Is every claim in the answer supported by the docs?"  │
│  1.0 = perfect, 0.0 = pure hallucination                │
│                                                          │
│  ANSWER RELEVANCY (0–1):                                │
│  "Does the answer actually address the question?"        │
│  Catches: answers that are true but off-topic           │
│                                                          │
│  CONTEXT RECALL (0–1):                                  │
│  "Did retrieval find all the info needed?"              │
│  Compares against a ground truth answer                 │
│                                                          │
│  CONTEXT PRECISION (0–1):                               │
│  "Were the retrieved chunks actually needed?"           │
│  Catches: noisy retrieval with irrelevant chunks        │
└──────────────────────────────────────────────────────────┘

Target scores for production:
→ Faithfulness > 0.85 (critical — anything lower = hallucination risk)
→ Answer Relevancy > 0.80
→ Context Recall > 0.75
```

### LLM-as-Judge

When you don't have ground truth labels, use another LLM to evaluate:

```python
eval_prompt = """
You are an evaluation judge. Score the answer from 0–10.

Question: {question}
Answer: {answer}
Context provided: {context}

Score criteria:
- 10: Perfect, accurate, concise, fully grounded in context
- 7–9: Mostly accurate, minor gaps
- 4–6: Partially correct, some hallucination
- 0–3: Mostly wrong or hallucinated

Output ONLY a JSON: {"score": X, "reason": "..."}
"""
```

Pros: No ground truth needed, scalable
Cons: LLM judge can be biased, needs its own validation

### 📌 KEY POINT
> Always start with faithfulness score. If it's below 0.80, you have a hallucination problem.
> Fix the retrieval first, not the LLM.

---

## CONCEPT 3: Observability

### WHAT to Monitor in Production

```
LATENCY:
  P50 (median) < 2s for most chat applications
  P99 (worst case) < 5s
  Track: retrieval latency + LLM latency + total

COST:
  Cost per query = (input tokens + output tokens) × price per token
  Track daily spend, cost per user, cost per query type

QUALITY:
  Faithfulness score (from RAGAS or LLM judge)
  User feedback (thumbs up/down, explicit ratings)
  Query success rate (did the user have to rephrase?)

FAILURES:
  Timeout rate
  Retrieval returning 0 results
  LLM refusing to answer (safety filters)
  Agent loops without completing
```

### Tools

| Tool | Purpose |
|------|---------|
| LangSmith | LangChain-native tracing, full call visualization |
| LangFuse | Open-source LLMOps, traces + evaluations |
| Helicone | LLM cost tracking, caching |
| Weights & Biases | Experiment tracking, evals |
| Prometheus + Grafana | Infrastructure metrics |

---

## CONCEPT 4: Caching Strategy

Caching is your #1 cost reduction tool. Know the two types:

```
TYPE 1: EXACT CACHE
→ User asks same question word-for-word
→ Return cached answer instantly (0 tokens, 0 cost)
→ Use Redis with query as key
→ TTL: 24h for static docs, 1h for dynamic data

TYPE 2: SEMANTIC CACHE
→ User asks SIMILAR question (different words, same meaning)
→ Example: "What is the return policy?" and "How do I return an item?"
→ Embed the query → search cache by similarity → if similarity > 0.95, return cached
→ Tools: GPTCache, Langchain semantic cache

Combined savings: 40–60% cost reduction in typical enterprise apps
```

---

## CONCEPT 5: Deployment Patterns

### API-based vs Self-hosted

```
API-BASED (OpenAI, Anthropic, Cohere):
+ Fast to start, no infra
+ Pay per token
+ Always latest model
- Data leaves your servers (compliance risk)
- Cost at scale is high
- No control over model

SELF-HOSTED (vLLM, Ollama, TGI):
+ Data stays in your environment
+ Cheaper at very high scale
+ Full control
- Engineering overhead
- You manage GPU infra
- Slower to update models

HYBRID (most production systems):
→ Sensitive data → self-hosted Llama 3
→ Complex reasoning → OpenAI API
→ High-volume simple tasks → fine-tuned small model
```

### vLLM — The Standard for Self-hosting

```bash
# Start a local LLM server with vLLM
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3-8B-Instruct \
    --host 0.0.0.0 \
    --port 8000
    
# vLLM key features:
# - Continuous batching (serves multiple users efficiently)
# - PagedAttention (handles long contexts efficiently)
# - Same API as OpenAI (easy drop-in replacement)
```

---

## CONCEPT 6: The Feedback Loop

### How Production Systems Improve Over Time

```
Week 1: Deploy RAG system
Week 2: Collect user feedback (thumbs up/down, corrections)
Week 3: Identify failure patterns (what types of queries fail most?)
Week 4: Improve retrieval for those query types
Week 8: Fine-tune a smaller model on the good (question, answer) pairs
Week 12: A/B test the fine-tuned model vs API model
Month 4: Fine-tuned model is 70% of traffic (cheaper, as good)
```

### 📌 KEY POINT
> Every user interaction is training data for tomorrow's better model.
> Log everything. Anonymize. Keep. This is your competitive advantage.

---

*Topic: MLOps/LLMOps | Updated: 2026-06-29*
