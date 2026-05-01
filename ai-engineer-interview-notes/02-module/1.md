
# Module 2 — LLM Core  
# Topic: Prompt Engineering

---

## 1. Intuition

Prompt engineering means writing better instructions so that the model gives better output.

Simple idea:
- Better input → Better output  

LLM is like a smart assistant:
- If you ask clearly → you get correct answer  
- If you ask vaguely → you get poor answer  

---

## 2. Core Concept

Prompt = Input given to LLM  

Prompt Engineering = Designing input in a way that:
- Improves accuracy  
- Reduces hallucination  
- Controls output format  

Types of prompting:
- Zero-shot → No examples  
- Few-shot → Provide examples  
- Chain of Thought (CoT) → Ask model to think step-by-step  

---

## 3. Why / When to Use

- When output quality is poor  
- When you need structured output  
- When reducing hallucination  
- When guiding model behavior  

Important:
Good prompt can replace fine-tuning in many cases  

---

## 4. How It Works (Pipeline)

1. User writes prompt  
2. Prompt is sent to LLM  
3. Model interprets instruction  
4. Generates response based on prompt clarity  
5. Output quality depends on prompt design  

Key Insight:
LLM behavior = Prompt dependent  

---

## 5. Code Skeleton

### Basic Prompt
```python
response = llm.generate("Explain AI")
````

### Structured Prompt

```python
response = llm.generate("""
Explain AI in simple terms.
Give answer in 3 bullet points.
""")
```

### Few-shot Prompt

```python
response = llm.generate("""
Q: What is 2+2?
A: 4

Q: What is 3+3?
A: 6

Q: What is 5+5?
A:
""")
```

### Chain of Thought

```python
response = llm.generate("""
Solve step by step:
What is 12 * 15?
""")
```

---

## 6. Example (Real System)

* Chatbot:
  Uses system prompt to define tone and behavior

* RAG system:
  Uses prompt to combine context + query

* Your system:
  Multi-agent prompts define role of each agent

---

## 7. Trade-offs

Simple Prompt:

* Easy

- Less accurate

Complex Prompt:

* Better output

- More tokens (cost)

Few-shot:

* High accuracy

- Increases context size

---

## 8. Interview Questions

* What is prompt engineering?
* What is few-shot vs zero-shot?
* What is Chain of Thought?
* How do you improve prompt quality?

---

## 9. Answer Framework

Start:
“Prompt engineering is designing input to improve LLM output”

Then:
“We use techniques like zero-shot, few-shot, and chain of thought”

Then:
“It helps improve accuracy and reduce hallucination”

Then:
“In production, prompts are carefully designed and tested”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What is zero-shot vs few-shot prompting?

Answer:
Zero-shot means no examples are given.
Few-shot means examples are provided to guide the model.
Few-shot usually gives better results.

---

Q2: What is Chain of Thought?

Answer:
It is a technique where model is asked to think step-by-step.
This improves reasoning and accuracy.

---

Q3: How do you improve prompts?

Answer:

* Make instructions clear
* Define output format
* Add examples
* Use step-by-step reasoning
* Add constraints

---

Q4: Can prompt engineering replace fine-tuning?

Answer:
In many cases, yes.
Prompting is faster and cheaper than fine-tuning, but not always sufficient for complex tasks.

---

Q5: What are system prompts?

Answer:
System prompts define behavior of model.
Example: “You are a helpful assistant”
They control tone, style, and rules of response.

---

```
```
