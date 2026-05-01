
# Module 8 — Frameworks & Tools  
# Topic: OpenAI API (Behavior, Limits, Best Practices)

---

## 1. Intuition

OpenAI API lets your backend talk to powerful LLMs.

Simple idea:
- You send prompt → API processes → returns response  

---

## 2. Core Concept

- API = interface to interact with LLM  
- You send:
  - Model name  
  - Messages (prompt)  
- You receive:
  - Generated response  

Key parameters:
- model  
- messages  
- temperature  
- max_tokens  

---

## 3. Why / When to Use

- Chatbots  
- AI assistants  
- RAG systems  
- Backend AI services  

Important:
You don’t host model → you call API  

---

## 4. How It Works (Pipeline)

1. User input  
2. Backend sends API request  
3. API processes prompt  
4. Model generates output  
5. Response returned to backend  
6. Backend sends to user  

---

## 5. Code Skeleton

```python
from openai import OpenAI

client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "Explain AI"}
    ],
    temperature=0.7,
    max_tokens=200
)

print(response.choices[0].message.content)
````

---

## 6. Example (Real System)

* Chatbot backend
* Document Q&A system
* Your system:
  AI microservices calling OpenAI API

---

## 7. Trade-offs

API Usage:

* Easy to use
* No infrastructure

- Cost
- Dependency on provider

Self-hosting:

* Full control

- Complex
- Expensive setup

---

## 8. Interview Questions

* How do you use OpenAI API?
* What parameters affect output?
* What are limitations?

---

## 9. Answer Framework

Start:
“OpenAI API allows interaction with LLM through HTTP requests”

Then:
“We send prompts and receive generated responses”

Then:
“Parameters like temperature control output”

Then:
“It is used in production AI systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What is temperature?

Answer:
Controls randomness of output.
Low temperature = more deterministic
High temperature = more creative

---

Q2: What is max_tokens?

Answer:
Maximum number of tokens in response.
Controls length and cost.

---

Q3: What are API limits?

Answer:

* Rate limits (requests per minute)
* Token limits (context size)

---

Q4: How do you handle API failures?

Answer:

* Retry logic
* Fallback responses
* Logging

---

Q5: How do you optimize API usage?

Answer:

* Reduce tokens
* Cache responses
* Use smaller models
* Batch requests

---

```
```
