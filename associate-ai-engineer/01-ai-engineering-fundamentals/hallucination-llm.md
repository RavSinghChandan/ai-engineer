
# Module 1 — AI Engineering Fundamentals  
# Topic: Hallucination (LLM)

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
LLM is a text generator, not a fact checker  

---

## 5. Code Skeleton

### Basic LLM Call
```python
response = llm.generate("Who is the president of Mars?")
print(response)
````

### With RAG (Reduce Hallucination)

```python
docs = vector_db.search(user_query)

context = combine(docs)

response = llm.generate(context + user_query)
```

### With Guard Check

```python
if "I don't know" in response:
    return "No reliable answer found"
```

---

## 6. Example (Real System)

* Without RAG:
  Chatbot gives wrong answer about company policy

* With RAG:
  Chatbot retrieves correct document and answers accurately

* Multi-agent system:
  Different agents validate and refine answers

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

````

---

```md id="t5n9qp"
# Module 2 — LLM Core  
# Topic: Tokenization

---

## 1. Intuition

Tokenization means breaking text into smaller pieces (tokens) so that the model can understand it.

Simple idea:
- Sentence → words/subwords → tokens  

Example:
“I love AI” → ["I", "love", "AI"]

---

## 2. Core Concept

LLMs do not understand raw text.  
They convert text into tokens (numbers) before processing.

- Token = smallest unit processed by model  
- Tokens can be:
  - Words  
  - Subwords  
  - Characters  

Example:
“unbelievable” → ["un", "believ", "able"]

---

## 3. Why / When to Use

- Needed for all LLM operations  
- Impacts:
  - Cost (more tokens = more cost)  
  - Performance  
  - Context size  

Important:
Efficient token usage = better system design  

---

## 4. How It Works (Pipeline)

1. Input text given  
2. Tokenizer splits text into tokens  
3. Tokens converted to numbers (IDs)  
4. Model processes token IDs  
5. Output tokens converted back to text  

---

## 5. Code Skeleton

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

text = "I love AI"

tokens = tokenizer.tokenize(text)
token_ids = tokenizer.encode(text)

print(tokens)
print(token_ids)
````

---

## 6. Example (Real System)

* ChatGPT:
  Converts your prompt into tokens before processing

* RAG system:
  Token limit affects how much context you can send

---

## 7. Trade-offs

Small tokens:

* Better understanding

- More tokens → higher cost

Large tokens:

* Lower cost

- May reduce accuracy

---

## 8. Interview Questions

* What is tokenization?
* Why is tokenization important?
* What is token limit?

---

## 9. Answer Framework

Start:
“Tokenization is the process of converting text into tokens”

Then:
“These tokens are converted into numbers for model processing”

Then:
“It impacts cost, performance, and context size”

---

## 10. Advanced Follow-ups (WITH ANSWERS)

Q1: Why do LLMs use tokens instead of words?

Answer:
Because tokens allow better flexibility.
They can represent words, subwords, and unknown words efficiently.

---

Q2: What is token limit?

Answer:
Maximum number of tokens a model can process in one request.
Example: GPT-4 has a fixed context window.

---

Q3: How does tokenization affect cost?

Answer:
Cost is based on number of tokens processed.
More tokens = higher cost.

---

Q4: What happens if token limit exceeds?

Answer:
Input gets truncated or request fails.
Important data may be lost.

---

Q5: How to optimize token usage?

Answer:

* Remove unnecessary text
* Use smaller prompts
* Chunk data properly
* Use summarization

---

```
```
