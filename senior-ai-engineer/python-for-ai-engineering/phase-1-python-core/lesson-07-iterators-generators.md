# Python for AI Engineering — Phase 1
# Lesson 7: Iterators + Generators

---

## 1. Intuition (Java Anchor)

Java `Iterator<T>`: `hasNext()` + `next()` — explicit two-method protocol.
Java `Stream<T>` (lazy): elements computed on demand, not all at once.

Python unifies both into one simple protocol: `__iter__` + `__next__`.
`yield` turns any function into a lazy stream — no `Stream.generate()`, no `Spliterator`.

This is critical for AI engineering: LLM token streaming, lazy chunk loading, memory-efficient batch processing — all use generators.

---

## 2. Iterable vs Iterator

```python
# Iterable: has __iter__() — can be looped
# Iterator: has __iter__() + __next__() — produces values one at a time

# Java: Iterable<T> has iterator() method
#       Iterator<T> has hasNext() and next()

# Everything you loop over in Python is an Iterable:
for x in [1, 2, 3]:      # list is iterable
    pass
for c in "hello":         # string is iterable
    pass
for k in {"a": 1}:        # dict is iterable (over keys)
    pass

# Getting an iterator manually (like Java's .iterator()):
my_list = [1, 2, 3]
it = iter(my_list)        # calls __iter__() — returns an iterator

print(next(it))   # 1 — calls __next__()
print(next(it))   # 2
print(next(it))   # 3
print(next(it))   # StopIteration — Java: hasNext() would return false

# For loop is just syntactic sugar for iter() + next() + StopIteration catch
```

---

## 3. Custom Iterator (Java: Implement Iterator Interface)

```python
# Java:
# class Range implements Iterator<Integer> {
#     public boolean hasNext() { ... }
#     public Integer next() { ... }
# }

# Python — implement __iter__ + __next__ on a class:
class ChunkIterator:
    """Iterates over document chunks one at a time."""
    def __init__(self, text: str, chunk_size: int = 512):
        self.chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]
        self.index = 0

    def __iter__(self):
        return self           # iterator returns itself

    def __next__(self):
        if self.index >= len(self.chunks):
            raise StopIteration
        chunk = self.chunks[self.index]
        self.index += 1
        return chunk

# Usage — works in for loops, list(), zip(), etc.:
for chunk in ChunkIterator("long document text...", chunk_size=100):
    embeddings.append(embed(chunk))
```

---

## 4. Generators — `yield` (Java: No Direct Equivalent)

```python
# A generator function uses 'yield' instead of 'return'
# Each call to next() runs until the next 'yield', then PAUSES
# State is preserved between calls — no class needed

# Java closest: implement Iterator manually (verbose)
# Python: just use yield

def chunk_text(text: str, size: int = 512):
    """Generator: yields one chunk at a time — never loads all in memory."""
    for i in range(0, len(text), size):
        yield text[i:i + size]    # pause here, return this value, resume next call

# Returns a generator object — no chunks computed yet (lazy)
chunks = chunk_text(huge_document, size=512)

# Values computed one at a time on demand:
for chunk in chunks:
    process(chunk)     # only one chunk in memory at a time

# Compare with eager (list) approach:
# chunks = [text[i:i+512] for i in range(0, len(text), 512)]
# All chunks in memory at once — bad for large documents
```

---

## 5. Generator Expressions (Like List Comprehension but Lazy)

```python
# List comprehension — eager, all in memory:
squares = [x**2 for x in range(1_000_000)]   # 1M ints in memory NOW

# Generator expression — lazy, one at a time:
squares = (x**2 for x in range(1_000_000))   # nothing computed yet
# Note: () not [] — that's the only difference in syntax

# Same usage in for loops:
for sq in squares:
    process(sq)      # one value at a time, constant memory

# sum, min, max, any, all work on generators:
total = sum(x**2 for x in range(1_000_000))  # never stores all in memory

# Java: IntStream.range(0, 1_000_000).map(x -> x*x).sum()
# Same idea — lazy evaluation — but Python syntax is simpler
```

---

## 6. `yield` with State — Stateful Generators

```python
def token_counter(tokens):
    """Generator that also tracks running total."""
    running_total = 0
    for token in tokens:
        running_total += 1
        yield token, running_total   # yield multiple values as tuple

for token, count in token_counter(llm_output_tokens):
    print(f"Token {count}: {token}")

# Infinite generator (Java: while(true) with iterator)
def id_generator(prefix: str = "chunk"):
    n = 0
    while True:
        yield f"{prefix}_{n}"
        n += 1

ids = id_generator("doc")
next(ids)    # "doc_0"
next(ids)    # "doc_1"
next(ids)    # "doc_2"
```

---

## 7. LLM Token Streaming — The Core AI Engineering Use Case

```python
# OpenAI streaming returns a generator of token chunks
# Without generators: you'd buffer the whole response, then show it
# With generators: you show each token as it arrives — streaming UX

def stream_llm(prompt: str):
    """Generator that yields tokens as they arrive from the LLM."""
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        stream=True    # enables streaming
    )
    for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta    # yield each token as it arrives

# FastAPI SSE endpoint using a generator:
from fastapi.responses import StreamingResponse

@app.get("/stream")
async def stream_endpoint(query: str):
    async def token_stream():
        for token in stream_llm(query):
            yield f"data: {token}\n\n"   # SSE format
    return StreamingResponse(token_stream(), media_type="text/event-stream")
```

---

## 8. Pipeline with Generators (Lazy Data Pipeline)

```python
# Each step is a generator — data flows through without loading everything
# Java: Stream.of(...).filter().map().forEach() — same concept

def read_cvs(file_paths):
    """Lazy reader — yields one CV text at a time."""
    for path in file_paths:
        with open(path) as f:
            yield f.read()

def clean_text(texts):
    """Lazy cleaner — yields cleaned text."""
    for text in texts:
        yield text.strip().lower()

def chunk_texts(texts, size=512):
    """Lazy chunker — yields chunks."""
    for text in texts:
        for i in range(0, len(text), size):
            yield text[i:i+size]

# Build pipeline — nothing runs yet:
cv_paths = get_all_cv_paths()
pipeline = chunk_texts(clean_text(read_cvs(cv_paths)))

# Data flows lazily through all stages:
for chunk in pipeline:
    embedding = embed(chunk)    # only one chunk in memory at a time
    vector_db.upsert(embedding)

# Java equivalent: Files.lines().filter().map().flatMap().forEach()
# Python is more explicit — each stage is a named generator function
```

---

## 9. `itertools` — Production Iterator Utilities

```python
import itertools

# islice — take first N from any iterator (like Java Stream.limit())
first_10 = list(itertools.islice(big_generator(), 10))

# chain — concatenate iterables (like Java Stream.concat())
all_chunks = itertools.chain(faiss_chunks, bm25_chunks)
for chunk in all_chunks:
    rerank(chunk)

# batched (Python 3.12+) — process in batches
# Before 3.12, implement manually:
def batched(iterable, n):
    it = iter(iterable)
    while batch := list(itertools.islice(it, n)):
        yield batch

for batch in batched(all_embeddings, 100):
    vector_db.upsert_batch(batch)    # 100 at a time

# cycle — round-robin (useful for load balancing LLM providers)
providers = itertools.cycle(["openai", "anthropic", "deepseek"])
for query in queries:
    provider = next(providers)   # alternates round-robin
    call_llm(query, provider=provider)
```

---

## 10. Interview Anchor

**"How do you handle LLM token streaming in a Python API?"**

Say:
> "Generators. The OpenAI streaming response is itself a generator — it yields token chunks as they arrive. I wrap it in an async generator function and return a FastAPI `StreamingResponse` with `media_type='text/event-stream'` for Server-Sent Events. The key Python concept is that a function with `yield` is lazy — it doesn't run until you consume it. The HTTP client sees tokens arriving in real time, not buffered. This is the same as Java's reactive streams — `Flux<String>` in Spring WebFlux — but Python's generator syntax is much simpler: just `yield token` inside the for loop."

---

## 11. Quick Reference

```python
# Iterable protocol
it = iter(collection)       # get iterator
val = next(it)              # get next value (StopIteration when done)

# Generator function
def gen():
    yield value1
    yield value2

# Generator expression (lazy list comprehension)
gen = (expr for x in iterable)

# Common patterns
chunks = chunk_text(doc, 512)          # lazy chunking
tokens = stream_llm(prompt)            # lazy token stream
pipeline = stage3(stage2(stage1(src))) # lazy pipeline

# itertools
itertools.islice(gen, n)               # take first n
itertools.chain(gen1, gen2)            # concatenate
itertools.cycle(["a","b","c"])         # infinite round-robin

# Java comparison
# yield          →  reactive Publisher / Iterator manual impl
# generator expr →  Stream.generate() / lazy stream
# chain          →  Stream.concat()
# islice         →  Stream.limit()
```
