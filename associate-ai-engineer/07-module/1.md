
# Module 7 — Real-Time AI Systems  
# Topic: Event-Driven AI Pipelines (Kafka)

---

## 1. Intuition

Event-driven system reacts to events instead of waiting for requests.

Simple idea:
- Event happens → system reacts automatically  

Example:
User uploads file → system processes → generates output  

---

## 2. Core Concept

- Event = something that happens (message, data change)  
- Producer = generates event  
- Consumer = processes event  

Kafka is used to:
- Handle real-time data streams  
- Decouple services  
- Process asynchronously  

---

## 3. Why / When to Use

- Real-time systems  
- High throughput systems  
- Asynchronous processing  

Examples:
- AI pipelines  
- Data processing systems  
- Notification systems  

---

## 4. How It Works (Pipeline)

1. Producer sends event to Kafka  
2. Kafka stores event in topic  
3. Consumer reads event  
4. Consumer processes event  
5. Output is generated  

---

## 5. Code Skeleton

### Producer
```python
producer.send("topic_name", value=data)
````

### Consumer

```python id="r5p9zt"
for message in consumer:
    process(message.value)
```

### AI Pipeline Example

```python id="x3k8nm"
def process_event(event):
    result = llm.generate(event)
    store_result(result)
```

---

## 6. Example (Real System)

* Chat system:
  User input → event → processed asynchronously

* Data pipeline:
  Stream data → process → store

* Your system:
  Kafka-based AI workflows for continuous processing

---

## 7. Trade-offs

Event-driven:

* Scalable
* Decoupled

- Complex

Synchronous:

* Simple

- Not scalable

---

## 8. Interview Questions

* What is event-driven architecture?
* Why use Kafka?
* How does it help AI systems?

---

## 9. Answer Framework

Start:
“Event-driven system processes events asynchronously”

Then:
“Kafka is used for streaming and decoupling services”

Then:
“It improves scalability and real-time processing”

Then:
“Used in AI pipelines for continuous data flow”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why use Kafka in AI systems?

Answer:
Kafka handles high-throughput data streams and enables asynchronous processing.
Useful for real-time AI pipelines.

---

Q2: What is producer and consumer?

Answer:
Producer sends data to Kafka.
Consumer reads and processes data.

---

Q3: What is topic in Kafka?

Answer:
A category where messages are stored.
Example: "user-queries", "processed-results"

---

Q4: How does Kafka improve scalability?

Answer:
It decouples services and allows multiple consumers to process data in parallel.

---

Q5: What are challenges in event-driven systems?

Answer:

* Debugging complexity
* Message ordering
* Failure handling

---

```
```
