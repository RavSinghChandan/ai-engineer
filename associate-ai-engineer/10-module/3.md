
# Module 10 — Advanced Topics  
# Topic: RLHF (Reinforcement Learning from Human Feedback)

---

## 1. Intuition

RLHF means improving a model using human feedback instead of only training data.

Simple idea:
- Model gives answer → human rates → model learns → improves  

---

## 2. Core Concept

RLHF has 3 main steps:

1. Pretraining  
   Model trained on large dataset  

2. Reward Model  
   Humans rank outputs (good vs bad)  
   Model learns what is better  

3. Reinforcement Learning  
   Model is optimized using reward signals  

Goal:
Make model outputs more useful, safe, and aligned  

---

## 3. Why / When to Use

- Improve response quality  
- Align model with human expectations  
- Reduce harmful outputs  

Used in:
- ChatGPT  
- AI assistants  

---

## 4. How It Works (Pipeline)

1. Model generates multiple responses  
2. Humans rank responses  
3. Train reward model  
4. Optimize main model using reward  
5. Deploy improved model  

---

## 5. Code Skeleton (Conceptual)

```python
# Step 1: Generate responses
responses = model.generate(prompt)

# Step 2: Human ranking (simulated)
scores = reward_model(responses)

# Step 3: Optimize model
model.update(scores)
````

---

## 6. Example (Real System)

* ChatGPT:
  Improved using human feedback

* AI assistant:
  Learns better responses over time

* Your system:
  Can use feedback loop for improvement

---

## 7. Trade-offs

RLHF:

* Better alignment
* Improved quality

- Expensive
- Requires human effort

No RLHF:

* Simple

- Less aligned

---

## 8. Interview Questions

* What is RLHF?
* Why is RLHF important?
* How does it work?

---

## 9. Answer Framework

Start:
“RLHF improves model using human feedback”

Then:
“It involves reward model and reinforcement learning”

Then:
“It aligns model with human expectations”

Then:
“Used in modern LLM systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why is RLHF needed?

Answer:
Because training data alone is not enough to align model with human preferences.

---

Q2: What is reward model?

Answer:
A model trained to score outputs based on human feedback.

---

Q3: What are challenges in RLHF?

Answer:

* Expensive
* Requires human labeling
* Difficult to scale

---

Q4: Can RLHF reduce hallucination?

Answer:
Yes, to some extent.
It improves response quality and correctness.

---

Q5: Is RLHF used in all models?

Answer:
Not all, but most modern LLMs use RLHF for better alignment.

---

```
```
