
# Hallucination (LLM)

---

## 1. Intuition

Hallucination means the model gives wrong or made-up answers but sounds confident.

Simple idea:
- Model does not “know truth”  
- It predicts what looks correct based on patterns  

---

## 2. Core Concept

LLMs generate text using probability of next word.  
They do NOT verify facts.

So:
- If correct data is not in context → model guesses  
- If prompt is vague → model fills gaps  

Types of hallucination:
- Factual (wrong facts)
- Logical (wrong reasoning)
- Fabricated (made-up sources or data)

---

## 3. Why / When It Happens

- No access to real-time or correct data  
- Poor prompt (unclear question)  
- Model trained on incomplete or noisy data  
- Asking beyond model knowledge  

In production:
Hallucination is a major risk in AI systems  

---

## 4. How It Works (Pipeline View)

1. User gives prompt  
2. Model tokenizes input  
3. Model predicts next tokens based on probability  
4. No fact-checking happens  
5. Output generated (may be wrong but confident)  

Key Insight:
LLM is a **text generator**, not a **fact checker**  

---

## 5. Code Skeleton

### Basic LLM Call
```python
response = llm.generate("Who is the president of Mars?")
print(response)
````

### With RAG (Reduce Hallucination)

```python id="r8zq1p"
docs = vector_db.search(user_query)

context = combine(docs)

response = llm.generate(context + user_query)
```

### With Guard Check

```python id="y4c8hf"
if "I don't know" in response:
    return "No reliable answer found"
```

---

## 6. Example (Real System)

* Without RAG:
  Chatbot gives wrong answer about company policy

* With RAG:
  Chatbot retrieves correct document and answers accurately

* In your system:
  Multi-agent system can cross-check outputs to reduce hallucination

---

## 7. Trade-offs

LLM without control:

* Fast

- High hallucination

LLM with RAG:

* More accurate

- Extra latency

LLM with strict prompts:

* Controlled output

- Less flexible

---

## 8. Interview Questions

* What is hallucination?
* Why does it happen?
* How to reduce hallucination?
* Is hallucination fully solvable?

---

## 9. Answer Framework

Start:
“Hallucination is when LLM generates incorrect but confident answers”

Then:
“It happens because model predicts text, not facts”

Then:
“To reduce it, we use RAG, better prompts, and validation”

Then:
“In production, we combine multiple techniques”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why do LLMs hallucinate?

Answer:
Because they generate text based on probability, not real-world verification.
They don’t have built-in fact-checking mechanism.

---

Q2: Can hallucination be fully removed?

Answer:
No.
It can be reduced but not completely eliminated because model is probabilistic.

---

Q3: How does RAG reduce hallucination?

Answer:
RAG provides real data as context before generation.
So model answers based on retrieved information instead of guessing.

---

Q4: What are other techniques to reduce hallucination?

Answer:

* Better prompt design
* Use system instructions
* Limit output scope
* Use structured output
* Add validation layer
* Use multiple models (cross-checking)

---

Q5: How do you handle hallucination in production systems?

Answer:

* Use RAG for factual grounding
* Add confidence checks
* Log and monitor outputs
* Add human-in-loop for critical cases
* Use fallback responses if unsure

---

```
```
