
# Module 2 — LLM Core  
# Topic: Context Window & Limitations

---

## 1. Intuition

Context window is the amount of text (input + output) an LLM can handle at one time.

Simple idea:
- Model has limited memory  
- If input is too large → it forgets or ignores some part  

---

## 2. Core Concept

- Context window = maximum number of tokens model can process  
- Includes:
  - Input tokens (prompt + context)  
  - Output tokens (response)  

Example:
If model limit = 8000 tokens  
Input = 7000 tokens → Output can only be ~1000 tokens  

---

## 3. Why / When to Use

- Important in:
  - RAG systems  
  - Chat systems  
  - Long document processing  

- If context is too large:
  - Data gets truncated  
  - Important info may be lost  

Key Point:
Context window directly affects system design  

---

## 4. How It Works (Pipeline)

1. User sends input  
2. Input is tokenized  
3. Total tokens calculated  
4. If tokens > limit:
   - Truncate OR reject request  
5. Model processes within limit  
6. Output generated  

---

## 5. Code Skeleton

```python
from tiktoken import encoding_for_model

enc = encoding_for_model("gpt-4")

text = "This is a sample input"
tokens = enc.encode(text)

print("Token count:", len(tokens))
````

### Truncation Example

```python id="8kq2tp"
if len(tokens) > MAX_LIMIT:
    tokens = tokens[:MAX_LIMIT]
```

---

## 6. Example (Real System)

* Chatbot:
  Cannot remember very long conversations

* RAG system:
  Only limited chunks can be sent to LLM

* Your system:
  Must carefully select top relevant chunks

---

## 7. Trade-offs

Large Context:

* More information

- Higher cost
- Slower response

Small Context:

* Faster

- May miss important data

---

## 8. Interview Questions

* What is context window?
* What happens if limit exceeds?
* How do you handle long documents?

---

## 9. Answer Framework

Start:
“Context window is the maximum tokens an LLM can process”

Then:
“It includes both input and output tokens”

Then:
“If limit exceeds, input is truncated or request fails”

Then:
“In real systems, we optimize using chunking and retrieval”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: What happens when context window exceeds?

Answer:
Input is truncated or rejected.
Important information may be lost, leading to poor output.

---

Q2: How do you handle large documents?

Answer:

* Split into chunks
* Use embeddings
* Retrieve relevant chunks (RAG)
* Send only important data

---

Q3: Why not increase context window always?

Answer:
Larger context increases:

* Cost
* Latency
* Complexity

So it must be optimized, not maximized.

---

Q4: How does context window affect RAG?

Answer:
Only limited retrieved chunks can be passed to LLM.
So retrieval quality becomes very important.

---

Q5: How do you optimize context usage?

Answer:

* Remove unnecessary text
* Use summarization
* Use top-K retrieval
* Compress context

---

```
```
