
# Module 7 — Real-Time AI Systems  
# Topic: Async Processing & Queue-Based LLM Workflows

---

## 1. Intuition

Async processing means tasks run in background without blocking user request.

Simple idea:
- User sends request → system responds quickly → heavy work runs in background  

---

## 2. Core Concept

- Synchronous:
  Request waits until full processing is done  

- Asynchronous:
  Request is accepted → processed later  

Queue-based system:
- Task added to queue  
- Worker processes task  

Common tools:
- Kafka  
- RabbitMQ  
- Redis Queue  

---

## 3. Why / When to Use

- Long-running tasks  
- High traffic systems  
- LLM pipelines (slow operations)  

Examples:
- Document processing  
- Batch inference  
- AI pipelines  

---

## 4. How It Works (Pipeline)

1. User sends request  
2. Request added to queue  
3. Worker picks task  
4. Worker processes using LLM  
5. Result stored or returned  
6. User gets response later  

---

## 5. Code Skeleton

### Add Task to Queue
```python
queue.append(user_request)
````

### Worker Processing

```python id="n6p2zr"
while queue:
    task = queue.pop(0)
    result = llm.generate(task)
    store_result(result)
```

### Async Example

```python id="x9m5kt"
import asyncio

async def process_task(task):
    return llm.generate(task)

asyncio.run(process_task("Explain AI"))
```

---

## 6. Example (Real System)

* Chat system:
  Quick response → background processing

* Document analysis:
  Upload → process later → notify user

* Your system:
  Kafka-based async pipelines for AI workflows

---

## 7. Trade-offs

Async:

* Scalable
* Non-blocking

- Complex

Sync:

* Simple

- Slow for heavy tasks

---

## 8. Interview Questions

* What is async processing?
* Why use queues?
* Difference between sync and async?

---

## 9. Answer Framework

Start:
“Async processing runs tasks in background”

Then:
“Queues store tasks and workers process them”

Then:
“It improves scalability and performance”

Then:
“Used in LLM pipelines for heavy operations”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why use async in LLM systems?

Answer:
LLM calls are slow.
Async processing prevents blocking and improves user experience.

---

Q2: What is queue-based system?

Answer:
Tasks are added to a queue and processed by workers asynchronously.

---

Q3: How do you ensure reliability?

Answer:

* Retry logic
* Dead-letter queues
* Monitoring

---

Q4: What is dead-letter queue?

Answer:
Queue for failed tasks that could not be processed.
Used for debugging and retries.

---

Q5: When not to use async?

Answer:

* Simple or fast operations
* When immediate response is required

---

```
```
