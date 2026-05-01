
# Module 6 — MLOps for LLMs  
# Topic: Model Serving (API Layer)

---

## 1. Intuition

Model serving means making your AI model available through an API so applications can use it.

Simple idea:
- Model is built → expose it via API → users send requests → get response  

---

## 2. Core Concept

- Model serving = deployment layer for AI models  
- It handles:
  - Requests  
  - Model inference  
  - Responses  

Common approaches:
- REST API  
- gRPC  
- Streaming APIs  

---

## 3. Why / When to Use

- Production systems  
- Backend integration  
- Microservices architecture  

Important:
Without serving, model cannot be used in real applications  

---

## 4. How It Works (Pipeline)

1. Client sends request  
2. API receives request  
3. Request is validated  
4. Model processes input  
5. Response is generated  
6. API sends response back  

---

## 5. Code Skeleton

### FastAPI Example
```python
from fastapi import FastAPI

app = FastAPI()

@app.post("/predict")
def predict(input_text: str):
    result = llm.generate(input_text)
    return {"response": result}
````

### Spring Boot Example (Java)

```java
@RestController
public class AIController {

    @PostMapping("/predict")
    public String predict(@RequestBody String input) {
        return llmService.generate(input);
    }
}
```

---

## 6. Example (Real System)

* Chatbot backend
* AI microservices
* Your system:
  LLM integrated with Spring Boot services

---

## 7. Trade-offs

REST API:

* Simple

- Slightly slower

gRPC:

* Faster

- More complex

Streaming API:

* Better UX

- Harder to implement

---

## 8. Interview Questions

* What is model serving?
* How do you deploy LLM?
* What are API approaches?

---

## 9. Answer Framework

Start:
“Model serving exposes AI model through APIs”

Then:
“It handles request, inference, and response”

Then:
“Used in production systems and microservices”

Then:
“Common approaches are REST and gRPC”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: How do you scale model serving?

Answer:

* Use load balancing
* Deploy multiple instances
* Use containerization (Docker/Kubernetes)

---

Q2: What are challenges in model serving?

Answer:

* High latency
* Scaling
* Cost
* Monitoring

---

Q3: What is stateless API?

Answer:
Each request is independent.
No memory of previous requests is stored.

---

Q4: How do you handle high traffic?

Answer:

* Load balancing
* Auto-scaling
* Caching responses

---

Q5: How do you integrate LLM with backend?

Answer:
Use API layer to connect frontend/backend with LLM service.
Example: Spring Boot calling OpenAI API

---

```
```
