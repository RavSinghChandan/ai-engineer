
# Module 8 — Frameworks & Tools  
# Topic: LangChain (When to Use / When NOT to Use)

---

## 1. Intuition

LangChain is a framework that helps build LLM applications faster by providing ready components.

Simple idea:
- Instead of building everything from scratch → use LangChain blocks  

---

## 2. Core Concept

LangChain provides:
- Prompt templates  
- Chains (sequence of steps)  
- Memory  
- Tool integration  
- RAG utilities  

It acts as a **wrapper around LLM + tools + workflows**

---

## 3. Why / When to Use

Use LangChain:
- Rapid prototyping  
- Standard RAG pipelines  
- Simple agent systems  

Do NOT use LangChain:
- When you need full control  
- High-performance production systems  
- Custom optimized pipelines  

---

## 4. How It Works (Pipeline)

1. Define prompt  
2. Create chain  
3. Add tools or retriever  
4. Execute chain  
5. Get response  

---

## 5. Code Skeleton

### Basic Chain
```python
from langchain.llms import OpenAI

llm = OpenAI()

response = llm("Explain AI")
````

### RAG with LangChain

```python id="k9m3qt"
retriever = vector_db.as_retriever()

docs = retriever.get_relevant_documents(query)

response = llm(docs + query)
```

### Agent Example

```python id="z5p2nx"
agent = create_agent(tools, llm)

response = agent.run(user_query)
```

---

## 6. Example (Real System)

* Chatbot:
  Uses LangChain for quick setup

* RAG system:
  Uses built-in retrievers

* Your system:
  Could use LangChain initially, then optimize manually

---

## 7. Trade-offs

LangChain:

* Fast development
* Easy integration

- Less control
- Overhead

Custom Implementation:

* Full control
* Better performance

- More effort

---

## 8. Interview Questions

* What is LangChain?
* When to use LangChain?
* What are limitations of LangChain?

---

## 9. Answer Framework

Start:
“LangChain is a framework for building LLM applications”

Then:
“It provides chains, tools, and integrations”

Then:
“It is useful for prototyping”

Then:
“But for production, custom solutions may be better”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why not always use LangChain?

Answer:
It adds abstraction and overhead.
For high-performance systems, custom implementation is better.

---

Q2: What are chains in LangChain?

Answer:
Sequence of steps where output of one step becomes input of next.

---

Q3: What is retriever in LangChain?

Answer:
Component that fetches relevant documents for RAG.

---

Q4: What is limitation of LangChain?

Answer:

* Less control
* Performance overhead
* Debugging complexity

---

Q5: When would you replace LangChain?

Answer:
When system needs:

* High performance
* Custom optimization
* Better scalability

---

```
```
