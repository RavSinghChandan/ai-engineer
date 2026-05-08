
# Module 10 — Advanced Topics  
# Topic: Fine-tuning vs RAG

---

## 1. Intuition

Fine-tuning means training the model on your data.  
RAG means giving the model data at runtime.

Simple idea:
- Fine-tuning → model learns data  
- RAG → model reads data when needed  

---

## 2. Core Concept

Fine-tuning:
- Modify model weights  
- Train on custom dataset  
- Makes model specialized  

RAG:
- Keep model same  
- Retrieve relevant data  
- Provide context during query  

---

## 3. Why / When to Use

Use Fine-tuning:
- Fixed knowledge  
- Repetitive tasks  
- Style control  

Use RAG:
- Dynamic data  
- Large knowledge base  
- Frequently updated data  

---

## 4. How It Works (Pipeline)

### Fine-tuning:
1. Collect dataset  
2. Train model  
3. Deploy trained model  
4. Use for inference  

### RAG:
1. Store data as embeddings  
2. Retrieve relevant data  
3. Send to LLM  
4. Generate response  

---

## 5. Code Skeleton

### Fine-tuning (Concept)
```python
model.train(dataset)
````

### RAG

```python id="p5k3mz"
results = vector_db.search(embed(query))
response = llm.generate(results + query)
```

---

## 6. Example (Real System)

* Fine-tuning:
  Train model for specific domain

* RAG:
  Chat with company documents

* Your system:
  Uses RAG for dynamic knowledge

---

## 7. Trade-offs

Fine-tuning:

* Faster inference
* Specialized

- Expensive
- Hard to update

RAG:

* Flexible
* Easy to update

- Higher latency

---

## 8. Interview Questions

* Fine-tuning vs RAG?
* When to use each?
* Which is better?

---

## 9. Answer Framework

Start:
“Fine-tuning updates model, RAG uses external data”

Then:
“Fine-tuning is for fixed knowledge”

Then:
“RAG is for dynamic data”

Then:
“RAG is preferred in most real systems”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Which is better, fine-tuning or RAG?

Answer:
Depends on use case.
RAG is better for dynamic data.
Fine-tuning is better for fixed patterns or style.

---

Q2: Why is RAG more popular?

Answer:
Because it is flexible and does not require retraining.
Data can be updated easily.

---

Q3: What are limitations of fine-tuning?

Answer:

* Expensive
* Time-consuming
* Hard to update

---

Q4: Can we combine both?

Answer:
Yes.
Fine-tune for behavior and use RAG for knowledge.

---

Q5: When would you choose fine-tuning?

Answer:
When task is repetitive and requires consistent behavior.
Example: classification or style-specific output

---

```
```
