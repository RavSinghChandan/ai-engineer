# Senior AI Engineer — Module 1
# Topic: Evaluation Metrics (Beyond Accuracy — Production KPIs)

---

## 1. Intuition

Junior engineers pick accuracy as the metric and move on.
Senior engineers ask: "What does a wrong answer actually cost in production?"

The metric you choose defines what your system optimizes for.
Wrong metric choice = system that looks good on paper but fails users in production.

---

## 2. Core Concept

### ML Metrics

- Accuracy: correct predictions / total predictions
  Problem: useless on imbalanced data. If 99% of transactions are legit, predicting "legit" always gives 99% accuracy but catches zero fraud.

- Precision: of all positive predictions, how many were actually positive
  Use when false positives are costly. Example: spam filter — you don't want to mark real emails as spam.

- Recall: of all actual positives, how many did you catch
  Use when false negatives are costly. Example: fraud detection — missing real fraud is worse than a false alarm.

- F1 Score: harmonic mean of precision and recall
  Use when you need a single number balancing both.

- AUC-ROC: area under the curve of true positive rate vs false positive rate across thresholds
  Use to evaluate classifier quality independent of threshold. Good for comparing models.

### LLM Metrics

- BLEU / ROUGE: overlap-based similarity between generated and reference text
  Limitation: high overlap ≠ high quality. A paraphrase scores low but is semantically correct.

- Faithfulness: does the answer stick to the provided context? (critical for RAG)
  Measured by RAGAS, TruLens, or human eval.

- Answer Relevance: does the answer address what was asked?
  Can be scored by an LLM judge (GPT-4 scoring 1-5).

- Hallucination Rate: what % of responses contain factual claims not in the source context?
  This is your most important production LLM metric.

- Latency P50 / P95 / P99: median and tail latency of LLM responses
  P50 tells you the typical experience. P99 tells you worst case for your slowest users.

- Cost per query: total token spend / number of queries
  Tracked daily in production. This is how you catch prompt bloat early.

---

## 3. Why / When to Use

Choose metrics based on what failure costs:

| Task | Primary Metric | Why |
|---|---|---|
| Fraud detection | Recall | Missing fraud = financial loss |
| Spam filter | Precision | False positive = lost real email |
| RAG chatbot | Faithfulness + Relevance | Hallucination = trust damage |
| LLM API service | Latency P95 + Cost/query | SLA breach = SLA penalties |
| Classification | F1 or AUC-ROC | Need balance on imbalanced data |

Senior rule: always define the metric BEFORE building. If you define it after, you optimize for the wrong thing.

---

## 4. How It Works (Pipeline)

### Offline Evaluation (before deploying):
```
Test dataset → Model → Predictions → Compare to ground truth → Compute metrics → Pass/Fail threshold
```

### Online Evaluation (after deploying — production):
```
Live traffic → Log inputs/outputs → Sample for human review → LLM-as-judge scoring → Dashboard → Alert on drift
```

### LLM Evaluation with RAGAS:
```
Query + Retrieved Context + LLM Answer
    ↓
RAGAS evaluates:
  - Faithfulness: is answer grounded in context?
  - Answer Relevance: does it answer the question?
  - Context Precision: was the right context retrieved?
  - Context Recall: was all relevant context retrieved?
    ↓
Score per dimension (0-1) → aggregate → track over time
```

---

## 5. Code Skeleton (Production-Grade)

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

# Build eval dataset from your RAG pipeline logs
eval_data = {
    "question": ["What is the refund policy?", "How to reset password?"],
    "answer": ["Refunds are processed in 5-7 days.", "Click forgot password on login page."],
    "contexts": [
        ["Refunds take 5-7 business days after approval."],
        ["Use the forgot password link on the login screen."]
    ],
    "ground_truth": ["Refunds take 5-7 business days.", "Click forgot password link."]
}

dataset = Dataset.from_dict(eval_data)

result = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall]
)

print(result)
# faithfulness: 0.94 | answer_relevancy: 0.89 | context_precision: 0.91 | context_recall: 0.87

# Production: run this on a 50-sample daily batch from live traffic logs
# Alert if faithfulness drops below 0.85 — signals prompt or retrieval regression
```

### LLM-as-judge pattern (when you don't have ground truth):

```python
def llm_judge_score(question: str, answer: str, context: str) -> dict:
    prompt = f"""You are evaluating an AI assistant's response.
    
Question: {question}
Context provided to AI: {context}
AI Answer: {answer}

Score the answer on:
1. Faithfulness (1-5): Is the answer grounded only in the provided context?
2. Relevance (1-5): Does the answer actually address the question?

Respond in JSON: {{"faithfulness": X, "relevance": X, "reasoning": "..."}}"""

    response = call_llm(system_prompt="You are a strict evaluator.", user_message=prompt)
    return json.loads(response)
```

---

## 6. Example (From Your Projects)

**AstroIntel 360° — what you actually measured:**

In production, the key metrics were:
- Hallucination rate: Meta Consensus Agent reduced per-domain hallucination by cross-validating across 5 agents. If only 1 agent gave a result, confidence = LOW (signal: high hallucination risk).
- Latency P95: parallel agent execution brought P95 down from ~6 minutes to ~15 seconds.
- Translation faithfulness: verified that LLM-translated text preserved meaning by spot-checking high-frequency strings — caught `hw_bullet.type` enum corruption early.
- Cost per report: capped max_tokens per agent. Estimated 40% cost reduction vs uncapped.

**In a senior interview, frame it this way:**
"We did not have formal RAGAS scores for AstroIntel because it's a generative insight system without ground truth. Instead, we used consensus as a proxy for reliability and tracked latency + token cost per report as our production KPIs."

---

## 7. Trade-offs

Single-metric optimization:
+ Simple, easy to track
- Optimizes for one dimension, degrades others (high recall = many false positives)

Multi-metric dashboard:
+ Full picture of system health
- More complex alerting, harder to decide "is the system good or not"

Human evaluation:
+ Most accurate for LLM quality
- Expensive, slow, not scalable — use for calibration, not continuous monitoring

LLM-as-judge:
+ Scalable, consistent, cheap
- Inherits LLM bias, cannot catch all failure modes — use alongside human eval

---

## 8. Interview Questions (Senior Level)

- Your RAG system accuracy is 87% — is that good? How do you decide?
- How do you evaluate an LLM system when you have no ground truth?
- What metric would you use to detect hallucination in production at scale?
- How do you monitor LLM quality without a human in the loop for every request?
- Production alert went off — LLM latency P95 jumped from 2s to 8s. What do you check first?

---

## 9. Answer Framework

Step 1 — Reject the naive answer:
"Accuracy alone is not enough. The metric depends on what failure costs in the specific use case."

Step 2 — State the right metric for the context:
"For a RAG chatbot, I track faithfulness and answer relevancy using RAGAS, not just BLEU."

Step 3 — Explain production monitoring:
"In production, I run nightly RAGAS evaluation on a 50-sample batch from live logs. I alert if faithfulness drops below 0.85."

Step 4 — Add the cost angle:
"I also track cost per query and latency P95 as operational KPIs — these are as important as quality metrics for a production LLM service."

Step 5 — Close with what you'd scale to:
"At higher traffic, I'd add an LLM-as-judge layer that scores every response asynchronously and feeds a quality dashboard — so I catch degradation before users report it."

---

## 10. Advanced Follow-ups (Senior-Level Answers)

Q1: How do you handle evaluation when you have no labeled ground truth?

Answer:
Three approaches.
First, LLM-as-judge: use a separate stronger LLM (GPT-4o) to score your system's outputs on faithfulness and relevance. Not perfect but scalable.
Second, user signals: thumbs up/down, session abandonment, follow-up questions. These are implicit quality signals at scale.
Third, reference-free metrics: RAGAS faithfulness and answer relevancy do not require ground truth — they evaluate whether the answer is grounded in retrieved context.
In practice, I combine all three: RAGAS for automated daily scoring, user signals for trend detection, and periodic human review (10 samples/week) for calibration.

---

Q2: Latency P95 spiked. Walk me through your debugging process.

Answer:
Start with the most likely causes in order.
First, check token count on recent requests — prompt bloat is the most common culprit. A new feature may have added context that doubled input tokens.
Second, check the LLM provider status page — API slowdowns happen and are outside your control.
Third, check your retrieval layer — if RAG vector search is slow, it adds to total latency before the LLM even starts.
Fourth, check concurrency — if a batch job is running alongside user requests, it may be saturating your API quota.
Fix: add per-request logging of token count, retrieval time, and LLM time separately so you can pinpoint the bottleneck in under 5 minutes next time.

---

Q3: How do you evaluate a multi-agent system where each agent contributes to the final answer?

Answer:
Evaluate at two levels.
Per-agent evaluation: score each agent's output independently — does Agent A's retrieval recall the right context? Does Agent B's generation stay faithful to that context?
End-to-end evaluation: score the final output against user intent.
In AstroIntel, I evaluated the Meta Consensus Agent by checking whether the consensus confidence (HIGH/MEDIUM/LOW) correlated with user satisfaction — HIGH confidence answers had lower follow-up question rates.
The key is instrumenting each agent's output as a loggable artifact, not just the final response.

---

Q4: A stakeholder asks "how accurate is our AI chatbot?" How do you respond?

Answer:
I reframe the question before answering.
"Accuracy" for a generative AI system is not a single number. I would present three dimensions:
First, faithfulness: 94% of answers are grounded only in our document context, not hallucinated.
Second, relevance: 89% of answers actually address what the user asked.
Third, user satisfaction: based on thumbs-up/down signals, 82% positive.
I would present these on a dashboard with trend lines, not just point-in-time numbers, so the stakeholder can see whether quality is improving or degrading over releases.

---

Q5: When would you NOT use automated metrics and insist on human evaluation?

Answer:
Four cases where automated metrics are insufficient.
First, when launching a new system — automated metrics need calibration against human judgment before you trust them.
Second, when the task involves nuance that LLM judges miss — e.g., cultural sensitivity, regulatory compliance, legal accuracy.
Third, when you see a sudden metric anomaly — automated scores dropped 10%. Before acting, sample 20 real cases and have a human confirm the signal is real, not a data pipeline bug.
Fourth, when the cost of a wrong answer is high — medical, legal, financial use cases need human sign-off on evaluation methodology.
Human eval is expensive but it's your ground truth. Use it to calibrate your automated metrics, not replace them.
