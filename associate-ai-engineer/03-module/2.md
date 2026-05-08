
# Module 3 — RAG Systems  
# Topic: Chunking Strategies

---

## 1. Intuition

Chunking means breaking large documents into smaller pieces so that LLM can process them.

Simple idea:
- Big document → small chunks  
- Retrieve only useful chunks  

---

## 2. Core Concept

- Chunk = small part of document  
- Used because LLM has context limit  

Types of chunking:
- Fixed size chunking  
- Overlapping chunking  
- Semantic chunking  

---

## 3. Why / When to Use

- Documents are large  
- Context window is limited  
- Need accurate retrieval  

Important:
Bad chunking = bad RAG performance  

---

## 4. How It Works (Pipeline)

1. Load document  
2. Split into chunks  
3. (Optional) add overlap  
4. Generate embeddings for each chunk  
5. Store in vector DB  
6. Retrieve relevant chunks during query  

---

## 5. Code Skeleton

### Fixed Chunking
```python
def split_text(text, chunk_size=200):
    return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]
````

### Overlapping Chunking

```python id="j2k9rm"
def split_with_overlap(text, chunk_size=200, overlap=50):
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunks.append(text[i:i+chunk_size])
    return chunks
```

---

## 6. Example (Real System)

* Chat with PDF:
  Large PDF split into chunks → stored → retrieved

* Knowledge base:
  Each paragraph becomes a chunk

* Your system:
  Better chunking improves skill matching accuracy

---

## 7. Trade-offs

Small chunks:

* More precise retrieval

- May lose context

Large chunks:

* Better context

- Less precise

Overlapping chunks:

* Balance context and accuracy

- More storage

---

## 8. Interview Questions

* What is chunking?
* Why is chunking important in RAG?
* What is overlap in chunking?

---

## 9. Answer Framework

Start:
“Chunking means splitting documents into smaller parts”

Then:
“It helps fit data into LLM context window”

Then:
“Overlapping is used to preserve context”

Then:
“Chunking directly affects retrieval quality”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why is chunking important?

Answer:
Because LLM cannot process large documents at once.
Chunking ensures only relevant parts are used.

---

Q2: What is overlap in chunking?

Answer:
Overlap means repeating some text between chunks.
This preserves context across chunks.

---

Q3: How to choose chunk size?

Answer:
Depends on:

* Context window
* Type of data
* Use case

Typically:

* 200–500 tokens for most systems

---

Q4: What happens if chunking is poor?

Answer:
Relevant information may be split incorrectly.
This leads to poor retrieval and wrong answers.

---

Q5: What is semantic chunking?

Answer:
Instead of fixed size, text is split based on meaning.
Example: splitting by paragraphs or sections.

---

```
```
