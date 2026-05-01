
# Module 1 — AI Engineering Fundamentals
# Topic: Evaluation Metrics (ML + LLM)

---

## 1. Intuition

Evaluation metrics tell us how good our model is performing.
Without metrics, we cannot know if our system is working correctly or not.

Simple idea:
- Train model → Measure performance → Improve model

Different problems need different metrics:
- Is it a yes/no problem? → Classification metrics
- Is it a number prediction? → Regression metrics
- Is it an LLM response? → LLM-specific metrics

---

## 2. Core Concept

### Classification Metrics (Yes/No, Pass/Fail, Fraud/Not Fraud):

- Accuracy = Out of all predictions, how many were correct?
  Formula: Correct predictions / Total predictions

- Precision = Out of all predicted positives, how many were actually positive?
  Formula: True Positive / (True Positive + False Positive)
  Use when: false alarms are costly (spam filter — you don't want real emails marked spam)

- Recall = Out of all actual positives, how many did we correctly find?
  Formula: True Positive / (True Positive + False Negative)
  Use when: missing a real case is costly (fraud detection — you don't want to miss real fraud)

- F1 Score = Balance between precision and recall
  Formula: 2 × (Precision × Recall) / (Precision + Recall)
  Use when: both false positives and false negatives matter

- AUC-ROC = Measures model's ability to separate classes at different thresholds
  High AUC = model separates well
  Use when: comparing different models or dealing with imbalanced data

### Regression Metrics (Price, score, demand prediction):

- MAE (Mean Absolute Error) = Average of absolute differences between predicted and actual
- RMSE (Root Mean Squared Error) = Penalizes large errors more heavily than MAE
- MSE (Mean Squared Error) = Average of squared differences

### LLM-Specific Metrics:

- BLEU Score: Measures how much the generated text matches reference text (used in translation)
- ROUGE Score: Measures recall — how much of the reference text appears in the generated text (used in summarization)
  - ROUGE-1: unigram overlap
  - ROUGE-L: longest common subsequence
- Context Relevance: Is the retrieved chunk actually relevant to the query? (RAG evaluation)
- Faithfulness: Is the answer grounded in the retrieved context? (RAG evaluation — detects hallucination)
- Answer Relevance: Does the answer actually answer the question? (RAG evaluation)
- LLM-as-Judge: Use another LLM to score the quality of generated responses

---

## 3. Why / When to Use

- Accuracy: Only when classes are balanced. Useless for imbalanced data.
- Precision: When false positives are costly. Example: spam filter.
- Recall: When missing a real case is costly. Example: cancer detection, fraud detection.
- F1: When you need both precision and recall to be good.
- AUC-ROC: When comparing models on imbalanced datasets.
- RMSE: When large errors are especially bad. Example: price prediction.
- MAE: When you want interpretable average error.
- RAGAS (Context Relevance + Faithfulness + Answer Relevance): For evaluating RAG pipelines in production.

---

## 4. How It Works (Pipeline)

### Classification:
1. Model makes predictions (labels)
2. Compare predicted labels with actual labels
3. Build confusion matrix (TP, TN, FP, FN)
4. Calculate metrics from confusion matrix

### Regression:
1. Model predicts numeric values
2. Compare predicted vs actual values
3. Calculate error (difference between predicted and actual)

### LLM Evaluation:
1. LLM generates response
2. Compare with expected answer or retrieved context
3. Score on: correctness, relevance, faithfulness
4. Use RAGAS library or LLM-as-judge for automated evaluation

---

## 5. Code Skeleton

### Classification Metrics

```python
from sklearn.metrics import (
    accuracy_score, precision_score,
    recall_score, f1_score, roc_auc_score
)

accuracy  = accuracy_score(y_true, y_pred)
precision = precision_score(y_true, y_pred)
recall    = recall_score(y_true, y_pred)
f1        = f1_score(y_true, y_pred)
auc       = roc_auc_score(y_true, y_proba)  # y_proba = predicted probabilities

print(f"Accuracy: {accuracy:.2f}")
print(f"Precision: {precision:.2f}")
print(f"Recall: {recall:.2f}")
print(f"F1: {f1:.2f}")
print(f"AUC-ROC: {auc:.2f}")
```

### Regression Metrics

```python
from sklearn.metrics import mean_absolute_error, mean_squared_error
import numpy as np

mae  = mean_absolute_error(y_true, y_pred)
mse  = mean_squared_error(y_true, y_pred)
rmse = np.sqrt(mse)

print(f"MAE: {mae:.2f}")
print(f"RMSE: {rmse:.2f}")
```

### LLM Evaluation using RAGAS

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision

# dataset = list of {question, answer, contexts, ground_truth}
result = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision]
)

print(result)
# Output: faithfulness: 0.87, answer_relevancy: 0.91, context_precision: 0.83
```

### Simple LLM-as-Judge Pattern

```python
from openai import OpenAI

client = OpenAI()

def evaluate_response(question, answer, expected):
    prompt = f"""
    Question: {question}
    Generated Answer: {answer}
    Expected Answer: {expected}
    
    Rate the generated answer from 1-5 on:
    1. Correctness
    2. Relevance
    Give a JSON output: {{"correctness": X, "relevance": X}}
    """
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    return response.choices[0].message.content
```

---

## 6. Example (Real System)

- Fraud Detection system:
  Use Recall as primary metric. You want to catch ALL fraud, even if some normal transactions are flagged.
  High Recall = few real frauds missed. Acceptable to have some false alarms.

- Spam Filter:
  Use Precision. You do NOT want to block real emails.
  High Precision = if it's marked spam, it really is spam.

- Credit Risk Model:
  Use AUC-ROC to compare different model versions. It works well even if only 2% of loans default (imbalanced).

- RAG Chatbot evaluation:
  Use RAGAS pipeline. Measure faithfulness (did it make up data?) and context precision (did it retrieve right chunks?).
  In a real system tracking 10,000 daily queries: if faithfulness drops below 0.80, trigger an alert and investigate retrieval.

---

## 7. Trade-offs

Accuracy:
+ Simple, easy to explain to business
- Completely misleading when data is imbalanced
  Example: 99% normal, 1% fraud → predicting all normal gives 99% accuracy but catches zero fraud

Precision:
+ Reduces false alarms
- You may miss real cases (low recall)

Recall:
+ Catches more real cases
- More false alarms

F1:
+ Balanced measure
- Harder to explain to non-technical stakeholders

RAGAS:
+ Automated, production-grade LLM evaluation
- Requires ground truth labels and adds API cost

---

## 8. Interview Questions

- When is accuracy a bad metric?
- What is the difference between precision and recall?
- When would you choose recall over precision?
- How do you evaluate a RAG system in production?
- What is AUC-ROC and when do you use it?
- What is RAGAS and what does it measure?

---

## 9. Answer Framework

Start:
"Evaluation metrics help us measure model performance. Different problems need different metrics."

Then:
"For classification, I use precision, recall, F1 based on cost of errors."

Then give example:
"In fraud detection I use recall because missing a real fraud is worse than a false alarm."

Then for LLM:
"For RAG systems I use RAGAS — it measures faithfulness, answer relevance, and context precision separately."

Then add production thinking:
"In production, I set thresholds on these metrics and trigger alerts when they drop below acceptable levels."

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why is accuracy a bad metric for imbalanced data?

Answer:
Imagine 95% of transactions are normal, 5% are fraud.
A model that always predicts "not fraud" gets 95% accuracy.
But it catches zero fraud — completely useless.
In this case, recall on the fraud class is the right metric.

---

Q2: Difference between precision and recall in simple terms?

Answer:
Precision: "When I say it's fraud — am I usually right?" (out of predicted fraud, how many are real)
Recall: "How much of the actual fraud did I find?" (out of real fraud, how many did I catch)
They trade off against each other — improving one usually hurts the other.

---

Q3: What is AUC-ROC and when do you use it?

Answer:
AUC = Area Under the Curve of the ROC (Receiver Operating Characteristic) graph.
ROC plots True Positive Rate vs False Positive Rate at different thresholds.
AUC of 1.0 = perfect. AUC of 0.5 = random guessing.
Use it when you want to compare models or evaluate performance across all possible decision thresholds.
Very useful for imbalanced datasets.

---

Q4: How do you evaluate a RAG system in production?

Answer:
Use RAGAS framework with three main metrics:
1. Faithfulness: Does the generated answer match the retrieved context? (detects hallucination)
2. Answer Relevance: Does the answer actually address the question?
3. Context Precision: Did the retriever return the right chunks?

In production, log every query-response pair, run RAGAS evaluation in batch daily, and alert if any metric drops.
If faithfulness drops — the LLM is hallucinating.
If context precision drops — retrieval is broken.
These point to different root causes and different fixes.

---

Q5: What is the confusion matrix?

Answer:
A table that shows:
- True Positive (TP): Predicted fraud, actually fraud
- True Negative (TN): Predicted normal, actually normal
- False Positive (FP): Predicted fraud, actually normal → false alarm
- False Negative (FN): Predicted normal, actually fraud → missed fraud

From this table:
Precision = TP / (TP + FP)
Recall = TP / (TP + FN)

---

Q6: What is ROUGE and when is it used?

Answer:
ROUGE measures how much of the reference text (expected summary) appears in the generated text.
ROUGE-1 checks single word overlap.
ROUGE-L checks longest matching sequence.
Used mainly for evaluating summarization models.
Limitation: high ROUGE does not always mean the answer is factually correct — just that it uses similar words.

---

## Final Note

In senior interviews, examiners ask:
"How did you measure success of your AI system in production?"

Correct answer for an LLM/RAG system:
- I measured faithfulness and answer relevance using RAGAS
- I tracked latency and token cost separately
- I logged every response and ran weekly human evaluation on a sample
- I set up alerts for when faithfulness dropped below 0.80

This is what separates 25+ LPA thinking from fresher thinking.
