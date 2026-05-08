
# Module 6 — MLOps for LLMs  
# Topic: Monitoring & Evaluation in Production

---

## 1. Intuition

Monitoring means tracking how the AI system performs after deployment.

Simple idea:
- Build model → Deploy → Track performance → Improve  

---

## 2. Core Concept

In production, we monitor:

- Latency (response time)  
- Accuracy (quality of output)  
- Cost (API usage)  
- Errors (failures, crashes)  
- Hallucination rate  

Key idea:
Model performance can degrade over time → must monitor continuously  

---

## 3. Why / When to Use

- Production systems  
- High traffic applications  
- Critical AI systems  

Important:
Without monitoring → system can silently fail  

---

## 4. How It Works (Pipeline)

1. User request  
2. System processes request  
3. Log input and output  
4. Track metrics  
5. Analyze performance  
6. Detect issues  
7. Improve system  

---

## 5. Code Skeleton

### Logging
```python
import logging

logging.info("User Query: %s", query)
logging.info("Response: %s", response)
````

### Simple Metrics Tracking

```python id="x7p3zl"
latency = end_time - start_time

metrics = {
    "latency": latency,
    "token_usage": tokens,
    "error": error_flag
}
```

### Monitoring Example

```python id="u2k9jf"
if latency > threshold:
    alert("High latency detected")
```

---

## 6. Example (Real System)

* Chatbot:
  Track response time and correctness

* RAG system:
  Monitor retrieval accuracy

* Your system:
  Track pipeline efficiency and agent outputs

---

## 7. Trade-offs

Detailed Monitoring:

* Better insights

- Higher cost and complexity

Basic Monitoring:

* Simple

- Limited visibility

---

## 8. Interview Questions

* Why is monitoring important?
* What metrics do you track?
* How do you detect failures?

---

## 9. Answer Framework

Start:
“Monitoring tracks system performance after deployment”

Then:
“We track latency, accuracy, cost, and errors”

Then:
“It helps detect issues and improve system”

Then:
“Essential for production AI systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What metrics are important for LLM systems?

Answer:

* Latency
* Token usage
* Accuracy
* Hallucination rate
* Error rate

---

Q2: How do you detect hallucination in production?

Answer:

* Compare output with source (RAG)
* Use validation rules
* Human feedback

---

Q3: What is alerting?

Answer:
System notifies when something goes wrong.
Example: high latency or high error rate.

---

Q4: How do you improve system based on monitoring?

Answer:

* Optimize prompts
* Improve retrieval
* Fix errors
* Update models

---

Q5: What tools are used for monitoring?

Answer:

* Logging systems
* Metrics dashboards
* Alerting tools
* Observability platforms

---

```
```
