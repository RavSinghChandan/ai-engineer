
# Module 6 — MLOps for LLMs  
# Topic: Versioning (Models, Prompts, Data)

---

## 1. Intuition

Versioning means keeping track of changes in models, prompts, and data.

Simple idea:
- Old version → New version → Track changes → Compare results  

---

## 2. Core Concept

In AI systems, we version:

- Models (different LLM versions)  
- Prompts (prompt updates)  
- Data (training or RAG data)  

Purpose:
- Reproducibility  
- Debugging  
- Performance comparison  

---

## 3. Why / When to Use

- Production systems  
- Frequent updates  
- Experimentation  

Important:
Without versioning → hard to track what changed  

---

## 4. How It Works (Pipeline)

1. Create version (model/prompt/data)  
2. Deploy version  
3. Track performance  
4. Compare with previous version  
5. Keep best version  
6. Rollback if needed  

---

## 5. Code Skeleton

### Prompt Versioning
```python
prompt_v1 = "Explain AI"
prompt_v2 = "Explain AI in simple terms with examples"

current_prompt = prompt_v2
````

### Model Versioning

```python id="n7k4zr"
model = "gpt-4"  # version selection
```

### Version Tracking

```python id="v2m9qs"
version_log = {
    "model": "gpt-4",
    "prompt": "v2",
    "data_version": "v1"
}
```

---

## 6. Example (Real System)

* Chatbot:
  Test new prompt versions

* RAG system:
  Update embeddings or data

* Your system:
  Track different agent behaviors and prompts

---

## 7. Trade-offs

Versioning:

* Better tracking
* Easy rollback

- More complexity

No Versioning:

* Simple

- Hard to debug

---

## 8. Interview Questions

* What is versioning in AI?
* Why version prompts?
* How do you manage changes?

---

## 9. Answer Framework

Start:
“Versioning tracks changes in models, prompts, and data”

Then:
“It helps in reproducibility and debugging”

Then:
“We compare versions and select best one”

Then:
“Also allows rollback in case of issues”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why is prompt versioning important?

Answer:
Small prompt changes can significantly affect output.
Versioning helps track and compare these changes.

---

Q2: What is model versioning?

Answer:
Tracking different versions of models like GPT-3.5, GPT-4.
Helps in comparing performance.

---

Q3: What is rollback?

Answer:
Reverting to previous stable version if new version fails.

---

Q4: How do you compare versions?

Answer:

* A/B testing
* Performance metrics
* User feedback

---

Q5: What tools are used for versioning?

Answer:

* Git (for prompts/code)
* Experiment tracking tools
* Model registry systems

---

```
```
